"""Coastal architecture, bridge, and dock generators matching reference artwork."""

from __future__ import annotations

import math

from collections import defaultdict

import bpy

from common.geometry import (
    add_beam,
    add_box,
    add_collision_primitives,
    add_cone,
    add_cylinder,
    add_ico,
    add_limb_tube,
    add_marker,
    add_ring,
    seeded_rng,
    add_tri_prism,
    join_meshes,
)
from common.authored import (
    add_banded_tapered_tower,
    add_catenary_rope,
    add_cylindrical_masonry,
    add_fasteners,
    add_masonry_courses,
    add_mooring_cleat,
    add_mullioned_window,
    add_plank_field,
    add_profiled_vessel,
    add_timber_corner_frame,
)
from common.lod import consolidate_lod_level, create_lod_roots


def _add_rect_brace(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    thickness: float,
    depth: float,
    token: str,
    root,
    *,
    plane: str,
    bevel: float = 0.012,
) -> None:
    """Add a square-sawn diagonal brace rather than a cylindrical pole."""
    sx, sy, sz = start
    ex, ey, ez = end
    if plane == "xz":
        dx, dz = ex - sx, ez - sz
        length = math.hypot(dx, dz)
        rotation = (0.0, -math.atan2(dz, dx), 0.0)
        dimensions = (length, depth, thickness)
    elif plane == "yz":
        dy, dz = ey - sy, ez - sz
        length = math.hypot(dy, dz)
        rotation = (math.atan2(dz, dy), 0.0, 0.0)
        dimensions = (depth, length, thickness)
    else:
        raise ValueError(f"Unsupported brace plane: {plane}")
    add_box(
        name,
        ((sx + ex) * 0.5, (sy + ey) * 0.5, (sz + ez) * 0.5),
        dimensions,
        token,
        root,
        rotation=rotation,
        bevel=bevel,
    )


def _add_daub_infill(
    name: str,
    location: tuple[float, float, float],
    dimensions: tuple[float, float, float],
    token: str,
    root,
    *,
    face_axis: str,
    face_sign: int,
) -> None:
    """Recessed lime panel plus a proud pillow so plaster reads as trowelled daub."""
    add_box(name, location, dimensions, token, root, bevel=0.028)
    lx, ly, lz = location
    dx, dy, dz = dimensions
    proud = 0.028 * face_sign
    if face_axis == "y":
        add_box(
            f"{name}_pillow",
            (lx, ly + proud, lz + dz * 0.02),
            (dx * 0.70, 0.07, dz * 0.58),
            token,
            root,
            bevel=0.016,
        )
        add_box(
            f"{name}_trowel",
            (lx, ly + proud * 1.2, lz - dz * 0.14),
            (dx * 0.52, 0.05, 0.06),
            token,
            root,
            bevel=0.008,
        )
    else:
        add_box(
            f"{name}_pillow",
            (lx + proud, ly, lz + dz * 0.02),
            (0.07, dy * 0.70, dz * 0.58),
            token,
            root,
            bevel=0.016,
        )
        add_box(
            f"{name}_trowel",
            (lx + proud * 1.2, ly, lz - dz * 0.14),
            (0.05, dy * 0.52, 0.06),
            token,
            root,
            bevel=0.008,
        )


def _add_framed_infill_volume(
    prefix: str,
    width: float,
    depth: float,
    wall_base: float,
    wall_height: float,
    infill_token: str,
    timber_token: str,
    dark_token: str,
    root,
    *,
    detail: bool,
    seed: int,
    front_bays: int = 4,
    side_bays: int = 3,
    panel_rows: int = 2,
    open_front: bool = False,
    daub_texture: bool = False,
) -> None:
    """Build lime infill as recessed panels inside an unmistakable timber frame.

    Traditional character comes from the construction hierarchy: a dark inner
    shell, heavy posts and plates, small imperfect infill panels, and square-sawn
    braces. The plaster never owns an uninterrupted building-sized plane.
    """
    wall_cz = wall_base + wall_height * 0.5
    wall_top = wall_base + wall_height
    if not detail:
        if open_front:
            add_box(f"{prefix}_wall_back", (0, depth * 0.5 - 0.10, wall_cz), (width, 0.20, wall_height), infill_token, root, bevel=0.015)
            for side, name in ((-1, "left"), (1, "right")):
                add_box(f"{prefix}_wall_{name}", (side * (width * 0.5 - 0.10), 0, wall_cz), (0.20, depth, wall_height), infill_token, root, bevel=0.015)
        else:
            add_box(f"{prefix}_wall_core", (0, 0, wall_cz), (width, depth, wall_height), infill_token, root, bevel=0.02)
        add_timber_corner_frame(prefix, width, depth, wall_base, wall_height, dark_token, root, post_w=0.22)
        return

    rng = seeded_rng(seed)
    post_w = 0.29
    rail_h = 0.17
    frame_depth = 0.15
    core_inset = 0.15
    if open_front:
        add_box(
            f"{prefix}_inner_back",
            (0, depth * 0.5 - core_inset * 0.5, wall_cz),
            (width - core_inset * 1.4, core_inset, wall_height - 0.12),
            dark_token,
            root,
            bevel=0.015,
        )
        for side, name in ((-1, "left"), (1, "right")):
            add_box(
                f"{prefix}_inner_{name}",
                (side * (width * 0.5 - core_inset * 0.5), 0, wall_cz),
                (core_inset, depth - core_inset * 1.4, wall_height - 0.12),
                dark_token,
                root,
                bevel=0.015,
            )
    else:
        add_box(
            f"{prefix}_inner_shell",
            (0, 0, wall_cz),
            (width - core_inset * 2.0, depth - core_inset * 2.0, wall_height - 0.12),
            dark_token,
            root,
            bevel=0.015,
        )

    # Corner structure and continuous sill/plate lines.
    for x_index, x in enumerate((-width * 0.5 + post_w * 0.45, width * 0.5 - post_w * 0.45)):
        for y_index, y in enumerate((-depth * 0.5 + post_w * 0.45, depth * 0.5 - post_w * 0.45)):
            add_box(
                f"{prefix}_corner_{x_index}_{y_index}",
                (x, y, wall_cz),
                (post_w, post_w, wall_height + 0.08),
                dark_token,
                root,
                rotation=(rng.uniform(-0.006, 0.006), rng.uniform(-0.006, 0.006), rng.uniform(-0.007, 0.007)),
                bevel=0.018,
            )
    for y_sign, name in ((-1, "front"), (1, "back")):
        y = y_sign * (depth * 0.5 - 0.045)
        add_box(f"{prefix}_sill_{name}", (0, y, wall_base + 0.12), (width - 0.12, frame_depth, 0.22), dark_token, root, bevel=0.014)
        add_box(f"{prefix}_plate_{name}", (0, y, wall_top - 0.10), (width + 0.08, frame_depth, 0.22), timber_token, root, bevel=0.014)
    for x_sign, name in ((-1, "left"), (1, "right")):
        x = x_sign * (width * 0.5 - 0.045)
        add_box(f"{prefix}_sill_{name}", (x, 0, wall_base + 0.12), (frame_depth, depth - 0.12, 0.22), dark_token, root, bevel=0.014)
        add_box(f"{prefix}_plate_{name}", (x, 0, wall_top - 0.10), (frame_depth, depth + 0.08, 0.22), timber_token, root, bevel=0.014)

    usable_h = wall_height - 0.38
    row_h = usable_h / panel_rows
    front_panel_y = depth * 0.5 - 0.075
    side_panel_x = width * 0.5 - 0.075

    # Front and rear panel bays. The front can remain open for a market hall.
    for y_sign, face_name in ((-1, "front"), (1, "back")):
        if open_front and y_sign < 0:
            continue
        y = y_sign * front_panel_y
        bay_w = (width - post_w * 1.6) / front_bays
        for bay in range(front_bays):
            x = -width * 0.5 + post_w * 0.8 + bay_w * (bay + 0.5)
            for row in range(panel_rows):
                z = wall_base + 0.19 + row_h * (row + 0.5)
                panel_name = f"{prefix}_infill_{face_name}_{bay:02d}_{row:02d}"
                if daub_texture:
                    _add_daub_infill(
                        panel_name,
                        (x, y, z),
                        (bay_w - 0.14, 0.095, row_h - 0.14),
                        infill_token,
                        root,
                        face_axis="y",
                        face_sign=y_sign,
                    )
                else:
                    add_box(
                        panel_name,
                        (x, y, z + rng.uniform(-0.012, 0.012)),
                        (bay_w - 0.14, 0.095, row_h - 0.14),
                        infill_token,
                        root,
                        rotation=(rng.uniform(-0.005, 0.005), 0, rng.uniform(-0.008, 0.008)),
                        bevel=0.028,
                    )
        for bay in range(1, front_bays):
            x = -width * 0.5 + post_w * 0.8 + bay_w * bay
            add_box(f"{prefix}_stud_{face_name}_{bay:02d}", (x, y - y_sign * 0.018, wall_cz), (0.17, frame_depth, wall_height - 0.14), dark_token, root, bevel=0.012)
        for row in range(1, panel_rows):
            z = wall_base + 0.19 + row_h * row
            add_box(f"{prefix}_rail_{face_name}_{row:02d}", (0, y - y_sign * 0.018, z), (width - 0.32, frame_depth, rail_h), timber_token, root, bevel=0.012)

        # Two corner braces make the load path legible without filling every bay.
        brace_y = y - y_sign * 0.055
        brace_z0 = wall_base + 0.30
        brace_z1 = wall_top - 0.30
        inset_x = width * 0.5 - post_w * 0.82
        _add_rect_brace(
            f"{prefix}_brace_{face_name}_left",
            (-inset_x, brace_y, brace_z0),
            (-inset_x + bay_w * 0.82, brace_y, brace_z1),
            0.15,
            frame_depth,
            dark_token,
            root,
            plane="xz",
        )
        _add_rect_brace(
            f"{prefix}_brace_{face_name}_right",
            (inset_x, brace_y, brace_z0),
            (inset_x - bay_w * 0.82, brace_y, brace_z1),
            0.15,
            frame_depth,
            dark_token,
            root,
            plane="xz",
        )

    # Side panel bays and braces.
    for x_sign, face_name in ((-1, "left"), (1, "right")):
        x = x_sign * side_panel_x
        bay_d = (depth - post_w * 1.6) / side_bays
        for bay in range(side_bays):
            y = -depth * 0.5 + post_w * 0.8 + bay_d * (bay + 0.5)
            for row in range(panel_rows):
                z = wall_base + 0.19 + row_h * (row + 0.5)
                panel_name = f"{prefix}_infill_{face_name}_{bay:02d}_{row:02d}"
                if daub_texture:
                    _add_daub_infill(
                        panel_name,
                        (x, y, z),
                        (0.095, bay_d - 0.14, row_h - 0.14),
                        infill_token,
                        root,
                        face_axis="x",
                        face_sign=x_sign,
                    )
                else:
                    add_box(
                        panel_name,
                        (x, y, z + rng.uniform(-0.012, 0.012)),
                        (0.095, bay_d - 0.14, row_h - 0.14),
                        infill_token,
                        root,
                        rotation=(0, rng.uniform(-0.005, 0.005), rng.uniform(-0.008, 0.008)),
                        bevel=0.028,
                    )
        for bay in range(1, side_bays):
            y = -depth * 0.5 + post_w * 0.8 + bay_d * bay
            add_box(f"{prefix}_stud_{face_name}_{bay:02d}", (x - x_sign * 0.018, y, wall_cz), (frame_depth, 0.17, wall_height - 0.14), dark_token, root, bevel=0.012)
        for row in range(1, panel_rows):
            z = wall_base + 0.19 + row_h * row
            add_box(f"{prefix}_rail_{face_name}_{row:02d}", (x - x_sign * 0.018, 0, z), (frame_depth, depth - 0.32, rail_h), timber_token, root, bevel=0.012)
        brace_x = x - x_sign * 0.055
        inset_y = depth * 0.5 - post_w * 0.82
        _add_rect_brace(
            f"{prefix}_brace_{face_name}",
            (brace_x, -inset_y, wall_base + 0.30),
            (brace_x, -inset_y + bay_d * 0.82, wall_top - 0.30),
            0.15,
            frame_depth,
            dark_token,
            root,
            plane="yz",
        )


def _shingled_gable_roof(
    prefix: str,
    width: float,
    depth: float,
    wall_top: float,
    pitch_deg: float,
    roof_token: str,
    trim_token: str,
    root,
    *,
    overhang_front: float = 0.60,
    overhang_side: float = 0.50,
    courses: int = 4,
    course_thickness: float = 0.16,
    include_fascia: bool = True,
    bevel: float = 0.025,
    gable_token: str | None = None,
    center_x: float = 0.0,
    center_y: float = 0.0,
) -> float:
    """Build a thin roof deck, deep eaves, gable truss, and segmented ridge.

    Visible roof character is supplied by ``_architecture_shingle_rows``. The
    deck stays beneath those units so it cannot read as a monolithic red slab.
    """
    pitch = math.radians(pitch_deg)
    half_w = width * 0.5 + overhang_side
    slope_length = half_w / math.cos(pitch)
    rise = math.sin(pitch) * slope_length
    roof_depth = depth + overhang_front * 2.0
    ridge_z = wall_top + rise
    gable_material = trim_token if gable_token is None else gable_token

    deck_thickness = min(0.075, course_thickness * 0.42)
    for side, name in ((-1, "left"), (1, "right")):
        add_box(
            f"{prefix}_roof_deck_{name}",
            (center_x + side * half_w * 0.5, center_y, wall_top + rise * 0.5 - 0.045),
            (slope_length + 0.08, roof_depth, deck_thickness),
            roof_token,
            root,
            rotation=(0, side * pitch, 0),
            bevel=min(bevel, 0.008),
        )

    ridge_count = max(4, round(roof_depth / 0.62))
    ridge_unit = (roof_depth + 0.16) / ridge_count
    for index in range(ridge_count):
        add_box(
            f"{prefix}_ridge_cap_{index:02d}",
            (center_x, center_y - roof_depth * 0.5 - 0.08 + ridge_unit * (index + 0.5), ridge_z + 0.10 + (0.012 if index % 2 else 0.0)),
            (0.30, ridge_unit * 1.04, 0.20),
            roof_token,
            root,
            rotation=(0, 0, 0.008 if index % 3 == 1 else -0.006 if index % 3 == 2 else 0.0),
            bevel=min(bevel, 0.014),
        )

    # Gable End Walls
    gable_w = width - 0.10
    gable_h = rise * 0.98
    add_tri_prism(
        f"{prefix}_gable_wall_front",
        (center_x, center_y - depth * 0.5 - 0.02, wall_top + gable_h * 0.5),
        (gable_w, 0.18, gable_h),
        gable_material,
        root,
    )
    add_tri_prism(
        f"{prefix}_gable_wall_back",
        (center_x, center_y + depth * 0.5 + 0.02, wall_top + gable_h * 0.5),
        (gable_w, 0.18, gable_h),
        gable_material,
        root,
    )

    # The gable face exposes a tie, king post, and principal rafters instead of
    # ending as one blank plaster triangle.
    for end_sign, end_name in ((-1, "front"), (1, "back")):
        end_y = center_y + end_sign * (depth * 0.5 + 0.055)
        add_box(f"{prefix}_gable_tie_{end_name}", (center_x, end_y, wall_top + 0.10), (width + 0.04, 0.14, 0.18), trim_token, root, bevel=min(bevel, 0.012))
        add_box(f"{prefix}_gable_king_{end_name}", (center_x, end_y, wall_top + rise * 0.50), (0.18, 0.14, rise * 0.90), trim_token, root, bevel=min(bevel, 0.012))
        _add_rect_brace(
            f"{prefix}_gable_rafter_l_{end_name}",
            (center_x - width * 0.48, end_y, wall_top + 0.12),
            (center_x, end_y, ridge_z - 0.08),
            0.16,
            0.14,
            trim_token,
            root,
            plane="xz",
            bevel=min(bevel, 0.010),
        )
        _add_rect_brace(
            f"{prefix}_gable_rafter_r_{end_name}",
            (center_x + width * 0.48, end_y, wall_top + 0.12),
            (center_x, end_y, ridge_z - 0.08),
            0.16,
            0.14,
            trim_token,
            root,
            plane="xz",
            bevel=min(bevel, 0.010),
        )

    if include_fascia:
        for side_sign, side_name in ((-1, "left"), (1, "right")):
            fascia_x = center_x + side_sign * half_w * 0.5
            for end_sign, end_name in ((-1, "front"), (1, "back")):
                fascia_y = center_y + end_sign * (depth * 0.5 + overhang_front - 0.04)
                add_box(
                    f"{prefix}_fascia_{end_name}_{side_name}",
                    (fascia_x, fascia_y, wall_top + rise * 0.5),
                    (slope_length + 0.08, 0.10, 0.16),
                    trim_token,
                    root,
                    rotation=(0, side_sign * pitch, 0),
                    bevel=min(bevel, 0.015) if bevel > 0 else 0.0,
                )
        for side_sign, side_name in ((-1, "left"), (1, "right")):
            add_box(
                f"{prefix}_eave_{side_name}",
                (center_x + side_sign * half_w, center_y, wall_top + 0.06),
                (0.15, roof_depth + 0.10, 0.20),
                trim_token,
                root,
                rotation=(0, side_sign * pitch, 0),
                bevel=min(bevel, 0.012),
            )

    return ridge_z


def _architecture_shingle_rows(
    prefix: str,
    width: float,
    depth: float,
    wall_top: float,
    pitch_deg: float,
    tokens: tuple[str, ...],
    root,
    *,
    rows: int,
    columns: int,
    seed: int,
    center_x: float = 0.0,
    center_y: float = 0.0,
    overhang_front: float = 0.60,
    overhang_side: float = 0.50,
) -> None:
    """Lay staggered overlapping roof units above a recessed roof deck."""
    rng = seeded_rng(seed)
    pitch = math.radians(pitch_deg)
    half_width = width * 0.5 + overhang_side
    slope = half_width / math.cos(pitch)
    row_step = slope / rows
    roof_depth = depth + overhang_front * 2.0
    tile_depth = roof_depth / columns
    for side in (-1, 1):
        for row in range(rows):
            distance = row_step * (row + 0.50)
            x = center_x + side * (half_width - math.cos(pitch) * distance)
            z = wall_top + math.sin(pitch) * distance + 0.105
            stagger = -tile_depth * 0.5 if row % 2 else 0.0
            for column in range(columns + (1 if row % 2 else 0)):
                y = center_y - roof_depth * 0.5 + tile_depth * (column + 0.5) + stagger
                if len(tokens) >= 3:
                    rng.random()  # Keep placement jitter independent of palette grouping.
                    roll = seeded_rng(seed + (row // 3) * 193 + (column // 4) * 29 + side).random()
                    token = tokens[0] if roll < 0.84 else tokens[1] if roll < 0.95 else tokens[2]
                elif len(tokens) == 2:
                    rng.random()
                    token = tokens[0] if seeded_rng(seed + (row // 3) * 193 + (column // 4) * 29 + side).random() < .88 else tokens[1]
                else:
                    token = tokens[0]
                add_box(
                    f"{prefix}_{'right' if side > 0 else 'left'}_{row:02d}_{column:02d}",
                    (x + side * rng.uniform(-0.012, 0.012), y, z + rng.uniform(-0.012, 0.018)),
                    (row_step * 1.56, tile_depth * rng.uniform(0.88, 0.96), 0.095),
                    token,
                    root,
                    rotation=(0, side * pitch, rng.uniform(-0.016, 0.016)),
                    bevel=0.009,
                )


def _add_tiled_canopy(
    prefix: str,
    center_x: float,
    wall_y: float,
    width: float,
    depth: float,
    outer_z: float,
    pitch_deg: float,
    roof_token: str,
    trim_token: str,
    root,
    *,
    detail: bool,
    seed: int,
) -> float:
    """Build a front-facing tiled shed roof with exposed rafters and fascia."""
    pitch = math.radians(pitch_deg)
    slope = depth / math.cos(pitch)
    center_y = wall_y - depth * 0.5
    center_z = outer_z + math.sin(pitch) * slope * 0.5
    add_box(
        f"{prefix}_deck",
        (center_x, center_y, center_z - 0.045),
        (width + 0.28, slope + 0.08, 0.065),
        roof_token,
        root,
        rotation=(pitch, 0, 0),
        bevel=0.008,
    )
    if detail:
        rows = max(4, round(depth / 0.28))
        columns = max(6, round(width / 0.42))
        row_step = slope / rows
        tile_w = (width + 0.28) / columns
        rng = seeded_rng(seed)
        for row in range(rows):
            distance = row_step * (row + 0.5)
            y = wall_y - depth + math.cos(pitch) * distance
            z = outer_z + math.sin(pitch) * distance + 0.09
            stagger = -tile_w * 0.5 if row % 2 else 0.0
            for column in range(columns + (1 if row % 2 else 0)):
                x = center_x - (width + 0.28) * 0.5 + tile_w * (column + 0.5) + stagger
                add_box(
                    f"{prefix}_tile_{row:02d}_{column:02d}",
                    (x, y, z + rng.uniform(-0.009, 0.012)),
                    (tile_w * rng.uniform(0.88, 0.96), row_step * 1.55, 0.085),
                    roof_token,
                    root,
                    rotation=(pitch, 0, rng.uniform(-0.014, 0.014)),
                    bevel=0.008,
                )
    rafter_count = 5 if detail else 3
    for rafter in range(rafter_count):
        x = center_x - width * 0.45 + width * 0.90 * rafter / max(1, rafter_count - 1)
        add_box(
            f"{prefix}_rafter_{rafter}",
            (x, center_y, center_z - 0.09),
            (0.10, slope + 0.04, 0.10),
            trim_token,
            root,
            rotation=(pitch, 0, 0),
            bevel=0.008,
        )
    add_box(
        f"{prefix}_fascia",
        (center_x, wall_y - depth - 0.02, outer_z + 0.02),
        (width + 0.36, 0.13, 0.19),
        trim_token,
        root,
        bevel=0.010,
    )
    return outer_z + math.sin(pitch) * slope


def _roof_course_shadow_lines(
    prefix: str,
    width: float,
    depth: float,
    wall_top: float,
    pitch_deg: float,
    token: str,
    root,
    *,
    rows: int,
    overhang_front: float,
    overhang_side: float,
    center_x: float = 0.0,
    center_y: float = 0.0,
) -> None:
    """Low-cost dark laps keep broad shingle courses readable at gameplay distance."""
    pitch = math.radians(pitch_deg)
    half_span = width * 0.5 + overhang_side
    slope_length = half_span / math.cos(pitch)
    roof_depth = depth + overhang_front * 2.0
    for side, name in ((-1, "left"), (1, "right")):
        for row in range(1, rows):
            distance = slope_length * row / rows
            x = center_x + side * (half_span - math.cos(pitch) * distance)
            z = wall_top + math.sin(pitch) * distance + 0.105
            add_box(
                f"{prefix}_{name}_{row:02d}",
                (x, center_y, z),
                (0.055, roof_depth + 0.04, 0.035),
                token,
                root,
                rotation=(0, side * pitch, 0),
                bevel=0.006,
            )


def _is_hero_detail(spec: dict) -> bool:
    return spec.get("_lodIndex", 0) == 0


def _join_direct_meshes(parent, prefix: str, preserve_names=()) -> None:
    """Join same-material direct children, keeping runtime hook meshes intact."""
    preserve = set(preserve_names)
    groups = defaultdict(list)
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH" or obj.parent is not parent:
            continue
        if obj.name in preserve:
            continue
        material_key = tuple(material.name for material in obj.data.materials if material is not None)
        groups[material_key].append(obj)
    for group_index, objects in enumerate(groups.values()):
        joined_name = f"{prefix}_material_{group_index:02d}"
        if len(objects) == 1:
            joined = objects[0]
            joined.name = joined_name
            joined.data.name = f"{joined_name}_mesh"
        else:
            joined = join_meshes(objects, joined_name)
        if joined is None:
            continue
        joined.parent = parent
        # Architecture is shaded by palette materials and semantic COLOR_0.
        # Blender's primitive/bevel UVs are unused and can drift by a few ULPs
        # during joins, so omit them rather than weakening semantic determinism.
        while joined.data.uv_layers:
            joined.data.uv_layers.remove(joined.data.uv_layers[0])


def _finish_architecture(spec: dict, root, builder, *, preserve_names=()) -> None:
    """Build LOD0/LOD1 (or a single root), join by material, then attach collision."""
    preserve = tuple(preserve_names)
    for lod_index, lod_root in create_lod_roots(spec, root):
        lod_spec = {**spec, "parameters": dict(spec["parameters"]), "_lodIndex": lod_index}
        builder(lod_spec, lod_root)
        prefix = f"{spec['id']}_LOD{lod_index}" if spec.get("lodLevels") else spec["id"]
        for child in list(lod_root.children):
            keep = lod_index == 0 and child.name in preserve
            if keep:
                continue
            if child.name in preserve:
                child.name = f"{prefix}_{child.name}"
                if child.type == "MESH":
                    child.data.name = f"{child.name}_mesh"
        if spec.get("lodLevels"):
            _join_direct_meshes(lod_root, prefix, preserve if lod_index == 0 else ())
        else:
            _join_direct_meshes(lod_root, prefix, preserve)
    add_collision_primitives(spec, root)


def farmhouse(spec: dict, root) -> None:
    _finish_architecture(spec, root, _build_farmhouse, preserve_names=("farmhouse_lantern_glow",))


def _farmhouse_context(spec: dict) -> dict:
    """Catalog parameters plus palette for brief-component farmhouse builders."""
    params = spec["parameters"]
    palette = spec["palette"]
    detail = _is_hero_detail(spec)
    width = params["width"]
    depth = params["depth"]
    wall_height = params["wallHeight"]
    foundation_h = 0.76
    wall_base = foundation_h + 0.08
    stone_tokens = tuple(token for token in palette if token.startswith("stone_")) or (palette[0],)
    if len(stone_tokens) == 2:
        stone_tokens = (stone_tokens[0], stone_tokens[0], stone_tokens[1])
    roof_tokens = tuple(token for token in palette if token.startswith("roof_")) or ((palette[4] if len(palette) > 4 else "roof_terracotta_01"),)
    is_variant_a = not spec["id"].endswith("_b")
    cross_gable_x = -1.60 if is_variant_a else 1.60
    entry_x = -1.60 if is_variant_a else 1.60
    porch_w = 3.20
    chimney_x = 3.35 if is_variant_a else -3.35
    window_xs = (0.85, 2.35) if is_variant_a else (-2.35, -0.85)
    return {
        "spec": spec,
        "params": params,
        "seed": spec["seed"],
        "detail": detail,
        "is_variant_a": is_variant_a,
        "stone": palette[0],
        "plaster": palette[1] if len(palette) > 1 else "plaster_cream_01",
        "timber": palette[2] if len(palette) > 2 else "wood_honey_01",
        "dark": palette[3] if len(palette) > 3 else "wood_dark_01",
        "roof": palette[4] if len(palette) > 4 else "roof_terracotta_01",
        "stone_tokens": stone_tokens,
        "roof_tokens": roof_tokens,
        "glow": palette[5] if len(palette) > 5 else "emissive_lantern_01",
        "glass": "emissive_window_01" if "emissive_window_01" in palette else (palette[5] if len(palette) > 5 else "emissive_lantern_01"),
        "metal": "metal_dark_01" if "metal_dark_01" in palette else (palette[3] if len(palette) > 3 else "wood_dark_01"),
        "width": width,
        "depth": depth,
        "wall_height": wall_height,
        "pitch_deg": params["roofPitchDeg"],
        "foundation_h": foundation_h,
        "wall_base": wall_base,
        "wall_top": wall_base + wall_height,
        "front_y": -depth * 0.5,
        "masonry_courses": params["masonryCourses"] if detail else 0,
        "masonry_blocks": params["masonryBlocks"],
        "shingle_rows": params["shingleRows"] if detail else max(3, params["shingleRows"] // 2),
        "shingle_columns": params["shingleColumns"] if detail else max(4, params["shingleColumns"] // 2),
        "cross_gable_width": 3.30,
        "porch_width": porch_w,
        "porch_depth": params["porchDepth"],
        "porch_planks": params["porchPlanks"] if detail else max(5, params["porchPlanks"] // 2),
        "chimney_offset_x": chimney_x,
        "chimney_height": params["chimneyHeight"],
        "cross_gable_x": cross_gable_x,
        "entry_x": entry_x,
        "window_xs": window_xs,
    }


def _farmhouse_aligned_plinth(ctx: dict, root) -> None:
    """Flush stacked-bond masonry so the plinth sits on a shared ground plane."""
    width = ctx["width"] + 0.68
    depth = ctx["depth"] + 0.68
    height = ctx["foundation_h"]
    courses = ctx["masonry_courses"]
    long_blocks = ctx["masonry_blocks"]
    course_h = height / courses
    block_depth = 0.22
    short_blocks = max(3, round(long_blocks * depth / max(width, 0.001)))
    tokens = ctx["stone_tokens"]
    for course in range(courses):
        z = course_h * (course + 0.5)
        for face, axis, span, count, fixed in (
            ("front", "x", width, long_blocks, -depth * 0.5 - block_depth * 0.35),
            ("back", "x", width, long_blocks, depth * 0.5 + block_depth * 0.35),
            ("left", "y", depth, short_blocks, -width * 0.5 - block_depth * 0.35),
            ("right", "y", depth, short_blocks, width * 0.5 + block_depth * 0.35),
        ):
            block_span = span / count
            for index in range(count):
                along = -span * 0.5 + block_span * (index + 0.5)
                token = tokens[(course + index) % len(tokens)]
                if axis == "x":
                    location = (along, fixed, z)
                    dimensions = (block_span * 0.98, block_depth, course_h * 0.96)
                else:
                    location = (fixed, along, z)
                    dimensions = (block_depth, block_span * 0.98, course_h * 0.96)
                add_box(
                    f"farmhouse_foundation_masonry_{face}_{course:02d}_{index:02d}",
                    location,
                    dimensions,
                    token,
                    root,
                    bevel=0.012,
                )


def _farmhouse_glazed_window(name, location, width, height, ctx: dict, root) -> None:
    """Hollow frame + proud emissive panes so the opening reads as glass, not a wood slab."""
    cx, cy, cz = location
    frame, glass, mullion = ctx["dark"], ctx["glass"], ctx["timber"]
    add_box(f"{name}_glass", (cx, cy - 0.05, cz), (width * 0.90, 0.035, height * 0.90), glass, root, bevel=0.006)
    add_box(f"{name}_mullion_v", (cx, cy - 0.07, cz), (0.04, 0.04, height * 0.88), mullion, root, bevel=0.005)
    add_box(f"{name}_mullion_h", (cx, cy - 0.07, cz), (width * 0.88, 0.04, 0.04), mullion, root, bevel=0.005)
    add_box(f"{name}_frame_l", (cx - width * 0.5, cy - 0.02, cz), (0.10, 0.12, height + 0.16), frame, root, bevel=0.012)
    add_box(f"{name}_frame_r", (cx + width * 0.5, cy - 0.02, cz), (0.10, 0.12, height + 0.16), frame, root, bevel=0.012)
    add_box(f"{name}_frame_t", (cx, cy - 0.02, cz + height * 0.5), (width + 0.16, 0.12, 0.10), frame, root, bevel=0.012)
    add_box(f"{name}_frame_b", (cx, cy - 0.02, cz - height * 0.5), (width + 0.16, 0.12, 0.10), frame, root, bevel=0.012)


def _farmhouse_glazed_side_window(name, x, y, z, width, height, ctx: dict, root, *, side: int) -> None:
    frame, glass, mullion = ctx["dark"], ctx["glass"], ctx["timber"]
    add_box(f"{name}_glass", (x + side * 0.05, y, z), (0.035, width * 0.90, height * 0.90), glass, root, bevel=0.006)
    add_box(f"{name}_mullion_v", (x + side * 0.07, y, z), (0.04, 0.04, height * 0.88), mullion, root, bevel=0.005)
    add_box(f"{name}_mullion_h", (x + side * 0.07, y, z), (0.04, width * 0.88, 0.04), mullion, root, bevel=0.005)
    add_box(f"{name}_frame_l", (x + side * 0.02, y - width * 0.5, z), (0.12, 0.10, height + 0.16), frame, root, bevel=0.012)
    add_box(f"{name}_frame_r", (x + side * 0.02, y + width * 0.5, z), (0.12, 0.10, height + 0.16), frame, root, bevel=0.012)
    add_box(f"{name}_frame_t", (x + side * 0.02, y, z + height * 0.5), (0.12, width + 0.16, 0.10), frame, root, bevel=0.012)
    add_box(f"{name}_frame_b", (x + side * 0.02, y, z - height * 0.5), (0.12, width + 0.16, 0.10), frame, root, bevel=0.012)


def _farmhouse_foundation(ctx: dict, root) -> None:
    width, depth = ctx["width"], ctx["depth"]
    foundation_h = ctx["foundation_h"]
    stone = ctx["stone"]
    add_box(
        "farmhouse_foundation_base",
        (0, 0, foundation_h * 0.5),
        (width + 0.32, depth + 0.32, foundation_h),
        stone,
        root,
        bevel=0.06,
    )
    if ctx["masonry_courses"]:
        _farmhouse_aligned_plinth(ctx, root)
    add_box(
        "farmhouse_foundation_water_table",
        (0, 0, foundation_h + 0.04),
        (width + 0.46, depth + 0.46, 0.10),
        stone,
        root,
        bevel=0.03,
    )


def _farmhouse_timber_frame(ctx: dict, root) -> None:
    _add_framed_infill_volume(
        "farmhouse_frame",
        ctx["width"],
        ctx["depth"],
        ctx["wall_base"],
        ctx["wall_height"],
        ctx["plaster"],
        ctx["timber"],
        ctx["dark"],
        root,
        detail=ctx["detail"],
        seed=ctx["seed"] + 13,
        front_bays=5,
        side_bays=4,
        panel_rows=2,
        daub_texture=ctx["detail"],
    )
    if ctx["detail"]:
        # Add diagonal knee braces on the right front facade
        front_y = ctx["front_y"]
        wall_base = ctx["wall_base"]
        wall_top = ctx["wall_top"]
        brace_x0 = 0.20 if ctx["is_variant_a"] else -3.10
        brace_x1 = 3.10 if ctx["is_variant_a"] else -0.20
        _add_rect_brace(
            "farmhouse_front_knee_brace_1",
            (brace_x0, front_y - 0.04, wall_base + 0.15),
            (brace_x0 + 0.85, front_y - 0.04, wall_base + 1.25),
            0.12,
            0.08,
            ctx["dark"],
            root,
            plane="xz",
            bevel=0.010,
        )
        _add_rect_brace(
            "farmhouse_front_knee_brace_2",
            (brace_x1, front_y - 0.04, wall_base + 0.15),
            (brace_x1 - 0.85, front_y - 0.04, wall_base + 1.25),
            0.12,
            0.08,
            ctx["dark"],
            root,
            plane="xz",
            bevel=0.010,
        )


def _farmhouse_shingle_roof(ctx: dict, root) -> None:
    width, depth = ctx["width"], ctx["depth"]
    wall_top = ctx["wall_top"]
    roof, timber, glow, dark = ctx["roof"], ctx["timber"], ctx["glow"], ctx["dark"]
    pitch_deg = ctx["pitch_deg"]
    _shingled_gable_roof(
        "farmhouse",
        width,
        depth,
        wall_top,
        pitch_deg,
        roof,
        timber,
        root,
        overhang_front=0.72,
        overhang_side=0.55,
        courses=3 if ctx["detail"] else 2,
        course_thickness=0.18,
        gable_token=ctx["plaster"],
    )
    _architecture_shingle_rows(
        "farmhouse_shingles",
        width,
        depth,
        wall_top,
        pitch_deg,
        ctx["roof_tokens"],
        root,
        rows=ctx["shingle_rows"],
        columns=ctx["shingle_columns"],
        seed=ctx["seed"] + 17,
        overhang_front=0.72,
        overhang_side=0.55,
    )

    cg_w = ctx["cross_gable_width"]
    cg_d = 2.40
    cg_base_z = wall_top + 0.10
    cg_y = -depth * 0.5 - 0.45
    cg_x = ctx["cross_gable_x"]
    cg_pitch_deg = pitch_deg + 4
    _shingled_gable_roof(
        "farmhouse_cross_gable",
        cg_w,
        cg_d,
        cg_base_z,
        cg_pitch_deg,
        roof,
        timber,
        root,
        overhang_front=0.36,
        overhang_side=0.42,
        courses=3 if ctx["detail"] else 2,
        course_thickness=0.14,
        gable_token=ctx["plaster"],
        center_x=cg_x,
        center_y=cg_y,
    )
    if ctx["detail"]:
        _architecture_shingle_rows(
            "farmhouse_cross_gable_shingles",
            cg_w,
            cg_d,
            cg_base_z,
            cg_pitch_deg,
            ctx["roof_tokens"],
            root,
            rows=5,
            columns=6,
            seed=ctx["seed"] + 21,
            center_x=cg_x,
            center_y=cg_y,
            overhang_front=0.36,
            overhang_side=0.42,
        )
    add_box(
        "farmhouse_attic_win_reveal",
        (cg_x, cg_y - cg_d * 0.5 - 0.02, wall_top + 0.92),
        (0.78, 0.22, 0.78),
        dark,
        root,
        bevel=0.014,
    )
    _farmhouse_glazed_window(
        "farmhouse_attic_win",
        (cg_x, cg_y - cg_d * 0.5 - 0.10, wall_top + 0.92),
        0.56,
        0.56,
        ctx,
        root,
    )


def _farmhouse_chimney(ctx: dict, root) -> None:
    chim_x = ctx["chimney_offset_x"]
    chim_y = 0.35
    chim_h = ctx["chimney_height"]
    stone, roof = ctx["stone"], ctx["roof"]

    # Broad chimney mass on the plinth, without scattered ground boulders
    add_box("farmhouse_chimney_base", (chim_x, chim_y, 1.15), (1.60, 1.50, 2.30), stone, root, bevel=0.040)

    # Organic tapered transition shoulder
    add_box("farmhouse_chimney_shoulder_lower", (chim_x, chim_y, 2.45), (1.38, 1.30, 0.32), stone, root, bevel=0.045)
    add_box("farmhouse_chimney_shoulder_upper", (chim_x, chim_y, 2.75), (1.16, 1.10, 0.30), stone, root, bevel=0.038)

    # Vertical shaft with subtle low-poly tilt
    shaft_h = chim_h - 2.90
    add_box(
        "farmhouse_chimney_shaft",
        (chim_x, chim_y, 2.90 + shaft_h * 0.5),
        (0.96, 0.90, shaft_h),
        stone,
        root,
        rotation=(0.003, -0.004, 0.003),
        bevel=0.035,
    )

    if ctx["masonry_courses"]:
        add_masonry_courses(
            "farmhouse_chimney_masonry_base",
            (chim_x, chim_y, 1.20),
            1.60,
            1.50,
            2.20,
            ctx["stone_tokens"],
            root,
            courses=max(3, ctx["masonry_courses"]),
            blocks_per_long_side=3,
            seed=ctx["seed"] + 22,
            block_depth=0.22,
            bevel=0.024,
        )
        add_masonry_courses(
            "farmhouse_chimney_masonry_shaft",
            (chim_x, chim_y, 2.90 + shaft_h * 0.5),
            0.96,
            0.90,
            shaft_h,
            ctx["stone_tokens"],
            root,
            courses=max(4, ctx["masonry_courses"] + 1),
            blocks_per_long_side=2,
            seed=ctx["seed"] + 24,
            block_depth=0.18,
            bevel=0.020,
        )

    # Stepped corbel rim / crown
    add_box("farmhouse_chimney_crown_lower", (chim_x, chim_y, chim_h + 0.05), (1.14, 1.08, 0.18), stone, root, bevel=0.030)
    add_box("farmhouse_chimney_crown_upper", (chim_x, chim_y, chim_h + 0.20), (1.00, 0.94, 0.15), ctx["stone_tokens"][-1], root, bevel=0.025)

    # Cylindrical terracotta pot with lip
    add_profiled_vessel("farmhouse_chimney_pot", (chim_x, chim_y, chim_h + .25),
        ((0, .22), (.47, .22), (.49, .245), (.55, .245)), .035, roof, root, sides=8)


def _farmhouse_porch(ctx: dict, root) -> None:
    front_y = ctx["front_y"]
    porch_x = ctx["entry_x"]
    porch_w = ctx["porch_width"]
    porch_d = ctx["porch_depth"]
    porch_deck_z = ctx["wall_base"] + 0.12
    timber, dark, roof, glow = ctx["timber"], ctx["dark"], ctx["glow"], ctx["glow"]
    roof_mat = ctx["roof"]

    # Porch foundation & deck base
    add_box(
        "farmhouse_porch_deck_base",
        (porch_x, front_y - porch_d * 0.5, porch_deck_z - 0.08),
        (porch_w, porch_d, 0.18),
        dark,
        root,
        bevel=0.025,
    )
    add_plank_field(
        "farmhouse_porch_planks",
        (porch_x, front_y - porch_d * 0.5, porch_deck_z + 0.05),
        porch_w - 0.06,
        porch_d - 0.04,
        0.08,
        (timber,),
        root,
        count=ctx["porch_planks"],
        axis="x",
        seed=ctx["seed"] + 29,
        bevel=0.012,
    )

    # Porch posts
    post_half_w = porch_w * 0.44
    post_y = front_y - porch_d + 0.15
    for p_idx, px_rel in enumerate((-post_half_w, post_half_w)):
        px = porch_x + px_rel
        add_box(f"farmhouse_porch_post_{p_idx}", (px, post_y, porch_deck_z + 1.15), (0.28, 0.28, 2.30), timber, root, bevel=0.028)
        add_box(f"farmhouse_porch_post_cap_{p_idx}", (px, post_y, porch_deck_z + 2.32), (0.30, 0.30, 0.10), timber, root, bevel=0.015)
        # Knee braces connecting post to header
        brace_dir = 1 if px_rel < 0 else -1
        _add_rect_brace(
            f"farmhouse_porch_post_brace_{p_idx}",
            (px, post_y, porch_deck_z + 1.80),
            (px + brace_dir * 0.48, post_y, porch_deck_z + 2.26),
            0.10,
            0.12,
            timber,
            root,
            plane="xz",
            bevel=0.010,
        )

    add_box(
        "farmhouse_porch_header_beam",
        (porch_x, post_y, porch_deck_z + 2.26),
        (porch_w + 0.20, 0.20, 0.20),
        timber,
        root,
        bevel=0.02,
    )

    # Sloped porch roof canopy
    canopy_pitch = math.radians(14)
    canopy_rows = 4 if ctx["detail"] else 2
    canopy_columns = 7 if ctx["detail"] else 4
    canopy_slope = porch_d / math.cos(canopy_pitch)
    canopy_row_step = canopy_slope / canopy_rows
    canopy_tile_w = (porch_w + 0.35) / canopy_columns
    canopy_outer_z = porch_deck_z + 2.36

    add_box(
        "farmhouse_porch_roof_deck",
        (porch_x, front_y - porch_d * 0.5, canopy_outer_z + math.sin(canopy_pitch) * canopy_slope * 0.5 - 0.04),
        (porch_w + 0.35, canopy_slope + 0.08, 0.065),
        roof_mat,
        root,
        rotation=(canopy_pitch, 0, 0),
        bevel=0.008,
    )

    porch_rng = seeded_rng(ctx["seed"] + 31)
    for row in range(canopy_rows):
        distance = canopy_row_step * (row + 0.5)
        y = front_y - porch_d + math.cos(canopy_pitch) * distance
        z = canopy_outer_z + math.sin(canopy_pitch) * distance + 0.09
        stagger = -canopy_tile_w * 0.5 if row % 2 else 0.0
        for column in range(canopy_columns + (1 if row % 2 else 0)):
            x = porch_x - (porch_w + 0.35) * 0.5 + canopy_tile_w * (column + 0.5) + stagger
            roof_roll = porch_rng.random()
            if len(ctx["roof_tokens"]) == 1 or roof_roll < 0.84:
                porch_roof_token = ctx["roof_tokens"][0]
            elif len(ctx["roof_tokens"]) == 2 or roof_roll < 0.95:
                porch_roof_token = ctx["roof_tokens"][1]
            else:
                porch_roof_token = ctx["roof_tokens"][2]
            add_box(
                f"farmhouse_porch_roof_tile_{row:02d}_{column:02d}",
                (x, y, z + porch_rng.uniform(-0.008, 0.010)),
                (canopy_tile_w * porch_rng.uniform(0.88, 0.96), canopy_row_step * 1.50, 0.080),
                porch_roof_token,
                root,
                rotation=(canopy_pitch, 0, porch_rng.uniform(-0.014, 0.014)),
                bevel=0.008,
            )

    # Exposed rafters under canopy
    for rafter in range(4 if ctx["detail"] else 2):
        rx = porch_x - porch_w * 0.42 + porch_w * 0.84 * rafter / (3 if ctx["detail"] else 1)
        add_box(
            f"farmhouse_porch_rafter_{rafter}",
            (rx, front_y - porch_d * 0.5, canopy_outer_z + math.sin(canopy_pitch) * canopy_slope * 0.5 - 0.09),
            (0.10, canopy_slope + 0.04, 0.10),
            dark,
            root,
            rotation=(canopy_pitch, 0, 0),
            bevel=0.008,
        )

    # Side railings on outer flank
    side_px = porch_x - post_half_w if ctx["is_variant_a"] else porch_x + post_half_w
    add_box(
        "farmhouse_porch_rail_top_side",
        (side_px, front_y - porch_d * 0.5, porch_deck_z + 0.88),
        (0.12, porch_d - 0.25, 0.10),
        timber,
        root,
        bevel=0.015,
    )
    for b_idx in range(3):
        add_box(
            f"farmhouse_porch_baluster_side_{b_idx}",
            (side_px, front_y - 0.35 - b_idx * 0.42, porch_deck_z + 0.46),
            (0.08, 0.08, 0.74),
            timber,
            root,
            bevel=0.010,
        )

    # Equal-riser treads from porch deck onto the shared ground plane (z=0).
    tread_h = 0.16
    tread_run = 0.22
    z_high = porch_deck_z - tread_h * 0.5
    z_low = tread_h * 0.5
    step_count = max(3, int(round(porch_deck_z / tread_h)))
    for step_idx in range(step_count):
        t = step_idx / (step_count - 1)
        add_box(
            f"farmhouse_entry_step_{step_idx}",
            (porch_x, front_y - porch_d - 0.16 - step_idx * tread_run, z_high * (1.0 - t) + z_low * t),
            (1.80 + step_idx * 0.12, 0.34, tread_h),
            timber,
            root,
            bevel=0.010,
        )

    # Rustic porch bench
    bench_x = porch_x - porch_w * 0.32 if ctx["is_variant_a"] else porch_x + porch_w * 0.32
    bench_y = front_y - porch_d * 0.45
    add_box("farmhouse_porch_bench_seat", (bench_x, bench_y, porch_deck_z + 0.42), (1.10, 0.36, 0.08), timber, root, bevel=0.015)
    add_box("farmhouse_porch_bench_back", (bench_x, bench_y + 0.15, porch_deck_z + 0.70), (1.10, 0.08, 0.48), timber, root, bevel=0.015)
    for l_idx, lx in enumerate((bench_x - 0.42, bench_x + 0.42)):
        add_box(f"farmhouse_porch_bench_leg_{l_idx}", (lx, bench_y, porch_deck_z + 0.20), (0.09, 0.30, 0.38), timber, root, bevel=0.010)

    # Wall-mounted hanging lantern
    lamp_x = porch_x + post_half_w if ctx["is_variant_a"] else porch_x - post_half_w
    lamp_y = front_y - porch_d + 0.30
    lamp_z = porch_deck_z + 1.95
    add_box("farmhouse_lantern_bracket", (lamp_x, lamp_y + 0.10, lamp_z + 0.22), (0.06, 0.22, 0.06), dark, root, bevel=0.008)
    add_box("farmhouse_lantern_frame", (lamp_x, lamp_y, lamp_z), (0.30, 0.30, 0.40), dark, root, bevel=0.018)
    add_ico("farmhouse_lantern_glow", (lamp_x, lamp_y, lamp_z), (0.12, 0.12, 0.18), glow, root, subdivisions=2)
    ctx["_porch_posts"] = (post_half_w, post_y, porch_deck_z)


def _farmhouse_openings(ctx: dict, root) -> None:
    front_y = ctx["front_y"]
    wall_base = ctx["wall_base"]
    timber, dark, glass, metal, stone = (
        ctx["timber"],
        ctx["dark"],
        ctx["glass"],
        ctx["metal"],
        ctx["stone"],
    )
    door_x = ctx["entry_x"]
    hinge_sign = -1 if ctx["is_variant_a"] else 1

    add_box("farmhouse_front_door_reveal", (door_x, front_y + 0.05, wall_base + 1.15), (1.48, 0.28, 2.40), dark, root, bevel=0.018)
    add_box("farmhouse_front_door_lintel", (door_x, front_y - 0.02, wall_base + 2.28), (1.62, 0.22, 0.16), stone, root, bevel=0.018)
    add_box("farmhouse_front_door_frame", (door_x, front_y - 0.08, wall_base + 1.15), (1.38, 0.18, 2.34), dark, root, bevel=0.025)
    add_box("farmhouse_front_door_panel", (door_x, front_y - 0.13, wall_base + 1.12), (1.16, 0.10, 2.16), dark, root, bevel=0.012)
    board_count = 5
    board_span = 1.10
    board_w = board_span / board_count
    for board in range(board_count):
        bx = door_x - board_span * 0.5 + board_w * (board + 0.5)
        add_box(
            f"farmhouse_front_door_board_{board}",
            (bx, front_y - 0.185, wall_base + 1.12),
            (board_w * 0.90, 0.040, 2.04),
            dark,
            root,
            bevel=0.006,
        )
    for batten_idx, bz in enumerate((wall_base + 0.38, wall_base + 1.12, wall_base + 1.86)):
        add_box(
            f"farmhouse_front_door_batten_{batten_idx}",
            (door_x, front_y - 0.22, bz),
            (1.12, 0.07, 0.14),
            timber,
            root,
            bevel=0.008,
        )
    for hinge_idx, hz in enumerate((wall_base + 0.42, wall_base + 1.12, wall_base + 1.82)):
        hx = door_x + hinge_sign * 0.48
        add_box(
            f"farmhouse_front_door_hinge_{hinge_idx}",
            (hx, front_y - 0.24, hz),
            (0.28, 0.06, 0.10),
            metal,
            root,
            bevel=0.008,
        )
        add_box(
            f"farmhouse_front_door_hinge_strap_{hinge_idx}",
            (door_x + hinge_sign * 0.18, front_y - 0.23, hz),
            (0.72, 0.04, 0.07),
            metal,
            root,
            bevel=0.006,
        )
    latch_x = door_x - hinge_sign * 0.42
    add_box("farmhouse_door_latch_plate", (latch_x, front_y - 0.24, wall_base + 1.10), (0.14, 0.04, 0.22), metal, root, bevel=0.006)
    add_cylinder("farmhouse_door_handle", (latch_x, front_y - 0.30, wall_base + 1.10), 0.045, 0.04, metal, root, vertices=8, bevel=0.004)
    add_ring("farmhouse_door_ring", (latch_x, front_y - 0.34, wall_base + 1.02), 0.055, 0.012, metal, root, major_segments=8, minor_segments=6)

    win_z = wall_base + 1.65
    for w_idx, wx in enumerate(ctx["window_xs"]):
        sname = f"facade_{w_idx}"
        add_box(
            f"farmhouse_window_{sname}_reveal",
            (wx, front_y + 0.055, win_z),
            (1.30, 0.24, 1.30),
            dark,
            root,
            bevel=0.016,
        )
        add_box(
            f"farmhouse_window_{sname}_sill",
            (wx, front_y - 0.08, win_z - 0.62),
            (1.28, 0.18, 0.10),
            stone,
            root,
            bevel=0.012,
        )
        _farmhouse_glazed_window(
            f"farmhouse_window_{sname}",
            (wx, front_y - 0.04, win_z),
            1.04,
            1.04,
            ctx,
            root,
        )

    if ctx["detail"]:
        rear_y = ctx["depth"] * 0.5 - 0.02
        add_box("farmhouse_rear_window_reveal", (-1.15, rear_y - 0.05, win_z), (1.28, 0.22, 1.32), dark, root, bevel=0.014)
        _farmhouse_glazed_window("farmhouse_rear_window", (-1.15, rear_y + 0.035, win_z), 0.98, 1.02, ctx, root)
        side_x = -ctx["width"] * 0.5 + 0.02 if ctx["is_variant_a"] else ctx["width"] * 0.5 - 0.02
        side_dir = -1 if ctx["is_variant_a"] else 1
        add_box("farmhouse_side_window_reveal", (side_x - side_dir * 0.05, 0.65, win_z), (0.22, 1.28, 1.32), dark, root, bevel=0.014)
        _farmhouse_glazed_side_window("farmhouse_side_window", side_x + side_dir * 0.035, 0.65, win_z, 0.98, 1.02, ctx, root, side=side_dir)

    if not ctx["detail"]:
        return
    post_half_w, post_y, porch_deck_z = ctx["_porch_posts"]
    add_fasteners(
        "farmhouse_door_fastener",
        (
            (door_x - 0.46, front_y - 0.10, wall_base + 1.55),
            (door_x + 0.46, front_y - 0.10, wall_base + 1.55),
            (door_x - 0.46, front_y - 0.10, wall_base + 0.72),
            (door_x + 0.46, front_y - 0.10, wall_base + 0.72),
        ),
        0.018,
        metal,
        root,
        depth=0.07,
    )
    add_fasteners(
        "farmhouse_porch_fastener",
        (
            (ctx["entry_x"] - post_half_w, post_y, porch_deck_z + 2.20),
            (ctx["entry_x"] + post_half_w, post_y, porch_deck_z + 2.20),
            (ctx["entry_x"] - post_half_w, post_y, porch_deck_z + 0.18),
            (ctx["entry_x"] + post_half_w, post_y, porch_deck_z + 0.18),
        ),
        0.02,
        dark,
        root,
        depth=0.08,
    )


def _build_farmhouse(spec: dict, root) -> None:
    """Authored farmhouse matching farmhouse_isolated: masonry, timber, shingles, chimney, porch."""
    ctx = _farmhouse_context(spec)
    _farmhouse_foundation(ctx, root)
    _farmhouse_timber_frame(ctx, root)
    _farmhouse_shingle_roof(ctx, root)
    _farmhouse_chimney(ctx, root)
    _farmhouse_porch(ctx, root)
    _farmhouse_openings(ctx, root)


def windmill(spec: dict, root) -> None:
    _finish_architecture(spec, root, _build_windmill, preserve_names=("windmill_rotor", "windmill_hub", "windmill_sail_canvas"))


def _build_windmill(spec: dict, root) -> None:
    """Authored village windmill matching art-reference.png.

    Features: Tapered golden stone base, belt moulding course, warm timber upper body,
    overhanging turf conical cap roof with apex finial, 4 delicate lattice-and-canvas sails
    mounted on windmill_rotor, arched wooden door, and warm glowing observation windows.
    """
    params = spec["parameters"]
    palette = spec["palette"]
    stone = palette[0]
    timber = palette[1] if len(palette) > 1 else "wood_honey_01"
    turf = palette[2] if len(palette) > 2 else "roof_turf_01"
    canvas = palette[3] if len(palette) > 3 else "canvas_cream_01"
    dark = palette[4] if len(palette) > 4 else "wood_dark_01"

    height = params["height"]
    radius = params["baseRadius"]
    sides = params["sides"]
    detail = _is_hero_detail(spec)
    seed = spec["seed"]

    # 1. Lower Stone Base (Grounded Masonry)
    stone_h = height * 0.38
    stone_top_r = radius * 0.90
    add_cone(
        "windmill_stone_base",
        (0, 0, stone_h * 0.5),
        radius * 0.92,
        stone_top_r * 0.92,
        stone_h,
        stone,
        root,
        vertices=sides,
    )
    if detail:
        add_cylindrical_masonry(
            "windmill_stone_masonry",
            0.0,
            stone_h,
            radius,
            stone_top_r,
            (stone,),
            root,
            courses=max(5, round(height)),
            blocks_per_course=max(10, sides + 4),
            seed=seed + 13,
            block_depth=0.20,
        )
    # Stone belt moulding course
    add_cylinder(
        "windmill_stone_belt",
        (0, 0, stone_h + 0.06),
        stone_top_r + 0.08,
        0.14,
        stone,
        root,
        vertices=sides,
        bevel=0.025,
    )

    # 2. Upper Tapered Timber Body
    timber_h = height - stone_h - 0.12
    timber_base_r = stone_top_r * 0.96
    timber_top_r = radius * 0.62
    timber_cz = stone_h + 0.12 + timber_h * 0.5
    add_cone(
        "windmill_timber_body",
        (0, 0, timber_cz),
        timber_base_r,
        timber_top_r,
        timber_h,
        timber,
        root,
        vertices=sides,
    )
    # Timber structural bands wrapping around the upper body
    for band_idx in range(3):
        progress = (band_idx + 1) / 4.0
        bz = stone_h + 0.12 + timber_h * progress
        br = timber_base_r + (timber_top_r - timber_base_r) * progress
        add_cylinder(
            f"windmill_timber_band_{band_idx}",
            (0, 0, bz),
            br + 0.04,
            0.10,
            dark,
            root,
            vertices=sides,
            bevel=0.015,
        )
    # Square-hewn-looking radial ribs make the body read as a framed mill, not
    # a smooth brown plaster cone. Their slight taper follows the tower batter.
    rib_count = sides if detail else max(6, sides // 2)
    for rib_index in range(rib_count):
        angle = math.tau * rib_index / rib_count
        add_beam(
            f"windmill_body_rib_{rib_index:02d}",
            (math.cos(angle) * (timber_base_r + 0.035), math.sin(angle) * (timber_base_r + 0.035), stone_h + 0.18),
            (math.cos(angle) * (timber_top_r + 0.035), math.sin(angle) * (timber_top_r + 0.035), height - 0.10),
            0.065 if detail else 0.050,
            dark,
            root,
            vertices=4,
        )

    # 3. Conical Overhanging Cap Roof with Finial
    cap_base_z = height + 0.06
    cap_r = timber_top_r + 0.32
    # Roof eave soffit
    add_cylinder(
        "windmill_roof_eave",
        (0, 0, cap_base_z + 0.08),
        cap_r,
        0.16,
        dark,
        root,
        vertices=sides,
        bevel=0.025,
    )
    # Layered turf/thatch skirts replace the former single perfect cone.
    roof_h = 1.95
    roof_layers = 6 if detail else 3
    layer_h = roof_h / roof_layers
    for layer in range(roof_layers):
        t0 = layer / roof_layers
        t1 = (layer + 1) / roof_layers
        lower_r = (cap_r + 0.08) * (1.0 - t0) + 0.08 * t0
        upper_r = (cap_r + 0.08) * (1.0 - t1) + 0.08 * t1
        overlap = 0.09 * (1.0 - t0)
        add_cone(
            f"windmill_roof_course_{layer:02d}",
            (0, 0, cap_base_z + 0.16 + layer_h * (layer + 0.5)),
            lower_r + overlap,
            max(0.06, upper_r + overlap * 0.45),
            layer_h * 1.16,
            turf,
            root,
            vertices=sides,
        )
    if detail:
        for rafter in range(sides):
            angle = math.tau * rafter / sides
            add_beam(
                f"windmill_eave_rafter_{rafter:02d}",
                (math.cos(angle) * 0.28, math.sin(angle) * 0.28, cap_base_z + 0.10),
                (math.cos(angle) * (cap_r - 0.06), math.sin(angle) * (cap_r - 0.06), cap_base_z + 0.10),
                0.045,
                dark,
                root,
                vertices=4,
            )
    # Wooden apex finial
    add_cone(
        "windmill_roof_finial",
        (0, 0, cap_base_z + 0.16 + roof_h + 0.30),
        0.12,
        0.02,
        0.60,
        dark,
        root,
        vertices=6,
    )

    # 4. Arched Timber Doorway & Glowing Windows
    add_box(
        "windmill_door_frame",
        (0, -radius - 0.04, 1.35),
        (1.28, 0.18, 2.30),
        dark,
        root,
        bevel=0.03,
    )
    add_box(
        "windmill_door_panel",
        (0, -radius - 0.08, 1.30),
        (1.08, 0.12, 2.10),
        timber,
        root,
        bevel=0.02,
    )
    if detail:
        add_plank_field(
            "windmill_door_planks",
            (0, -radius - 0.16, 1.30),
            1.00,
            0.08,
            2.00,
            (timber, dark),
            root,
            count=5,
            axis="x",
            bevel=0.008,
            seed=seed + 17,
        )
        add_fasteners(
            "windmill_door_fastener",
            ((-0.38, -radius - 0.18, 1.55), (0.38, -radius - 0.18, 1.55),
             (-0.38, -radius - 0.18, 2.05), (0.38, -radius - 0.18, 2.05)),
            0.018,
            dark,
            root,
            depth=0.06,
        )
    # Stone door lintel
    add_box(
        "windmill_door_lintel",
        (0, -radius - 0.06, 2.52),
        (1.48, 0.22, 0.18),
        stone,
        root,
        bevel=0.025,
    )

    # Glowing observation windows
    for w_idx, wz in enumerate((3.8, 5.8)):
        wr = timber_base_r + (timber_top_r - timber_base_r) * ((wz - stone_h) / timber_h)
        add_box(
            f"windmill_window_frame_{w_idx}",
            (0, -wr - 0.04, wz),
            (0.72, 0.14, 0.82),
            dark,
            root,
            bevel=0.02,
        )
        add_box(
            f"windmill_window_glass_{w_idx}",
            (0, -wr - 0.08, wz),
            (0.56, 0.06, 0.66),
            canvas,
            root,
            bevel=0.01,
        )

    # 5. Rotor Hub & 4 Delicate Lattice-and-Canvas Sails
    rotor_z = height * 0.84
    rotor_progress = max(0.0, min(1.0, (rotor_z - stone_h - 0.12) / timber_h))
    rotor_body_r = timber_base_r + (timber_top_r - timber_base_r) * rotor_progress
    hub_world = (0.0, -rotor_body_r - 0.22, rotor_z)
    axle_body_y = -rotor_body_r * 0.90

    # The axle visibly connects the rotating assembly to the mill body.  It is
    # rooted on the static structure while the hub and sails remain under the
    # animation pivot.
    add_cylinder(
        "windmill_axle_collar",
        (0, axle_body_y - 0.02, rotor_z),
        0.43,
        0.18,
        dark,
        root,
        vertices=10,
        rotation=(math.pi / 2, 0, 0),
        bevel=0.02,
    )
    add_beam(
        "windmill_axle_shaft",
        (0, axle_body_y, rotor_z),
        (0, hub_world[1] + 0.08, rotor_z),
        0.15,
        dark,
        root,
        vertices=10,
    )
    rotor_name = "windmill_rotor" if spec.get("_lodIndex", 0) == 0 else f"{spec['id']}_LOD{spec.get('_lodIndex')}_rotor"
    rotor = add_marker(rotor_name, hub_world, root, marker_type="animation_pivot")
    rotor["pivot"] = list(hub_world)

    # All rotating parts are authored in pivot-local coordinates.  Art Yard can
    # now rotate the marker directly, while runtime still reparents around the
    # named hub for presentation-only motion.
    hub_center = (0.0, 0.0, 0.0)
    add_cylinder(
        "windmill_hub",
        hub_center,
        0.36,
        0.46,
        dark,
        rotor,
        vertices=10,
        rotation=(math.pi / 2, 0, 0),
        bevel=0.025,
    )

    # 4 Cross Spars & Canvas Sails (Classic Dutch lattice style in diagonal 'X' stance)
    sail_reach = height * 0.50
    r_min = sail_reach * 0.27
    r_max = sail_reach * 0.94
    sail_w = radius * 0.33
    sail_len = r_max - r_min
    r_mid = (r_min + r_max) * 0.5

    for s_idx in range(4):
        # Diagonal 'X' orientation: 45, 135, 225, 315 degrees
        angle = math.pi * 0.25 + s_idx * math.pi * 0.5
        dx = math.cos(angle)
        dz = math.sin(angle)
        tx = -math.sin(angle)  # Tangential unit vector along trailing side
        tz = math.cos(angle)

        spar_start = hub_center
        spar_end = (hub_center[0] + dx * sail_reach, hub_center[1], hub_center[2] + dz * sail_reach)

        # 1. Structural timber spar (leading edge)
        add_beam(
            f"windmill_spar_{s_idx}",
            spar_start,
            spar_end,
            0.11 if detail else 0.08,
            dark,
            rotor,
            vertices=6,
        )

        # 2. Canvas cloth panel (trailing side)
        # Positioned along trailing edge by sail_w / 2, spanning from r_min to r_max
        sc_x = hub_center[0] + dx * r_mid + tx * (sail_w * 0.5)
        sc_y = hub_center[1] + 0.015
        sc_z = hub_center[2] + dz * r_mid + tz * (sail_w * 0.5)
        add_box(
            f"windmill_sail_canvas_{s_idx}",
            (sc_x, sc_y, sc_z),
            (sail_len, 0.045, sail_w),
            canvas,
            rotor,
            rotation=(0, -angle, 0),
            bevel=0.01,
        )

        # 3. Outer trailing edge frame beam
        edge_start = (
            hub_center[0] + dx * r_min + tx * sail_w,
            hub_center[1] - 0.01,
            hub_center[2] + dz * r_min + tz * sail_w,
        )
        edge_end = (
            hub_center[0] + dx * r_max + tx * sail_w,
            hub_center[1] - 0.01,
            hub_center[2] + dz * r_max + tz * sail_w,
        )
        add_beam(
            f"windmill_sail_edge_{s_idx}",
            edge_start,
            edge_end,
            0.042,
            dark,
            rotor,
            vertices=4,
        )

        # 4. Inner and outer end framing
        root_start = (hub_center[0] + dx * r_min, hub_center[1] - 0.01, hub_center[2] + dz * r_min)
        add_beam(
            f"windmill_sail_root_{s_idx}",
            root_start,
            edge_start,
            0.042,
            dark,
            rotor,
            vertices=4,
        )
        tip_start = (hub_center[0] + dx * r_max, hub_center[1] - 0.01, hub_center[2] + dz * r_max)
        add_beam(
            f"windmill_sail_tip_{s_idx}",
            tip_start,
            edge_end,
            0.042,
            dark,
            rotor,
            vertices=4,
        )

        # 5. Handcrafted timber battens / lattice ribs across canvas
        batten_count = 6 if detail else 2
        for batten_idx in range(batten_count):
            progress = (batten_idx + 0.5) / batten_count
            r_b = r_min + progress * sail_len
            b_start = (hub_center[0] + dx * r_b, hub_center[1] - 0.015, hub_center[2] + dz * r_b)
            b_end = (
                hub_center[0] + dx * r_b + tx * sail_w,
                hub_center[1] - 0.015,
                hub_center[2] + dz * r_b + tz * sail_w,
            )
            add_beam(
                f"windmill_sail_batten_{s_idx}_{batten_idx}",
                b_start,
                b_end,
                0.032,
                dark,
                rotor,
                vertices=4,
            )

    lod_index = spec.get("_lodIndex", 0)
    hub_name = "windmill_hub" if lod_index == 0 else f"{spec['id']}_LOD{lod_index}_windmill_hub"
    sail_name = "windmill_sail_canvas" if lod_index == 0 else f"{spec['id']}_LOD{lod_index}_windmill_sail_canvas"
    dark_parts = []
    canvas_parts = []
    for child in list(rotor.children):
        if child.type != "MESH":
            continue
        token = child.data.materials[0].name if child.data.materials else ""
        if token == canvas:
            canvas_parts.append(child)
        else:
            dark_parts.append(child)
    dark_parts.sort(key=lambda obj: 0 if obj.name == "windmill_hub" else 1)
    if dark_parts:
        joined = dark_parts[0] if len(dark_parts) == 1 else join_meshes(dark_parts, hub_name)
        joined.name = hub_name
        joined.data.name = f"{hub_name}_mesh"
        joined.parent = rotor
    if canvas_parts:
        joined = canvas_parts[0] if len(canvas_parts) == 1 else join_meshes(canvas_parts, sail_name)
        joined.name = sail_name
        joined.data.name = f"{sail_name}_mesh"
        joined.parent = rotor


def lighthouse(spec: dict, root) -> None:
    _finish_architecture(spec, root, _build_lighthouse, preserve_names=("lighthouse_lantern_beacon",))


def _lighthouse_context(spec: dict) -> dict:
    """Catalog parameters plus palette for brief-component lighthouse builders."""
    params = spec["parameters"]
    palette = spec["palette"]
    detail = _is_hero_detail(spec)
    foundation_h = 1.2
    height = params["height"]
    return {
        "spec": spec,
        "seed": spec["seed"],
        "detail": detail,
        "stone": palette[0],
        "plaster": palette[1] if len(palette) > 1 else "plaster_cream_01",
        "red": palette[2] if len(palette) > 2 else "roof_deep_red_01",
        "brass": palette[3] if len(palette) > 3 else "metal_brass_01",
        "glow": palette[4] if len(palette) > 4 else "emissive_lantern_01",
        "dark": palette[5] if len(palette) > 5 else "wood_dark_01",
        "height": height,
        "base_radius": params["baseRadius"],
        "sides": params["sides"],
        "masonry_courses": params["masonryCourses"] if detail else 0,
        "masonry_blocks": params["masonryBlocks"],
        "band_count": params["bandCount"],
        "cottage_w": params["cottageWidth"],
        "foundation_h": foundation_h,
        "tower_h": height - 2.8,
    }


def _lighthouse_tower_base(ctx: dict, root) -> None:
    foundation_h = ctx["foundation_h"]
    base_radius = ctx["base_radius"]
    add_cylinder(
        "lighthouse_foundation",
        (0, 0, foundation_h * 0.5),
        base_radius + 0.06,
        foundation_h,
        ctx["stone"],
        root,
        vertices=ctx["sides"],
        bevel=0.06,
    )
    if ctx["masonry_courses"]:
        add_cylindrical_masonry(
            "lighthouse_foundation_masonry",
            0.0,
            foundation_h,
            base_radius + 0.18,
            base_radius + 0.10,
            (ctx["stone"],),
            root,
            courses=ctx["masonry_courses"],
            blocks_per_course=ctx["masonry_blocks"],
            seed=ctx["seed"] + 19,
            block_depth=0.22,
        )


def _lighthouse_banded_shaft(ctx: dict, root) -> None:
    foundation_h = ctx["foundation_h"]
    tower_h = ctx["tower_h"]
    base_radius = ctx["base_radius"]
    add_banded_tapered_tower(
        "lighthouse_tower_band",
        foundation_h,
        tower_h - foundation_h,
        base_radius * 0.92,
        base_radius * 0.54,
        (ctx["plaster"], ctx["red"]),
        root,
        bands=ctx["band_count"],
        sides=ctx["sides"],
    )
    for w_idx, wz in enumerate((3.4, 6.0, 8.6)):
        p = (wz - foundation_h) / (tower_h - foundation_h)
        wr = base_radius * (0.92 - p * 0.38)
        wy = -wr - 0.04
        add_box(
            f"lighthouse_window_{w_idx}",
            (0, wy, wz),
            (0.68, 0.16, 0.88),
            ctx["dark"],
            root,
            bevel=0.02,
        )
        add_box(
            f"lighthouse_window_{w_idx}_pane",
            (0, wy - 0.06, wz),
            (0.48, 0.06, 0.68),
            ctx["glow"],
            root,
            bevel=0.01,
        )


def _lighthouse_keeper_cottage(ctx: dict, root) -> None:
    cottage_w = ctx["cottage_w"]
    cottage_d = 2.4
    cottage_h = 2.4
    foundation_h = ctx["foundation_h"]
    cottage_x = ctx["base_radius"] * 0.85
    cottage_y = -0.30
    cottage_z = foundation_h + cottage_h * 0.5
    stone, plaster, red, dark = ctx["stone"], ctx["plaster"], ctx["red"], ctx["dark"]
    add_box("lighthouse_cottage_wall_core", (cottage_x, cottage_y, cottage_z), (cottage_w - 0.16, cottage_d - 0.16, cottage_h - 0.08), stone, root, bevel=0.02)
    add_box(
        "lighthouse_cottage_foundation",
        (cottage_x, cottage_y, foundation_h * 0.5),
        (cottage_w + 0.2, cottage_d + 0.2, foundation_h),
        stone,
        root,
        bevel=0.04,
    )
    if ctx["masonry_courses"]:
        add_masonry_courses(
            "lighthouse_cottage_masonry",
            (cottage_x, cottage_y, cottage_z),
            cottage_w,
            cottage_d,
            cottage_h,
            (stone,),
            root,
            courses=max(3, ctx["masonry_courses"] - 1),
            blocks_per_long_side=6,
            seed=ctx["seed"] + 31,
            block_depth=0.14,
            bevel=0.014,
        )
    _shingled_gable_roof(
        "lighthouse_cottage",
        cottage_w,
        cottage_d,
        foundation_h + cottage_h,
        32,
        red,
        dark,
        root,
        overhang_front=0.35,
        overhang_side=0.30,
        courses=3 if ctx["detail"] else 2,
        course_thickness=0.14,
        gable_token=plaster,
        center_x=cottage_x,
        center_y=cottage_y,
    )
    _architecture_shingle_rows(
        "lighthouse_cottage_shingles",
        cottage_w,
        cottage_d,
        foundation_h + cottage_h,
        32,
        (red,),
        root,
        rows=6 if ctx["detail"] else 2,
        columns=6 if ctx["detail"] else 3,
        seed=ctx["seed"] + 37,
        center_x=cottage_x,
        center_y=cottage_y,
        overhang_front=0.35,
        overhang_side=0.30,
    )
    add_box(
        "lighthouse_cottage_chimney_core",
        (cottage_x + cottage_w * 0.32, cottage_y + cottage_d * 0.25, foundation_h + cottage_h + 0.82),
        (0.52, 0.52, 1.64),
        stone,
        root,
        rotation=(0.004, -0.004, 0),
        bevel=0.025,
    )
    if ctx["detail"]:
        add_masonry_courses(
            "lighthouse_cottage_chimney_masonry",
            (cottage_x + cottage_w * 0.32, cottage_y + cottage_d * 0.25, foundation_h + cottage_h + 0.82),
            0.52,
            0.52,
            1.64,
            (stone,),
            root,
            courses=4,
            blocks_per_long_side=2,
            seed=ctx["seed"] + 41,
            block_depth=0.10,
            bevel=0.010,
        )
    add_box("lighthouse_cottage_chimney_crown", (cottage_x + cottage_w * 0.32, cottage_y + cottage_d * 0.25, foundation_h + cottage_h + 1.69), (0.64, 0.64, 0.14), stone, root, bevel=0.018)
    door_y = cottage_y - cottage_d * 0.5
    add_box(
        "lighthouse_cottage_door_reveal",
        (cottage_x, door_y + 0.04, foundation_h + 1.05),
        (1.02, 0.26, 2.04),
        dark,
        root,
        bevel=0.018,
    )
    for board in range(4):
        bx = cottage_x - 0.36 + board * 0.24
        add_box(f"lighthouse_cottage_door_board_{board}", (bx, door_y - 0.105, foundation_h + 1.04), (0.20, 0.055, 1.86), red if board % 3 else dark, root, rotation=(0, 0, 0.004 if board % 2 else -0.004), bevel=0.007)
    _add_rect_brace("lighthouse_cottage_door_brace", (cottage_x - 0.38, door_y - 0.145, foundation_h + 0.24), (cottage_x + 0.38, door_y - 0.145, foundation_h + 1.82), 0.085, 0.05, dark, root, plane="xz", bevel=0.006)
    add_box("lighthouse_cottage_window_reveal", (cottage_x - cottage_w * 0.30, door_y + 0.035, foundation_h + 1.45), (0.86, 0.22, 0.96), dark, root, bevel=0.014)
    add_mullioned_window(
        "lighthouse_cottage_window",
        (cottage_x - cottage_w * 0.30, door_y - 0.075, foundation_h + 1.45),
        0.64,
        0.74,
        dark,
        ctx["glow"],
        dark,
        root,
    )


def _lighthouse_gallery(ctx: dict, root) -> None:
    gallery_z = ctx["tower_h"] + 0.12
    gallery_r = ctx["base_radius"] * 0.72
    sides = ctx["sides"]
    stone, brass = ctx["stone"], ctx["brass"]
    ctx["gallery_z"] = gallery_z
    ctx["gallery_r"] = gallery_r
    add_cylinder("lighthouse_balcony_platform", (0, 0, gallery_z), gallery_r, 0.24, stone, root, vertices=sides, bevel=0.03)
    corbel_count = sides if ctx["detail"] else max(6, sides // 2)
    for c_idx in range(corbel_count):
        angle = c_idx * math.tau / sides
        add_tri_prism(
            f"lighthouse_corbel_{c_idx:02d}",
            (math.cos(angle) * (gallery_r - 0.22), math.sin(angle) * (gallery_r - 0.22), gallery_z - 0.28),
            (0.22, 0.44, 0.52),
            stone,
            root,
            rotation=(math.pi / 2, 0, angle),
        )
    rail_h = 0.85
    add_ring("lighthouse_rail_top", (0, 0, gallery_z + rail_h), gallery_r - 0.10, 0.032, brass, root, major_segments=sides, minor_segments=4)
    add_ring("lighthouse_rail_mid", (0, 0, gallery_z + rail_h * 0.5), gallery_r - 0.10, 0.024, brass, root, major_segments=sides, minor_segments=4)
    rail_posts = sides if ctx["detail"] else max(6, sides // 2)
    for p_idx in range(rail_posts):
        angle = p_idx * math.tau / rail_posts
        add_cylinder(
            f"lighthouse_rail_post_{p_idx:02d}",
            (math.cos(angle) * (gallery_r - 0.10), math.sin(angle) * (gallery_r - 0.10), gallery_z + rail_h * 0.5),
            0.032,
            rail_h,
            brass,
            root,
            vertices=6,
        )


def _lighthouse_lantern_room(ctx: dict, root) -> None:
    gallery_z = ctx["gallery_z"]
    gallery_r = ctx["gallery_r"]
    lantern_r = gallery_r * 0.62
    lantern_h = 1.45
    lantern_cz = gallery_z + 0.12 + lantern_h * 0.5
    sides = ctx["sides"]
    add_cylinder("lighthouse_lantern_beacon", (0, 0, lantern_cz), lantern_r, lantern_h, ctx["glow"], root, vertices=sides)
    strut_count = sides if ctx["detail"] else max(6, sides // 2)
    for f_idx in range(strut_count):
        angle = f_idx * math.tau / strut_count
        add_cylinder(
            f"lighthouse_lantern_strut_{f_idx:02d}",
            (math.cos(angle) * lantern_r, math.sin(angle) * lantern_r, lantern_cz),
            0.028,
            lantern_h + 0.04,
            ctx["brass"],
            root,
            vertices=6,
        )
    cupola_base_z = gallery_z + 0.12 + lantern_h
    cupola_h = 1.15
    add_cone("lighthouse_cupola_roof", (0, 0, cupola_base_z + cupola_h * 0.5), lantern_r + 0.18, 0.06, cupola_h, ctx["red"], root, vertices=sides)
    add_ico("lighthouse_finial_ball", (0, 0, cupola_base_z + cupola_h + 0.12), (0.14, 0.14, 0.14), ctx["brass"], root, subdivisions=2)
    add_cylinder("lighthouse_spire", (0, 0, cupola_base_z + cupola_h + 0.45), 0.038, 0.65, ctx["brass"], root, vertices=6)


def _build_lighthouse(spec: dict, root) -> None:
    """Authored coastal lighthouse matching lighthouse_isolated: bands, cottage, gallery, beacon."""
    ctx = _lighthouse_context(spec)
    _lighthouse_tower_base(ctx, root)
    _lighthouse_banded_shaft(ctx, root)
    _lighthouse_keeper_cottage(ctx, root)
    _lighthouse_gallery(ctx, root)
    _lighthouse_lantern_room(ctx, root)



def stone_bridge(spec: dict, root) -> None:
    _finish_architecture(spec, root, _build_stone_bridge)


def _bridge_context(spec: dict) -> dict:
    """Catalog parameters plus palette for brief-component stone-bridge builders."""
    params = spec["parameters"]
    palette = spec["palette"]
    detail = _is_hero_detail(spec)
    return {
        "spec": spec,
        "seed": spec["seed"],
        "detail": detail,
        "stone": palette[0],
        "shadow": palette[1] if len(palette) > 1 else "stone_warm_01",
        "timber": palette[2] if len(palette) > 2 else "wood_weathered_01",
        "dark": palette[3] if len(palette) > 3 else "wood_dark_01",
        "lantern_glow": palette[4] if len(palette) > 4 else "emissive_lantern_01",
        "length": params["length"],
        "width": params["width"],
        "arch_count": params["archCount"],
        "masonry_courses": params["masonryCourses"] if detail else 0,
        "rail_posts": params["railPosts"] if detail else max(5, params["railPosts"] // 2),
    }


def _bridge_piers(ctx: dict, root) -> None:
    """Central pier, cutwaters, and bank abutments."""
    length = ctx["length"]
    width = ctx["width"]
    arch_count = ctx["arch_count"]
    detail = ctx["detail"]
    seed = ctx["seed"]
    masonry_courses = ctx["masonry_courses"]
    rail_posts = ctx["rail_posts"]
    stone = ctx["stone"]
    shadow = ctx["shadow"]
    timber = ctx["timber"]
    dark = ctx["dark"]
    lantern_glow = ctx["lantern_glow"]

    # 1. Central Pier with Triangular Cutwaters (Standing on Ground Z=0)
    pier_w = 1.65
    pier_h = 2.18
    add_box(
        "bridge_center_pier",
        (0, 0, pier_h * 0.5),
        (pier_w, width + 0.10, pier_h),
        shadow,
        root,
        bevel=0.06,
    )
    if masonry_courses:
        add_masonry_courses(
            "bridge_pier_masonry",
            (0, 0, pier_h * 0.5),
            pier_w,
            width + 0.10,
            pier_h,
            (stone, shadow),
            root,
            courses=masonry_courses,
            blocks_per_long_side=3,
            seed=seed + 53,
            block_depth=0.16,
            bevel=0.016,
        )
    # Pier cap
    add_box(
        "bridge_center_pier_cap",
        (0, 0, pier_h + 0.08),
        (pier_w + 0.18, width + 0.16, 0.16),
        stone,
        root,
        bevel=0.04,
    )
    # Triangular cutwater breakwaters
    for c_idx, y_sign in enumerate((-1, 1)):
        c_name = "front" if y_sign < 0 else "back"
        cy = y_sign * (width * 0.5 + 0.15)
        add_tri_prism(
            f"bridge_cutwater_{c_name}",
            (0, cy, pier_h * 0.45),
            (pier_w * 0.90, 0.32, pier_h * 0.90),
            shadow,
            root,
            rotation=(0, 0, (0 if y_sign > 0 else math.pi)),
        )

    # 2. Left & Right Bank Abutments (Standing on Ground Z=0)
    abutment_w = 1.85
    abutment_h = 2.62
    for s_idx, ax in enumerate((-length * 0.46, length * 0.46)):
        add_box(
            f"bridge_abutment_{s_idx}",
            (ax, 0, abutment_h * 0.5),
            (abutment_w, width + 0.16, abutment_h),
            shadow,
            root,
            bevel=0.06,
        )
        if masonry_courses:
            add_masonry_courses(
                f"bridge_abutment_masonry_{s_idx}",
                (ax, 0, abutment_h * 0.5),
                abutment_w,
                width + 0.16,
                abutment_h,
                (stone, shadow),
                root,
                courses=max(4, masonry_courses + 1),
                blocks_per_long_side=4,
                seed=seed + 61 + s_idx * 7,
                block_depth=0.17,
                bevel=0.015,
            )
        # Bank-contact boulders remain partly exposed after the abutment is
        # embedded into the authored terrain approach.
        for b_idx, by_sign in enumerate((-1, 1)):
            add_ico(
                f"bridge_ground_rock_{s_idx}_{b_idx}",
                (ax + (-0.48 if ax < 0 else 0.48), by_sign * (width * 0.5 + 0.18), 2.40),
                (0.70, 0.66, 0.54),
                shadow,
                root,
                subdivisions=1,
            )


def _bridge_arches(ctx: dict, root) -> None:
    """Open barrel vaults, voussoirs, and keystones."""
    length = ctx["length"]
    width = ctx["width"]
    arch_count = ctx["arch_count"]
    detail = ctx["detail"]
    seed = ctx["seed"]
    masonry_courses = ctx["masonry_courses"]
    rail_posts = ctx["rail_posts"]
    stone = ctx["stone"]
    shadow = ctx["shadow"]
    timber = ctx["timber"]
    dark = ctx["dark"]
    lantern_glow = ctx["lantern_glow"]

    # 3. Two Masonry Arches with Radial Voussoir Rings & Keystones
    if arch_count == 1:
        arch_centers = (0.0,)
    else:
        span = length * 0.46
        arch_centers = tuple(-length * 0.23 + index * span / (arch_count - 1) for index in range(arch_count))
    arch_radius = 1.58
    arch_center_z = 0.46
    ctx["arch_centers"] = arch_centers
    ctx["arch_radius"] = arch_radius
    ctx["arch_center_z"] = arch_center_z
    for a_idx, acx in enumerate(arch_centers):
        # Open Arch Barrel Vault Inner Lining (upper semicircular curve above water level)
        vault_segments = 9 if detail else 5
        for vl_idx in range(vault_segments):
            v_angle = math.pi * (vl_idx + 0.5) / vault_segments
            lx = acx + math.cos(v_angle) * (arch_radius - 0.02)
            lz = arch_center_z + math.sin(v_angle) * (arch_radius - 0.02)
            seg_chord = (math.pi * arch_radius / vault_segments) + 0.04
            add_box(
                f"bridge_arch_vault_liner_{a_idx}_{vl_idx:02d}",
                (lx, 0, lz),
                (seg_chord, width - 0.16, 0.08),
                shadow,
                root,
                rotation=(0, -v_angle + math.pi * 0.5, 0),
                bevel=0.015,
            )
        # Radial voussoir arch ring segments along the arch curve
        voussoir_count = 11 if detail else 6
        for v_idx in range(voussoir_count):
            angle = math.pi * (v_idx + 0.5) / voussoir_count
            vx = acx + math.cos(angle) * (arch_radius + 0.14)
            vz = arch_center_z + math.sin(angle) * (arch_radius + 0.14)
            # Front & back voussoirs
            for y_side, y_pos in (("front", -width * 0.48), ("back", width * 0.48)):
                add_box(
                    f"bridge_voussoir_{a_idx}_{v_idx:02d}_{y_side}",
                    (vx, y_pos, vz),
                    (0.36, 0.16, 0.24),
                    stone,
                    root,
                    rotation=(0, -angle + math.pi * 0.5, 0),
                    bevel=0.02,
                )
        # Prominent central keystone at top of each arch
        for y_side, y_pos in (("front", -width * 0.48), ("back", width * 0.48)):
            add_box(
                f"bridge_keystone_{a_idx}_{y_side}",
                (acx, y_pos, arch_center_z + arch_radius + 0.20),
                (0.42, 0.20, 0.36),
                stone,
                root,
                bevel=0.025,
            )


def _bridge_deck(ctx: dict, root) -> None:
    """Spandrel walls and crowned stone roadway."""
    length = ctx["length"]
    width = ctx["width"]
    arch_count = ctx["arch_count"]
    detail = ctx["detail"]
    seed = ctx["seed"]
    masonry_courses = ctx["masonry_courses"]
    rail_posts = ctx["rail_posts"]
    stone = ctx["stone"]
    shadow = ctx["shadow"]
    timber = ctx["timber"]
    dark = ctx["dark"]
    lantern_glow = ctx["lantern_glow"]
    arch_centers = ctx["arch_centers"]
    arch_radius = ctx["arch_radius"]
    arch_center_z = ctx["arch_center_z"]

    # 4. Spandrel Side Walls & Smooth Crowned Roadway Deck
    deck_segments = 16 if detail else 8
    seg_len = length / deck_segments
    ctx["deck_segments"] = deck_segments
    ctx["seg_len"] = seg_len
    for seg in range(deck_segments):
        x = -length * 0.5 + seg_len * (seg + 0.5)
        norm_x = x / (length * 0.5)
        crown = 0.68 * (1.0 - norm_x * norm_x)
        slope = math.atan((-2.72 * x) / (length * length))
        deck_z = 2.45 + crown

        # Continuous stone roadway slab
        add_box(
            f"bridge_road_segment_{seg:02d}",
            (x, 0, deck_z),
            (seg_len + 0.05, width - 0.24, 0.28),
            stone,
            root,
            rotation=(0, slope, 0),
            bevel=0.03,
        )

        # Spandrel walls beneath the deck - leaving the semicircular arch holes open!
        arch_bottom_z = 0.0
        for acx in arch_centers:
            dx = abs(x - acx)
            if dx < arch_radius:
                arch_h = math.sqrt(arch_radius * arch_radius - dx * dx)
                arch_bottom_z = max(arch_bottom_z, arch_center_z + arch_h)

        spandrel_h = deck_z - arch_bottom_z
        if spandrel_h > 0.06:
            spandrel_cz = arch_bottom_z + spandrel_h * 0.5
            for y_side, y_pos in (("left", -width * 0.46), ("right", width * 0.46)):
                if detail:
                    courses = max(1, math.ceil(spandrel_h / 0.42))
                    course_h = spandrel_h / courses
                    for course in range(courses):
                        token = stone if (seg + course) % 3 else shadow
                        add_box(
                            f"bridge_spandrel_{y_side}_{seg:02d}_{course:02d}",
                            (
                                x + (0.025 if (seg + course) % 2 else -0.018),
                                y_pos + (-0.018 if y_side == "left" else 0.018) * (course % 2),
                                arch_bottom_z + course_h * (course + 0.5),
                            ),
                            (seg_len * (0.92 if course % 2 else 0.97), 0.21 + 0.015 * (course % 2), course_h * 0.84),
                            token,
                            root,
                            rotation=(0, 0.006 if (seg + course) % 2 else -0.005, 0.008 if seg % 3 == 1 else -0.006),
                            bevel=0.016,
                        )
                else:
                    add_box(
                        f"bridge_spandrel_{y_side}_{seg:02d}",
                        (x, y_pos, spandrel_cz),
                        (seg_len + 0.04, 0.20, spandrel_h),
                        stone if seg % 3 != 1 else shadow,
                        root,
                        bevel=0.012,
                    )

        # Low stone curb along road edge
        for c_side, cy in (("left", -width * 0.44), ("right", width * 0.44)):
            add_box(
                f"bridge_curb_{c_side}_{seg:02d}",
                (x, cy, deck_z + 0.18),
                (seg_len + 0.04, 0.16, 0.14),
                stone,
                root,
                rotation=(0, slope, 0),
                bevel=0.02,
            )


def _bridge_rails(ctx: dict, root) -> None:
    """Timber rails following the crown plus corner lantern."""
    length = ctx["length"]
    width = ctx["width"]
    arch_count = ctx["arch_count"]
    detail = ctx["detail"]
    seed = ctx["seed"]
    masonry_courses = ctx["masonry_courses"]
    rail_posts = ctx["rail_posts"]
    stone = ctx["stone"]
    shadow = ctx["shadow"]
    timber = ctx["timber"]
    dark = ctx["dark"]
    lantern_glow = ctx["lantern_glow"]
    deck_segments = ctx["deck_segments"]
    seg_len = ctx["seg_len"]

    # 5. Rustic Wooden Guardrails Running Continuously with Deck Crown
    post_count = rail_posts
    for p_idx in range(post_count):
        px = -length * 0.46 + p_idx * (length * 0.92) / (post_count - 1)
        norm_px = px / (length * 0.5)
        crown_p = 0.68 * (1.0 - norm_px * norm_px)
        pz = 2.55 + crown_p
        for y_side, py in (("left", -width * 0.48), ("right", width * 0.48)):
            add_box(
                f"bridge_rail_post_{y_side}_{p_idx:02d}",
                (px, py, pz + 0.48),
                (0.16, 0.16, 0.98),
                dark,
                root,
                bevel=0.02,
            )

    # Horizontal wooden top & mid safety rails
    for y_side, py in (("left", -width * 0.48), ("right", width * 0.48)):
        for seg in range(deck_segments):
            x = -length * 0.5 + seg_len * (seg + 0.5)
            norm_x = x / (length * 0.5)
            crown = 0.68 * (1.0 - norm_x * norm_x)
            slope = math.atan((-2.72 * x) / (length * length))
            rz = 2.55 + crown
            add_box(
                f"bridge_rail_top_{y_side}_{seg:02d}",
                (x, py, rz + 0.92),
                (seg_len + 0.06, 0.10, 0.10),
                timber,
                root,
                rotation=(0, slope, 0),
                bevel=0.015,
            )
            add_box(
                f"bridge_rail_mid_{y_side}_{seg:02d}",
                (x, py, rz + 0.52),
                (seg_len + 0.06, 0.08, 0.08),
                timber,
                root,
                rotation=(0, slope, 0),
                bevel=0.012,
            )

    # 6. Bridge Corner Entry Post with Warm Glowing Lantern
    lamp_x = -length * 0.46
    lamp_y = -width * 0.48
    lamp_z = 2.55 + 0.68 * (1.0 - (lamp_x / (length * 0.5)) ** 2) + 0.98
    add_box(
        "bridge_lantern_bracket",
        (lamp_x, lamp_y - 0.12, lamp_z + 0.15),
        (0.06, 0.22, 0.06),
        dark,
        root,
        bevel=0.008,
    )
    add_box(
        "bridge_lantern_frame",
        (lamp_x, lamp_y - 0.22, lamp_z),
        (0.22, 0.22, 0.32),
        dark,
        root,
        bevel=0.012,
    )
    add_ico(
        "bridge_lantern_glow",
        (lamp_x, lamp_y - 0.22, lamp_z),
        (0.09, 0.09, 0.14),
        lantern_glow,
        root,
        subdivisions=2,
    )


def _build_stone_bridge(spec: dict, root) -> None:
    """Authored village double-arched stone bridge matching stone_bridge_isolated."""
    ctx = _bridge_context(spec)
    _bridge_piers(ctx, root)
    _bridge_arches(ctx, root)
    _bridge_deck(ctx, root)
    _bridge_rails(ctx, root)



def _dock_context(spec: dict) -> dict:
    """Catalog parameters plus palette for brief-component dock builders."""
    params = spec["parameters"]
    palette = spec["palette"]
    return {
        "spec": spec,
        "honey": palette[0],
        "weathered": palette[1] if len(palette) > 1 else "wood_weathered_01",
        "red": palette[2] if len(palette) > 2 else "accent_red_01",
        "canvas": palette[3] if len(palette) > 3 else "canvas_cream_01",
        "dark": palette[4] if len(palette) > 4 else "wood_dark_01",
        "stone": "stone_cool_01" if "stone_cool_01" in palette else palette[4],
        "length": params["length"],
        "width": params["width"],
        "has_canopy": params["canopy"],
        "deck_planks": params["deckPlanks"],
        "pile_rows": params["pileRows"],
        "deck_z": 2.48,
        "deck_thickness": 0.14,
    }


def _dock_deck(ctx: dict, root) -> None:
    """Walkable plank pier and curb beams."""
    length = ctx["length"]
    width = ctx["width"]
    has_canopy = ctx["has_canopy"]
    deck_planks = ctx["deck_planks"]
    pile_rows = ctx["pile_rows"]
    deck_z = ctx["deck_z"]
    deck_thickness = ctx["deck_thickness"]
    honey = ctx["honey"]
    weathered = ctx["weathered"]
    red = ctx["red"]
    canvas = ctx["canvas"]
    dark = ctx["dark"]
    spec = ctx["spec"]

    # 1. Solid Continuous Timber Deck (No Zebra Gaps!)
    add_box(
        "dock_deck_substructure",
        (0, 0, deck_z - 0.08),
        (length, width, 0.16),
        weathered,
        root,
        bevel=0.02,
    )
    # Walkable timber surface planks (unified warm wood tones)
    add_plank_field(
        "dock_deck_planks",
        (0, 0, deck_z + 0.05),
        length - 0.04,
        width - 0.04,
        deck_thickness,
        (honey, honey, weathered, honey),
        root,
        count=deck_planks,
        axis="x",
        seed=spec["seed"] + 59,
        bevel=0.012,
    )
    # Perimeter curb/coaming beams
    for side_idx, cy in enumerate((-width * 0.5 + 0.07, width * 0.5 - 0.07)):
        add_box(
            f"dock_curb_beam_{side_idx}",
            (0, cy, deck_z + 0.12),
            (length + 0.06, 0.14, 0.16),
            dark,
            root,
            bevel=0.015,
        )


def _dock_pilings(ctx: dict, root) -> None:
    """Paired weathered pilings, stone footings, caps, and braces."""
    length = ctx["length"]
    width = ctx["width"]
    pile_rows = ctx["pile_rows"]
    deck_z = ctx["deck_z"]
    weathered = ctx["weathered"]
    dark = ctx["dark"]
    stone = ctx["stone"]

    footing_h = 0.30
    footing_xy = 0.64
    pile_h = 2.22

    # 2. Tapered pilings on aligned square stone footings
    for r_idx in range(pile_rows):
        px = -length * 0.44 + r_idx * (length * 0.88) / (pile_rows - 1)
        for s_idx, py in enumerate((-width * 0.46, width * 0.46)):
            add_box(
                f"dock_piling_footing_{r_idx}_{s_idx}",
                (px, py, footing_h * 0.5),
                (footing_xy, footing_xy, footing_h),
                stone,
                root,
                bevel=0.04,
            )
            add_cone(
                f"dock_piling_{r_idx}_{s_idx}",
                (px, py, footing_h + pile_h * 0.5),
                0.26,
                0.18,
                pile_h,
                weathered,
                root,
                vertices=8,
            )
            add_cylinder(
                f"dock_piling_waterline_{r_idx}_{s_idx}",
                (px, py, 0.42),
                0.275,
                0.32,
                dark,
                root,
                vertices=8,
                bevel=0.012,
            )
            add_box(
                f"dock_piling_cap_{r_idx}_{s_idx}",
                (px, py, deck_z + 0.22),
                (0.46, 0.46, 0.26),
                dark,
                root,
                bevel=0.025,
            )

        # Transverse cross-brace between pilings under deck
        add_beam(
            f"dock_under_brace_{r_idx}",
            (px, -width * 0.44, 0.95),
            (px, width * 0.44, 2.05),
            0.065,
            weathered,
            root,
            vertices=6,
        )

    # Longitudinal side diagonal cross-braces
    for s_idx, py in enumerate((-width * 0.44, width * 0.44)):
        add_beam(
            f"dock_diag_brace_left_{s_idx}",
            (-length * 0.42, py, 0.45),
            (-length * 0.15, py, 2.05),
            0.065,
            weathered,
            root,
            vertices=6,
        )
        add_beam(
            f"dock_diag_brace_right_{s_idx}",
            (length * 0.15, py, 2.05),
            (length * 0.42, py, 0.45),
            0.065,
            weathered,
            root,
            vertices=6,
        )


def _dock_canopy(ctx: dict, root) -> None:
    """Striped stall canopy, hardware, and dock cargo."""
    length = ctx["length"]
    width = ctx["width"]
    has_canopy = ctx["has_canopy"]
    deck_planks = ctx["deck_planks"]
    pile_rows = ctx["pile_rows"]
    deck_z = ctx["deck_z"]
    deck_thickness = ctx["deck_thickness"]
    honey = ctx["honey"]
    weathered = ctx["weathered"]
    red = ctx["red"]
    canvas = ctx["canvas"]
    dark = ctx["dark"]
    spec = ctx["spec"]

    # 3. Small lean-to stall: one slope toward the working long edge (-Y).
    if has_canopy:
        stall_x = 0.70
        stall_w = 2.20
        stall_d = 1.50
        front_py = -stall_d * 0.44
        rear_py = stall_d * 0.44
        front_h = 1.72
        rear_h = 2.28
        span_y = rear_py - front_py
        pitch = math.atan((rear_h - front_h) / span_y)
        slope_len = math.hypot(span_y, rear_h - front_h) + 0.16
        mid_z = deck_z + (front_h + rear_h) * 0.5 + 0.06

        for p_idx, (px, py, post_h) in enumerate((
            (stall_x - stall_w * 0.44, front_py, front_h),
            (stall_x + stall_w * 0.44, front_py, front_h),
            (stall_x - stall_w * 0.44, rear_py, rear_h),
            (stall_x + stall_w * 0.44, rear_py, rear_h),
        )):
            add_box(
                f"dock_canopy_post_{p_idx}",
                (px, py, deck_z + post_h * 0.5),
                (0.14, 0.14, post_h),
                dark,
                root,
                bevel=0.018,
            )

        add_box(
            "dock_canopy_eave",
            (stall_x, front_py, deck_z + front_h + 0.04),
            (stall_w * 0.94, 0.10, 0.10),
            dark,
            root,
            bevel=0.012,
        )
        add_box(
            "dock_canopy_ridge",
            (stall_x, rear_py, deck_z + rear_h + 0.04),
            (stall_w * 0.94, 0.12, 0.12),
            dark,
            root,
            bevel=0.014,
        )

        panel_count = 6
        panel_span = stall_w + 0.18
        panel_w = panel_span / panel_count
        for panel in range(panel_count):
            px = stall_x - panel_span * 0.5 + panel_w * (panel + 0.5)
            token = red if panel % 2 else canvas
            add_box(
                f"dock_canopy_panel_{panel:02d}",
                (px, 0.0, mid_z),
                (panel_w * 0.94, slope_len, 0.07),
                token,
                root,
                rotation=(pitch, 0, 0),
                bevel=0.008,
            )
        for rafter in range(3):
            px = stall_x - stall_w * 0.44 + stall_w * 0.88 * rafter / 2
            add_box(
                f"dock_canopy_rafter_{rafter}",
                (px, 0.0, mid_z - 0.05),
                (0.07, slope_len * 0.96, 0.07),
                dark,
                root,
                rotation=(pitch, 0, 0),
                bevel=0.006,
            )

        add_box(
            "dock_counter_body",
            (stall_x, -0.06, deck_z + 0.38),
            (stall_w * 0.78, 0.68, 0.70),
            honey,
            root,
            bevel=0.022,
        )
        add_plank_field(
            "dock_counter_front_planks",
            (stall_x, -0.40, deck_z + 0.38),
            stall_w * 0.74,
            0.06,
            0.62,
            (honey, weathered),
            root,
            count=6,
            axis="x",
            seed=spec["seed"] + 81,
            bevel=0.008,
        )
        add_box(
            "dock_counter_top",
            (stall_x, -0.06, deck_z + 0.75),
            (stall_w * 0.82, 0.76, 0.10),
            dark,
            root,
            bevel=0.012,
        )

    # 4. Mooring Cleats, Coiled Ropes, Ladders & Crates
    for c_idx, cx in enumerate((-length * 0.42, 0.0, length * 0.42)):
        add_mooring_cleat(
            f"dock_t_cleat_{c_idx}",
            (cx, -width * 0.48, deck_z + 0.14),
            0.28,
            dark,
            root,
            yaw=0,
        )

    # Tied hanging catenary mooring rope
    add_catenary_rope(
        "dock_mooring_rope_catenary",
        (-length * 0.42, -width * 0.48, deck_z + 0.20),
        (0.0, -width * 0.48, deck_z + 0.20),
        0.26,
        0.030,
        canvas,
        root,
    )

    # Coiled ropes on deck matching isolated reference
    add_ring(
        "dock_rope_coil_01",
        (-length * 0.22, -width * 0.22, deck_z + 0.16),
        0.28,
        0.035,
        canvas,
        root,
        major_segments=10,
        minor_segments=4,
    )
    add_ring(
        "dock_rope_coil_02",
        (-length * 0.32, -width * 0.22, deck_z + 0.16),
        0.24,
        0.030,
        canvas,
        root,
        major_segments=10,
        minor_segments=4,
    )

    # Wooden boarding ladders on the working long edge, down to the water.
    for side_idx, lx in enumerate((-length * 0.28, length * 0.28)):
        for rung in range(8):
            add_box(
                f"dock_ladder_rung_{side_idx}_{rung}",
                (lx, -width * 0.52, 0.28 + rung * 0.28),
                (0.58, 0.08, 0.07),
                weathered,
                root,
                bevel=0.01,
            )
        for rail_idx, rx in enumerate((lx - 0.30, lx + 0.30)):
            add_box(
                f"dock_ladder_rail_{side_idx}_{rail_idx}",
                (rx, -width * 0.52, deck_z * 0.5 + 0.08),
                (0.08, 0.08, deck_z + 0.12),
                weathered,
                root,
                bevel=0.012,
            )

    # Stacked wooden fish crates
    for crate_idx, (cx, cy) in enumerate(((-length * 0.32, width * 0.24), (-length * 0.22, width * 0.24))):
        add_box(
            f"dock_fish_crate_{crate_idx}",
            (cx, cy, deck_z + 0.22),
            (0.72, 0.55, 0.38),
            honey if crate_idx % 2 else weathered,
            root,
            bevel=0.015,
        )


def _dock_shore_stairs(ctx: dict, root) -> None:
    """Timber stairs from the shore apron up onto the raised pier."""
    length = ctx["length"]
    honey = ctx["honey"]
    weathered = ctx["weathered"]
    dark = ctx["dark"]
    deck_z = ctx["deck_z"]
    n_steps = 5
    tread = 0.34
    riser = 0.18
    stair_w = 3.40
    deck_top = deck_z + 0.12
    for i in range(n_steps):
        px = length * 0.5 + 0.16 + i * tread
        tread_top = deck_top - i * riser
        add_box(
            f"dock_stair_tread_{i}",
            (px, 0.0, tread_top - 0.07),
            (tread + 0.04, stair_w, 0.14),
            honey if i % 2 == 0 else weathered,
            root,
            bevel=0.012,
        )
    run = n_steps * tread
    for s_idx, sy in enumerate((-stair_w * 0.5 - 0.06, stair_w * 0.5 + 0.06)):
        add_box(
            f"dock_stair_stringer_{s_idx}",
            (length * 0.5 + 0.16 + run * 0.5, sy, (deck_top + 1.55) * 0.5),
            (run + 0.22, 0.12, deck_top - 1.42),
            dark,
            root,
            bevel=0.014,
        )
    for rail_idx, (rx, ry) in enumerate((
        (length * 0.5 + 0.22, -stair_w * 0.5 + 0.08),
        (length * 0.5 + 0.22, stair_w * 0.5 - 0.08),
        (length * 0.5 + run - 0.08, -stair_w * 0.5 + 0.08),
        (length * 0.5 + run - 0.08, stair_w * 0.5 - 0.08),
    )):
        rail_h = 0.72 if rail_idx < 2 else 0.42
        rail_z = (deck_top if rail_idx < 2 else deck_top - n_steps * riser) + 0.28
        add_box(
            f"dock_stair_newel_{rail_idx}",
            (rx, ry, rail_z),
            (0.10, 0.10, rail_h),
            dark,
            root,
            bevel=0.012,
        )


def working_dock(spec: dict, root) -> None:
    """Authored harbor working dock matching dock_market_isolated."""
    ctx = _dock_context(spec)
    _dock_deck(ctx, root)
    _dock_pilings(ctx, root)
    _dock_shore_stairs(ctx, root)
    _dock_canopy(ctx, root)
    add_collision_primitives(spec, root)



def fish_market(spec: dict, root) -> None:
    _finish_architecture(spec, root, _build_fish_market, preserve_names=("fish_market_lantern_glow",))


def _fish_market_context(spec: dict) -> dict:
    """Catalog parameters plus palette for brief-component fish-market builders."""
    params = spec["parameters"]
    palette = spec["palette"]
    detail = _is_hero_detail(spec)
    foundation_h = 0.76
    wall_height = params["wallHeight"]
    wall_base = foundation_h + 0.06
    stone_tokens = tuple(token for token in palette if token.startswith("stone_")) or (palette[0],)
    return {
        "spec": spec,
        "seed": spec["seed"],
        "detail": detail,
        "stone": palette[0],
        "weathered": palette[1] if len(palette) > 1 else "wood_weathered_01",
        "roof": palette[2] if len(palette) > 2 else "roof_deep_red_01",
        "teal": palette[3] if len(palette) > 3 else "accent_teal_01",
        "canvas": palette[4] if len(palette) > 4 else "canvas_cream_01",
        "dark": palette[5] if len(palette) > 5 else "wood_dark_01",
        "glass": "emissive_window_01" if "emissive_window_01" in palette else (palette[4] if len(palette) > 4 else "canvas_cream_01"),
        "stone_tokens": stone_tokens,
        "width": params["width"],
        "depth": params["depth"],
        "wall_height": wall_height,
        "pitch_deg": params["roofPitchDeg"],
        "masonry_courses": params["masonryCourses"] if detail else 0,
        "masonry_blocks": params["masonryBlocks"],
        "shingle_rows": params["shingleRows"] if detail else max(3, params["shingleRows"] // 2),
        "shingle_columns": params["shingleColumns"] if detail else max(4, params["shingleColumns"] // 2),
        "porch_depth": params["porchDepth"],
        "porch_planks": params["porchPlanks"] if detail else max(4, params["porchPlanks"] // 2),
        "stall_width": 5.2,
        "foundation_h": foundation_h,
        "wall_base": wall_base,
        "wall_cz": wall_base + wall_height * 0.5,
        "wall_top": wall_base + wall_height,
        "front_y": -params["depth"] * 0.5,
        "stall_deck_z": wall_base + 0.12,
    }


def _fish_market_aligned_plinth(ctx: dict, root) -> None:
    """Flush stacked-bond masonry so the plinth sits on a shared ground plane."""
    width = ctx["width"] + 0.68
    depth = ctx["depth"] + 0.68
    height = ctx["foundation_h"]
    courses = ctx["masonry_courses"]
    long_blocks = ctx["masonry_blocks"]
    course_h = height / courses
    block_depth = 0.22
    short_blocks = max(3, round(long_blocks * depth / max(width, 0.001)))
    tokens = ctx["stone_tokens"]
    for course in range(courses):
        z = course_h * (course + 0.5)
        for face, axis, span, count, fixed in (
            ("front", "x", width, long_blocks, -depth * 0.5 - block_depth * 0.35),
            ("back", "x", width, long_blocks, depth * 0.5 + block_depth * 0.35),
            ("left", "y", depth, short_blocks, -width * 0.5 - block_depth * 0.35),
            ("right", "y", depth, short_blocks, width * 0.5 + block_depth * 0.35),
        ):
            block_span = span / count
            for index in range(count):
                along = -span * 0.5 + block_span * (index + 0.5)
                token = tokens[(course + index) % len(tokens)]
                if axis == "x":
                    location = (along, fixed, z)
                    dimensions = (block_span * 0.98, block_depth, course_h * 0.96)
                else:
                    location = (fixed, along, z)
                    dimensions = (block_depth, block_span * 0.98, course_h * 0.96)
                add_box(
                    f"fish_market_foundation_masonry_{face}_{course:02d}_{index:02d}",
                    location,
                    dimensions,
                    token,
                    root,
                    bevel=0.012,
                )


def _fish_market_glazed_window(name, location, width, height, ctx: dict, root) -> None:
    """Hollow frame + proud emissive panes so the opening reads as glass, not a wood slab."""
    cx, cy, cz = location
    frame, glass, mullion = ctx["dark"], ctx["glass"], ctx["weathered"]
    add_box(f"{name}_glass", (cx, cy - 0.05, cz), (width * 0.90, 0.035, height * 0.90), glass, root, bevel=0.006)
    add_box(f"{name}_mullion_v", (cx, cy - 0.07, cz), (0.04, 0.04, height * 0.88), mullion, root, bevel=0.005)
    add_box(f"{name}_mullion_h", (cx, cy - 0.07, cz), (width * 0.88, 0.04, 0.04), mullion, root, bevel=0.005)
    add_box(f"{name}_frame_l", (cx - width * 0.5, cy - 0.02, cz), (0.10, 0.12, height + 0.16), frame, root, bevel=0.012)
    add_box(f"{name}_frame_r", (cx + width * 0.5, cy - 0.02, cz), (0.10, 0.12, height + 0.16), frame, root, bevel=0.012)
    add_box(f"{name}_frame_t", (cx, cy - 0.02, cz + height * 0.5), (width + 0.16, 0.12, 0.10), frame, root, bevel=0.012)
    add_box(f"{name}_frame_b", (cx, cy - 0.02, cz - height * 0.5), (width + 0.16, 0.12, 0.10), frame, root, bevel=0.012)


def _fish_market_glazed_side_window(name, x, y, z, width, height, ctx: dict, root, *, side: int) -> None:
    frame, glass, mullion = ctx["dark"], ctx["glass"], ctx["weathered"]
    add_box(f"{name}_glass", (x + side * 0.05, y, z), (0.035, width * 0.90, height * 0.90), glass, root, bevel=0.006)
    add_box(f"{name}_mullion_v", (x + side * 0.07, y, z), (0.04, 0.04, height * 0.88), mullion, root, bevel=0.005)
    add_box(f"{name}_mullion_h", (x + side * 0.07, y, z), (0.04, width * 0.88, 0.04), mullion, root, bevel=0.005)
    add_box(f"{name}_frame_l", (x + side * 0.02, y - width * 0.5, z), (0.12, 0.10, height + 0.16), frame, root, bevel=0.012)
    add_box(f"{name}_frame_r", (x + side * 0.02, y + width * 0.5, z), (0.12, 0.10, height + 0.16), frame, root, bevel=0.012)
    add_box(f"{name}_frame_t", (x + side * 0.02, y, z + height * 0.5), (0.12, width + 0.16, 0.10), frame, root, bevel=0.012)
    add_box(f"{name}_frame_b", (x + side * 0.02, y, z - height * 0.5), (0.12, width + 0.16, 0.10), frame, root, bevel=0.012)


def _fish_market_foundation(ctx: dict, root) -> None:
    """Aligned masonry plinth with a water-table lip."""
    width = ctx["width"]
    depth = ctx["depth"]
    stone = ctx["stone"]
    foundation_h = ctx["foundation_h"]
    add_box(
        "fish_market_foundation_base",
        (0, 0, foundation_h * 0.5),
        (width + 0.32, depth + 0.32, foundation_h),
        stone,
        root,
        bevel=0.06,
    )
    if ctx["masonry_courses"]:
        _fish_market_aligned_plinth(ctx, root)
    add_box(
        "fish_market_foundation_water_table",
        (0, 0, foundation_h + 0.04),
        (width + 0.46, depth + 0.46, 0.10),
        stone,
        root,
        bevel=0.03,
    )


def _fish_market_warehouse(ctx: dict, root) -> None:
    """Weathered infill hall inside a heavy timber frame."""
    _add_framed_infill_volume(
        "fish_market_frame",
        ctx["width"],
        ctx["depth"],
        ctx["wall_base"],
        ctx["wall_height"],
        ctx["weathered"],
        ctx["dark"],
        ctx["dark"],
        root,
        detail=ctx["detail"],
        seed=ctx["seed"] + 13,
        front_bays=5,
        side_bays=4,
        panel_rows=2,
    )


def _fish_market_roof(ctx: dict, root) -> None:
    """Overlapping deep-red shingle gable."""
    _shingled_gable_roof(
        "fish_market",
        ctx["width"],
        ctx["depth"],
        ctx["wall_top"],
        ctx["pitch_deg"],
        ctx["roof"],
        ctx["dark"],
        root,
        overhang_front=0.72,
        overhang_side=0.55,
        courses=3 if ctx["detail"] else 2,
        course_thickness=0.18,
        gable_token=ctx["weathered"],
    )
    _architecture_shingle_rows(
        "fish_market_shingles",
        ctx["width"],
        ctx["depth"],
        ctx["wall_top"],
        ctx["pitch_deg"],
        (ctx["roof"],),
        root,
        rows=ctx["shingle_rows"],
        columns=ctx["shingle_columns"],
        seed=ctx["seed"] + 43,
        overhang_front=0.72,
        overhang_side=0.55,
    )


def _fish_market_stall(ctx: dict, root) -> None:
    """Raised striped stall, loading doors, apron stairs, and trade sign."""
    width = ctx["width"]
    wall_height = ctx["wall_height"]
    detail = ctx["detail"]
    seed = ctx["seed"]
    stone = ctx["stone"]
    weathered = ctx["weathered"]
    teal = ctx["teal"]
    canvas = ctx["canvas"]
    dark = ctx["dark"]
    glass = ctx["glass"]
    wall_base = ctx["wall_base"]
    front_y = ctx["front_y"]
    stall_w = ctx["stall_width"]
    stall_d = ctx["porch_depth"]
    stall_deck_z = ctx["stall_deck_z"]
    counter_z = stall_deck_z + 0.92

    add_box(
        "fish_market_stall_deck_base",
        (0, front_y - stall_d * 0.5, stall_deck_z - 0.08),
        (stall_w + 0.20, stall_d, 0.18),
        dark,
        root,
        bevel=0.025,
    )
    add_box(
        "fish_market_counter_body",
        (0, front_y - stall_d * 0.38, (stall_deck_z + counter_z) * 0.5),
        (stall_w, 0.65, counter_z - stall_deck_z),
        weathered,
        root,
        bevel=0.025,
    )
    add_plank_field(
        "fish_market_counter_planks",
        (0, front_y - stall_d * 0.38, counter_z + 0.06),
        stall_w + 0.15,
        0.78,
        0.10,
        (teal,),
        root,
        count=ctx["porch_planks"],
        axis="x",
        seed=seed + 47,
        bevel=0.012,
    )

    post_y = front_y - stall_d + 0.14
    for p_idx, px in enumerate((-stall_w * 0.46, stall_w * 0.46)):
        add_box(
            f"fish_market_awning_post_{p_idx}",
            (px, post_y, stall_deck_z + 1.15),
            (0.22, 0.22, 2.30),
            dark,
            root,
            bevel=0.02,
        )
        add_box(
            f"fish_market_awning_post_cap_{p_idx}",
            (px, post_y, stall_deck_z + 2.32),
            (0.26, 0.26, 0.10),
            dark,
            root,
            bevel=0.012,
        )

    add_box(
        "fish_market_awning_header",
        (0, post_y, stall_deck_z + 2.26),
        (stall_w + 0.16, 0.18, 0.18),
        dark,
        root,
        bevel=0.016,
    )

    awning_pitch = math.radians(14)
    awning_cz = stall_deck_z + 2.42
    panel_count = 9 if detail else 5
    panel_w = (stall_w + 0.40) / panel_count
    for panel in range(panel_count):
        px = -(stall_w + 0.40) * 0.5 + panel_w * (panel + 0.5)
        token = teal if panel % 3 == 1 else canvas
        add_box(
            f"fish_market_awning_panel_{panel:02d}",
            (px, front_y - stall_d * 0.52, awning_cz - (0.018 if panel % 2 else 0.0)),
            (panel_w * 0.94, stall_d + 0.28, 0.085),
            token,
            root,
            rotation=(awning_pitch + (0.010 if panel % 2 else -0.006), 0, 0.006 if panel % 3 == 2 else -0.004),
            bevel=0.012,
        )
        if detail:
            add_box(
                f"fish_market_awning_flap_{panel:02d}",
                (px, front_y - stall_d - 0.16, awning_cz - 0.16 - (0.012 if panel % 2 else 0.0)),
                (panel_w * 0.84, 0.055, 0.30),
                token,
                root,
                rotation=(math.radians(-24), 0, 0.008 if panel % 2 else -0.006),
                bevel=0.008,
            )
    for rafter in range(5 if detail else 3):
        rx = -stall_w * 0.48 + stall_w * 0.96 * rafter / (4 if detail else 2)
        add_box(
            f"fish_market_awning_rafter_{rafter}",
            (rx, front_y - stall_d * 0.52, awning_cz - 0.075),
            (0.09, stall_d + 0.20, 0.09),
            dark,
            root,
            rotation=(awning_pitch, 0, 0),
            bevel=0.008,
        )

    for d_idx, dx in enumerate((-1.45, 1.45)):
        add_box(
            f"fish_market_loading_door_reveal_{d_idx}",
            (dx, front_y + 0.035, wall_base + 1.25),
            (2.02, 0.24, 2.56),
            dark,
            root,
            bevel=0.018,
        )
        door_board_w = 1.78 / 5
        for board in range(5):
            bx = dx - 0.89 + door_board_w * (board + 0.5)
            add_box(
                f"fish_market_loading_door_{d_idx}_board_{board}",
                (bx, front_y - 0.115, wall_base + 1.25),
                (door_board_w * 0.90, 0.065, 2.36),
                weathered if board % 3 else dark,
                root,
                rotation=(0, 0, 0.004 if board % 2 else -0.004),
                bevel=0.008,
            )
        for s_idx, strap_z in enumerate((0.45, 1.85)):
            add_box(
                f"fish_market_hinge_strap_{d_idx}_{s_idx}",
                (dx, front_y - 0.12, wall_base + strap_z),
                (1.75, 0.04, 0.09),
                stone,
                root,
                bevel=0.008,
            )
        _add_rect_brace(
            f"fish_market_loading_door_brace_{d_idx}",
            (dx - 0.76, front_y - 0.165, wall_base + 0.28),
            (dx + 0.76, front_y - 0.165, wall_base + 2.18),
            0.10,
            0.055,
            dark,
            root,
            plane="xz",
            bevel=0.006,
        )

    # Equal-riser treads from stall deck onto the shared ground plane (z=0).
    tread_h = 0.16
    tread_run = 0.22
    z_high = stall_deck_z - tread_h * 0.5
    z_low = tread_h * 0.5
    step_count = max(3, int(round(stall_deck_z / tread_h)))
    for step_idx in range(step_count):
        t = step_idx / (step_count - 1)
        add_box(
            f"fish_market_entry_step_{step_idx}",
            (0, front_y - stall_d - 0.16 - step_idx * tread_run, z_high * (1.0 - t) + z_low * t),
            (1.80 + step_idx * 0.12, 0.34, tread_h),
            weathered,
            root,
            bevel=0.010,
        )

    crate_y = front_y - stall_d * 0.62
    for c_idx, cx in enumerate((-1.85, 1.85)):
        add_box(
            f"fish_market_display_crate_{c_idx}",
            (cx, crate_y, stall_deck_z + 0.28),
            (0.85, 0.58, 0.42),
            weathered if c_idx % 2 == 0 else teal,
            root,
            bevel=0.018,
        )

    lamp_x = stall_w * 0.46
    lamp_y = post_y + 0.16
    lamp_z = stall_deck_z + 1.92
    add_box("fish_market_lantern_bracket", (lamp_x, lamp_y + 0.08, lamp_z + 0.22), (0.06, 0.20, 0.06), dark, root, bevel=0.008)
    add_box("fish_market_lantern_frame", (lamp_x, lamp_y, lamp_z), (0.28, 0.28, 0.38), dark, root, bevel=0.016)
    add_ico("fish_market_lantern_glow", (lamp_x, lamp_y, lamp_z), (0.11, 0.11, 0.16), glass, root, subdivisions=2)

    sign_x = width * 0.54
    sign_y = front_y - 0.25
    sign_z = wall_base + wall_height * 0.85
    add_box(
        "fish_market_sign_bracket",
        (sign_x, sign_y, sign_z),
        (1.45, 0.14, 0.14),
        dark,
        root,
        bevel=0.015,
    )
    add_beam(
        "fish_market_sign_chain",
        (sign_x + 0.35, sign_y, sign_z),
        (sign_x + 0.35, sign_y, sign_z - 0.65),
        0.035,
        dark,
        root,
        vertices=6,
    )
    add_ico(
        "fish_market_sign_fish_body",
        (sign_x + 0.35, sign_y, sign_z - 0.95),
        (0.68, 0.12, 0.32),
        teal,
        root,
        subdivisions=2,
    )
    add_tri_prism(
        "fish_market_sign_fish_tail",
        (sign_x + 0.72, sign_y, sign_z - 0.95),
        (0.48, 0.16, 0.55),
        teal,
        root,
        rotation=(0, math.pi / 2, 0),
    )


def _fish_market_openings(ctx: dict, root) -> None:
    """Side and rear glazed windows. Loading doors stay on the stall face."""
    if not ctx["detail"]:
        return
    width = ctx["width"]
    depth = ctx["depth"]
    wall_base = ctx["wall_base"]
    dark = ctx["dark"]
    win_z = wall_base + 1.65
    rear_y = depth * 0.5 - 0.02
    add_box("fish_market_rear_window_reveal", (0.0, rear_y - 0.05, win_z), (1.28, 0.22, 1.32), dark, root, bevel=0.014)
    _fish_market_glazed_window("fish_market_rear_window", (0.0, rear_y + 0.035, win_z), 0.98, 1.02, ctx, root)
    for side, name, wy in ((-1, "left", 0.55), (1, "right", -0.55)):
        side_x = side * (width * 0.5 - 0.02)
        add_box(
            f"fish_market_{name}_window_reveal",
            (side_x - side * 0.05, wy, win_z),
            (0.22, 1.28, 1.32),
            dark,
            root,
            bevel=0.014,
        )
        _fish_market_glazed_side_window(
            f"fish_market_{name}_window",
            side_x + side * 0.035,
            wy,
            win_z,
            0.98,
            1.02,
            ctx,
            root,
            side=side,
        )


def _build_fish_market(spec: dict, root) -> None:
    """Authored coastal fish market: farmhouse stack with dock-sheet stall language."""
    ctx = _fish_market_context(spec)
    _fish_market_foundation(ctx, root)
    _fish_market_warehouse(ctx, root)
    _fish_market_roof(ctx, root)
    _fish_market_stall(ctx, root)
    _fish_market_openings(ctx, root)


def log_bridge(spec: dict, root) -> None:
    _finish_architecture(spec, root, _build_log_bridge)


def _build_log_bridge(spec: dict, root) -> None:
    """Hand-built farm crossing with cambered logs, uneven boards, and lashed rails."""
    params = spec["parameters"]
    palette = spec["palette"]
    length = float(params["length"])
    width = float(params["width"])
    deck_planks = int(params["deckPlanks"])
    rail_posts = int(params["railPosts"])
    timber = palette[0]
    dark = palette[1] if len(palette) > 1 else "wood_dark_01"
    deck_z = 0.58
    rng = seeded_rng(spec["seed"] + 11)

    # Narrow, independently settled boards read as a repaired crossing instead
    # of six perfect slabs. A shallow camber keeps the silhouette hand-built.
    plank_span = length / deck_planks
    for index in range(deck_planks):
        x = -length * 0.5 + plank_span * (index + 0.5)
        normalized = abs(x) / max(length * 0.5, 0.001)
        camber = 0.075 * (1.0 - normalized ** 1.6)
        add_box(
            f"log_bridge_deck_{index:03d}",
            (x, rng.uniform(-0.025, 0.025), deck_z + camber + rng.uniform(-0.012, 0.012)),
            (
                plank_span * rng.uniform(0.84, 0.93),
                width * rng.uniform(0.93, 1.03),
                rng.uniform(0.12, 0.16),
            ),
            dark if index % 6 == 4 else timber,
            root,
            rotation=(rng.uniform(-0.012, 0.012), rng.uniform(-0.018, 0.018), rng.uniform(-0.020, 0.020)),
            bevel=0.018,
        )

    # Each stringer is assembled from gently rising roundwood sections. The
    # faceted logs and transverse end sills stay readable below the plank gaps.
    stringer_points_x = (-length * 0.5, -length * 0.18, length * 0.18, length * 0.5)
    stringer_points_z = (0.25, 0.33, 0.33, 0.25)
    for side, name in ((-1, "left"), (1, "right")):
        add_limb_tube(f"log_bridge_stringer_{name}",
            [(x, side * width * .34, z) for x, z in zip(stringer_points_x, stringer_points_z)],
            (.22, .22, .22, .22), dark, root, sides=7)
        for band_index, x in enumerate((-length * 0.34, length * 0.34)):
            add_ring(
                f"log_bridge_stringer_lashing_{name}_{band_index}",
                (x, side * width * 0.34, 0.29),
                0.235,
                0.014,
                dark,
                root,
                major_segments=8,
                minor_segments=3,
                rotation=(0.0, math.pi * 0.5, 0.0),
            )

    for end, x in (("left", -length * 0.5 + 0.10), ("right", length * 0.5 - 0.10)):
        add_beam(
            f"log_bridge_end_sill_{end}",
            (x, -width * 0.52, 0.37),
            (x, width * 0.52, 0.37),
            0.13,
            timber,
            root,
            vertices=7,
        )

    for side, name in ((-1, "left"), (1, "right")):
        posts = []
        for index in range(rail_posts):
            x = -length * 0.5 + length * index / max(1, rail_posts - 1)
            top_x = x + rng.uniform(-0.035, 0.035)
            edge_y = side * (width * 0.5 - 0.06)
            top_y = edge_y + side * rng.uniform(-0.025, 0.035)
            top_z = deck_z + 0.76 + rng.uniform(-0.025, 0.030)
            posts.append((top_x, top_y, top_z))
            add_beam(
                f"log_bridge_rail_post_{name}_{index:02d}",
                (x, edge_y, deck_z - 0.04),
                (top_x, top_y, top_z),
                0.09,
                dark,
                root,
                vertices=7,
            )
            for band_index, band_z in enumerate((top_z - 0.08, deck_z + 0.37)):
                add_ring(
                    f"log_bridge_lashing_{name}_{index:02d}_{band_index}",
                    (top_x if band_index == 0 else x, top_y if band_index == 0 else edge_y, band_z),
                    0.105,
                    0.016,
                    dark,
                    root,
                    major_segments=8,
                    minor_segments=3,
                )
        for index, (start, end) in enumerate(zip(posts, posts[1:])):
            add_beam(
                f"log_bridge_top_rail_{name}_{index:02d}",
                (start[0], start[1], start[2] - 0.055),
                (end[0], end[1], end[2] - 0.055),
                0.075,
                timber,
                root,
                vertices=7,
            )
            add_beam(
                f"log_bridge_mid_rail_{name}_{index:02d}",
                (start[0], start[1], deck_z + 0.37),
                (end[0], end[1], deck_z + 0.37 + rng.uniform(-0.012, 0.012)),
                0.050,
                dark,
                root,
                vertices=7,
            )
        for end_index, direction in ((0, 1), (rail_posts - 1, -1)):
            post = posts[end_index]
            add_beam(
                f"log_bridge_knee_brace_{name}_{end_index:02d}",
                (post[0], post[1], deck_z + 0.10),
                (post[0] + direction * length * 0.16, post[1], deck_z + 0.42),
                0.045,
                timber,
                root,
                vertices=6,
            )

    # Transverse sleepers lock the two stringers together immediately beneath
    # the plank field; paired pegs make the joinery readable from the path.
    sleeper_count = max(4, round(deck_planks * 0.55))
    for index in range(sleeper_count):
        x = -length * 0.42 + length * 0.84 * index / max(1, sleeper_count - 1)
        add_beam(
            f"log_bridge_sleeper_{index:02d}",
            (x, -width * 0.44, deck_z - 0.09),
            (x, width * 0.44, deck_z - 0.09),
            0.085,
            timber,
            root,
            vertices=6,
        )
        for side, name in ((-1, "left"), (1, "right")):
            add_cylinder(
                f"log_bridge_peg_{name}_{index:02d}",
                (x, side * width * 0.34, deck_z + 0.105),
                0.035,
                0.08,
                dark,
                root,
                vertices=5,
                bevel=0.0,
            )


def village_building(spec: dict, root) -> None:
    variant = spec["parameters"].get("variant")
    preserve = (
        (village_lantern_node_name(variant),)
        if variant in VILLAGE_LANTERN_VARIANTS
        else ()
    )
    _finish_architecture(spec, root, _build_village_building, preserve_names=preserve)


def _village_palette(palette: list[str]) -> tuple[str, str, str, str, str, str]:
    stone = palette[0]
    wall = palette[1] if len(palette) > 1 else "plaster_cream_01"
    timber = palette[2] if len(palette) > 2 else "wood_honey_01"
    if len(palette) >= 5 and palette[3].startswith(("wood_", "metal_")):
        return stone, wall, timber, palette[3], palette[4], palette[5] if len(palette) > 5 else timber
    if len(palette) >= 4:
        # Compact cottage/agricultural palettes store the roof in slot 3 and
        # may append a window token without changing that construction order.
        return stone, wall, timber, timber, palette[3], palette[4] if len(palette) > 4 else timber
    return stone, wall, timber, timber, timber, timber


# Village roles whose doorway carries a practical lantern: the dwellings, which
# are the places the village is actually kept lit from after dark. Barns, sheds
# and outhouses stay dark, which is both the honest read and one fewer preserved
# node (a preserved node cannot merge into the shared batch, so each one costs a
# draw call wherever it is visible).
#
# Market halls are deliberately excluded despite being lit-front buildings: their
# palettes carry no emissive token, so a lantern there would add a sixth/seventh
# material and break the asset's material budget for one small mesh.
VILLAGE_LANTERN_VARIANTS = frozenset({
    "cottage-a", "cottage-b", "cottage-c", "inn", "inn-b",
})


def village_lantern_node_name(variant: str) -> str:
    """The runtime scans for names ending in `_glow` to attach a practical light.

    Variant ids carry hyphens (`market-hall-b`) but the catalog's node-name schema
    only allows `[A-Za-z][A-Za-z0-9_]*`, so the separator is normalised here.
    """
    return f"{variant.replace('-', '_')}_lantern_glow"


_VILLAGE_PROFILES = {
    "cottage-a": {"roofForm": "front-gable", "openingLayout": "cottage-front", "wallStyle": "plaster", "feature": "compact-porch", "chimney": True},
    "cottage-b": {"roofForm": "side-gable", "openingLayout": "cottage-side", "wallStyle": "plaster", "feature": "lean-to", "chimney": True},
    "cottage-c": {"roofForm": "front-gable", "openingLayout": "cottage-garden", "wallStyle": "plaster", "feature": "offset-cross-gable", "chimney": True},
    "inn": {"roofForm": "front-gable", "openingLayout": "inn-veranda", "wallStyle": "plaster", "feature": "veranda", "chimney": True},
    "inn-b": {"roofForm": "front-gable", "openingLayout": "inn-veranda", "wallStyle": "plaster", "feature": "veranda-wing", "chimney": True},
    "market-hall": {"roofForm": "front-gable", "openingLayout": "market-arcade", "wallStyle": "plaster", "feature": "arcade", "chimney": False},
    "market-hall-b": {"roofForm": "front-gable", "openingLayout": "market-arcade", "wallStyle": "plaster", "feature": "arcade-storage", "chimney": False},
    "barn": {"roofForm": "tall-gable", "openingLayout": "barn-loft", "wallStyle": "plank", "feature": "loading-lean-to", "chimney": False},
    "barn-b": {"roofForm": "tall-gable", "openingLayout": "barn-loft", "wallStyle": "plank", "feature": "loading-lean-to", "chimney": False},
    "shed": {"roofForm": "lean-to", "openingLayout": "shed-tools", "wallStyle": "plank", "feature": "tool-overhang", "chimney": False},
    "shed-b": {"roofForm": "lean-to", "openingLayout": "shed-tools", "wallStyle": "plank", "feature": "tool-overhang", "chimney": False},
    "outhouse": {"roofForm": "offset-gable", "openingLayout": "outhouse-vent", "wallStyle": "plank", "feature": "privacy-wall", "chimney": False},
    "outhouse-b": {"roofForm": "offset-gable", "openingLayout": "outhouse-vent", "wallStyle": "plank", "feature": "privacy-wall", "chimney": False},
}


def _village_required_param(params: dict, key: str):
    value = params.get(key)
    if value is None:
        raise ValueError(f"village_building requires explicit geometry parameter: {key}")
    return value


def _village_wing_side(wing_offset: float) -> int:
    return -1 if wing_offset < 0 else 1


def _village_signed_wing_x(
    width: float,
    wing_width: float,
    wing_offset: float,
    declared_half_width: float,
    roof_overhang: float,
) -> float:
    """Place an attached wing on the signed side of wingOffset, clamped to the declared footprint."""
    side = _village_wing_side(wing_offset)
    wing_roof_overhang = min(roof_overhang * 0.65, 0.42)
    reach = min(
        width * 0.5,
        max(wing_width * 0.45, declared_half_width - wing_width * 0.5 - wing_roof_overhang - abs(wing_offset) * 0.20),
    )
    return side * reach


def _village_offset_framed_room(
    prefix: str,
    center_x: float,
    center_y: float,
    width: float,
    depth: float,
    foundation_h: float,
    wall_base: float,
    wall_height: float,
    stone: str,
    wall: str,
    dark: str,
    root,
    *,
    detail: bool,
) -> None:
    """Framed plaster room at an offset so a cross-gable sits on real wall mass."""
    bevel = 0.025 if detail else 0.012
    wall_cz = wall_base + wall_height * 0.5
    add_box(
        f"{prefix}_foundation",
        (center_x, center_y, foundation_h * 0.5),
        (width + 0.16, depth + 0.16, foundation_h),
        stone,
        root,
        bevel=bevel,
    )
    if detail:
        _village_aligned_plinth(
            f"{prefix}_foundation_masonry",
            width + 0.24,
            depth + 0.24,
            foundation_h,
            2,
            max(3, round(width * 1.5)),
            (stone,),
            root,
            center_x=center_x,
            center_y=center_y,
        )
    add_box(
        f"{prefix}_inner_shell",
        (center_x, center_y, wall_cz),
        (width - 0.18, depth - 0.18, wall_height - 0.10),
        wall,
        root,
        bevel=0.014 if detail else 0.008,
    )
    post_w = 0.20 if detail else 0.16
    for x_index, x in enumerate((center_x - width * 0.5 + post_w * 0.45, center_x + width * 0.5 - post_w * 0.45)):
        for y_index, y in enumerate((center_y - depth * 0.5 + post_w * 0.45, center_y + depth * 0.5 - post_w * 0.45)):
            add_box(
                f"{prefix}_corner_{x_index}_{y_index}",
                (x, y, wall_cz),
                (post_w, post_w, wall_height + 0.05),
                dark,
                root,
                bevel=0.012 if detail else 0.006,
            )


def _side_shingled_gable_roof(
    prefix: str,
    width: float,
    depth: float,
    wall_top: float,
    pitch_deg: float,
    roof_token: str,
    trim_token: str,
    root,
    *,
    overhang_front: float,
    overhang_side: float,
    courses: int,
    course_thickness: float,
    bevel: float,
    gable_token: str | None = None,
) -> float:
    """Side-gable companion with recessed deck, segmented ridge, and gable truss."""
    pitch = math.radians(pitch_deg)
    half_span = depth * 0.5 + overhang_side
    slope_length = half_span / math.cos(pitch)
    rise = math.sin(pitch) * slope_length
    ridge_z = wall_top + rise
    ridge_length = width + overhang_front * 2.0
    gable_material = trim_token if gable_token is None else gable_token
    deck_thickness = min(0.075, course_thickness * 0.42)
    for side, name in ((-1, "front"), (1, "back")):
        add_box(
            f"{prefix}_roof_deck_{name}",
            (0, side * half_span * 0.5, wall_top + rise * 0.5 - 0.045),
            (ridge_length, slope_length + 0.08, deck_thickness),
            roof_token,
            root,
            rotation=(-side * pitch, 0, 0),
            bevel=min(bevel, 0.008),
        )
    ridge_count = max(4, round(ridge_length / 0.62))
    ridge_unit = ridge_length / ridge_count
    for index in range(ridge_count):
        add_box(
            f"{prefix}_ridge_cap_{index:02d}",
            (-ridge_length * 0.5 + ridge_unit * (index + 0.5), 0, ridge_z + 0.10 + (0.012 if index % 2 else 0.0)),
            (ridge_unit * 1.04, 0.30, 0.20),
            roof_token,
            root,
            rotation=(0, 0, 0.006 if index % 3 == 1 else -0.005 if index % 3 == 2 else 0.0),
            bevel=min(bevel, 0.014),
        )
    gable_h = rise * 0.98
    for side, name in ((-1, "left"), (1, "right")):
        add_tri_prism(
            f"{prefix}_gable_wall_{name}",
            (side * (width * 0.5 + 0.02), 0, wall_top + gable_h * 0.5),
            (depth - 0.10, 0.18, gable_h),
            gable_material,
            root,
            rotation=(0, 0, math.pi * 0.5),
        )
        end_x = side * (width * 0.5 + 0.055)
        add_box(f"{prefix}_gable_tie_{name}", (end_x, 0, wall_top + 0.10), (0.14, depth + 0.04, 0.18), trim_token, root, bevel=min(bevel, 0.012))
        add_box(f"{prefix}_gable_king_{name}", (end_x, 0, wall_top + rise * 0.50), (0.14, 0.18, rise * 0.90), trim_token, root, bevel=min(bevel, 0.012))
        _add_rect_brace(
            f"{prefix}_gable_rafter_front_{name}",
            (end_x, -depth * 0.48, wall_top + 0.12),
            (end_x, 0, ridge_z - 0.08),
            0.16,
            0.14,
            trim_token,
            root,
            plane="yz",
            bevel=min(bevel, 0.010),
        )
        _add_rect_brace(
            f"{prefix}_gable_rafter_back_{name}",
            (end_x, depth * 0.48, wall_top + 0.12),
            (end_x, 0, ridge_z - 0.08),
            0.16,
            0.14,
            trim_token,
            root,
            plane="yz",
            bevel=min(bevel, 0.010),
        )
    for side, name in ((-1, "left"), (1, "right")):
        add_box(
            f"{prefix}_eave_fascia_{name}",
            (0, side * half_span, wall_top + 0.02),
            (ridge_length + 0.08, 0.10, 0.16),
            trim_token,
            root,
            bevel=min(bevel, 0.015) if bevel > 0 else 0.0,
        )
    for side, name in ((-1, "front"), (1, "back")):
        add_box(
            f"{prefix}_eave_{name}",
            (0, side * half_span, wall_top + 0.06),
            (ridge_length + 0.10, 0.15, 0.20),
            trim_token,
            root,
            rotation=(-side * pitch, 0, 0),
            bevel=min(bevel, 0.012),
        )
    return ridge_z


def _side_roof_course_shadow_lines(
    prefix: str,
    width: float,
    depth: float,
    wall_top: float,
    pitch_deg: float,
    token: str,
    root,
    *,
    rows: int,
    overhang_front: float,
    overhang_side: float,
) -> None:
    pitch = math.radians(pitch_deg)
    half_span = depth * 0.5 + overhang_side
    slope_length = half_span / math.cos(pitch)
    ridge_length = width + overhang_front * 2.0
    for side, name in ((-1, "front"), (1, "back")):
        for row in range(1, rows):
            distance = slope_length * row / rows
            y = side * (half_span - math.cos(pitch) * distance)
            z = wall_top + math.sin(pitch) * distance + 0.105
            add_box(
                f"{prefix}_{name}_{row:02d}",
                (0, y, z),
                (ridge_length + 0.04, 0.055, 0.035),
                token,
                root,
                rotation=(-side * pitch, 0, 0),
                bevel=0.006,
            )


def _side_shingle_rows(
    prefix,
    width,
    depth,
    wall_top,
    pitch_deg,
    token,
    root,
    *,
    rows,
    columns,
    seed,
    overhang_front=0.50,
    overhang_side=0.50,
):
    """Staggered overlapping units for a side-gable roof."""
    rng = seeded_rng(seed)
    pitch = math.radians(pitch_deg)
    half_span = depth * 0.5 + overhang_side
    slope = half_span / math.cos(pitch)
    row_step = slope / rows
    ridge_length = width + overhang_front * 2.0
    tile_length = ridge_length / columns
    for side in (-1, 1):
        for row in range(rows):
            distance = row_step * (row + 0.50)
            y = side * (half_span - math.cos(pitch) * distance)
            z = wall_top + math.sin(pitch) * distance + 0.105
            stagger = -tile_length * 0.5 if row % 2 else 0.0
            for column in range(columns + (1 if row % 2 else 0)):
                x = -ridge_length * 0.5 + tile_length * (column + 0.5) + stagger
                add_box(
                    f"{prefix}_{'left' if side < 0 else 'right'}_{row:02d}_{column:02d}",
                    (x, y + side * rng.uniform(-0.012, 0.012), z + rng.uniform(-0.012, 0.018)),
                    (tile_length * rng.uniform(0.88, 0.96), row_step * 1.56, 0.095),
                    token,
                    root,
                    rotation=(-side * pitch, 0, rng.uniform(-0.016, 0.016)),
                    bevel=0.009,
                )


def _lean_to_roof(
    prefix,
    width,
    depth,
    wall_top,
    pitch_deg,
    roof_token,
    trim_token,
    root,
    *,
    overhang,
    bevel,
    courses,
    detail=True,
    seed=0,
):
    pitch = math.radians(max(8.0, min(32.0, pitch_deg * 0.62)))
    half_span = width * 0.5 + overhang
    slope_length = half_span * 2.0 / math.cos(pitch)
    roof_d = depth + overhang * 2.0
    center_z = wall_top + math.sin(pitch) * slope_length * 0.5 + 0.10
    add_box(
        f"{prefix}_lean_to_deck",
        (0, 0, center_z - 0.045),
        (slope_length, roof_d, 0.065),
        roof_token,
        root,
        rotation=(0, pitch, 0),
        bevel=min(bevel, 0.008),
    )
    rows = max(4, courses * 2) if detail else 0
    columns = max(4, round(roof_d / 0.52))
    rng = seeded_rng(seed)
    row_step = slope_length / max(1, rows)
    tile_d = roof_d / columns
    for row in range(rows):
        local_x = -slope_length * 0.5 + row_step * (row + 0.5)
        x = math.cos(pitch) * local_x
        z = center_z - math.sin(pitch) * local_x + 0.09
        stagger = -tile_d * 0.5 if row % 2 else 0.0
        for column in range(columns + (1 if row % 2 else 0)):
            y = -roof_d * 0.5 + tile_d * (column + 0.5) + stagger
            add_box(
                f"{prefix}_lean_to_tile_{row:02d}_{column:02d}",
                (x + rng.uniform(-0.01, 0.01), y, z + rng.uniform(-0.01, 0.014)),
                (row_step * 1.56, tile_d * rng.uniform(0.88, 0.96), 0.09),
                roof_token,
                root,
                rotation=(0, pitch, rng.uniform(-0.014, 0.014)),
                bevel=min(bevel, 0.009),
            )
    add_box(
        f"{prefix}_lean_to_fascia_low",
        (half_span, 0, wall_top + 0.09),
        (0.12, roof_d + 0.10, 0.18),
        trim_token,
        root,
        rotation=(0, pitch, 0),
        bevel=min(bevel, 0.015),
    )
    add_box(
        f"{prefix}_lean_to_fascia_high",
        (-half_span, 0, wall_top + math.tan(pitch) * half_span * 2.0 + 0.09),
        (0.12, roof_d + 0.10, 0.18),
        trim_token,
        root,
        rotation=(0, pitch, 0),
        bevel=min(bevel, 0.015),
    )
    return center_z + math.sin(pitch) * slope_length * 0.5 + 0.10


def _add_side_window(prefix, x, y, z, width, height, frame, glass, mullion, root, *, side, shutters=False):
    for edge in (-1, 1):
        add_box(f"{prefix}_jamb_{edge}", (x, y + edge * (width / 2 + .035), z),
                (.14, .07, height + .14), frame, root, bevel=.012)
        add_box(f"{prefix}_rail_{edge}", (x, y, z + edge * (height / 2 + .035)),
                (.14, width, .07), frame, root, bevel=.012)
    add_box(f"{prefix}_glass", (x + side * 0.02, y, z), (0.04, width, height), glass, root, bevel=0.01)
    add_box(f"{prefix}_mullion_v", (x + side * 0.05, y, z), (0.05, 0.06, height), mullion, root, bevel=0.008)
    add_box(f"{prefix}_mullion_h", (x + side * 0.05, y, z), (0.05, width, 0.06), mullion, root, bevel=0.008)
    if shutters:
        shutter_w = width * 0.40
        for index, sy in enumerate((-1, 1)):
            add_box(
                f"{prefix}_shutter_{index}",
                (x + side * 0.02, y + sy * (width * 0.5 + shutter_w * 0.45), z),
                (0.06, shutter_w, height * 0.96),
                mullion,
                root,
                bevel=0.008,
            )


def _add_attached_working_wing(
    prefix: str,
    center_x: float,
    center_y: float,
    width: float,
    depth: float,
    foundation_h: float,
    wall_base: float,
    wall_height: float,
    pitch_deg: float,
    roof_overhang: float,
    stone: str,
    wall: str,
    timber: str,
    dark: str,
    roof: str,
    opening_token: str,
    root,
    *,
    detail: bool,
    seed: int,
    opening: str,
) -> None:
    """Build an attached, framed service/lodging wing within the declared footprint."""
    bevel = 0.025 if detail else 0.012
    wall_top = wall_base + wall_height
    add_box(
        f"{prefix}_foundation",
        (center_x, center_y, foundation_h * 0.5),
        (width + 0.20, depth + 0.20, foundation_h),
        stone,
        root,
        bevel=bevel,
    )
    if detail:
        _village_aligned_plinth(
            f"{prefix}_foundation_masonry",
            width + 0.28,
            depth + 0.28,
            foundation_h,
            2,
            max(3, round(width * 1.5)),
            (stone,),
            root,
            center_x=center_x,
            center_y=center_y,
        )
    add_box(
        f"{prefix}_inner_shell",
        (center_x, center_y, wall_base + wall_height * 0.5),
        (width - 0.20, depth - 0.20, wall_height - 0.10),
        dark,
        root,
        bevel=0.014 if detail else 0.008,
    )

    post_w = 0.20 if detail else 0.16
    for x_index, x in enumerate((center_x - width * 0.5 + post_w * 0.45, center_x + width * 0.5 - post_w * 0.45)):
        for y_index, y in enumerate((center_y - depth * 0.5 + post_w * 0.45, center_y + depth * 0.5 - post_w * 0.45)):
            add_box(
                f"{prefix}_corner_{x_index}_{y_index}",
                (x, y, wall_base + wall_height * 0.5),
                (post_w, post_w, wall_height + 0.05),
                dark,
                root,
                bevel=0.014 if detail else 0.006,
            )
    for y_sign, name in ((-1, "front"), (1, "back")):
        y = center_y + y_sign * (depth * 0.5 - 0.06)
        add_box(f"{prefix}_plate_{name}", (center_x, y, wall_top - 0.07), (width + 0.10, 0.14, 0.15), dark, root, bevel=0.012 if detail else 0.006)
        add_box(f"{prefix}_sill_{name}", (center_x, y, wall_base + wall_height * 0.42), (width - 0.12, 0.09, 0.11), timber, root, bevel=0.01 if detail else 0.004)
    if detail:
        wing_rng = seeded_rng(seed + 3)
        panel_rows = 2
        front_bays = 3
        bay_w = (width - post_w * 1.4) / front_bays
        row_h = (wall_height - 0.34) / panel_rows
        for y_sign, name in ((-1, "front"), (1, "back")):
            y = center_y + y_sign * (depth * 0.5 - 0.075)
            for bay in range(front_bays):
                x = center_x - width * 0.5 + post_w * 0.7 + bay_w * (bay + 0.5)
                for row in range(panel_rows):
                    z = wall_base + 0.17 + row_h * (row + 0.5)
                    add_box(f"{prefix}_infill_{name}_{bay}_{row}", (x, y, z + wing_rng.uniform(-0.010, 0.010)), (bay_w - 0.12, 0.085, row_h - 0.12), wall, root, rotation=(0, 0, wing_rng.uniform(-0.007, 0.007)), bevel=0.022)
            for bay in range(1, front_bays):
                x = center_x - width * 0.5 + post_w * 0.7 + bay_w * bay
                add_box(f"{prefix}_stud_{name}_{bay}", (x, y - y_sign * 0.035, wall_base + wall_height * 0.5), (0.14, 0.13, wall_height - 0.10), dark, root, bevel=0.010)
        side_bays = 2
        bay_d = (depth - post_w * 1.4) / side_bays
        for x_sign, name in ((-1, "left"), (1, "right")):
            x = center_x + x_sign * (width * 0.5 - 0.075)
            for bay in range(side_bays):
                y = center_y - depth * 0.5 + post_w * 0.7 + bay_d * (bay + 0.5)
                for row in range(panel_rows):
                    z = wall_base + 0.17 + row_h * (row + 0.5)
                    add_box(f"{prefix}_infill_{name}_{bay}_{row}", (x, y, z + wing_rng.uniform(-0.010, 0.010)), (0.085, bay_d - 0.12, row_h - 0.12), wall, root, rotation=(0, 0, wing_rng.uniform(-0.007, 0.007)), bevel=0.022)
    else:
        add_box(f"{prefix}_wall_lod", (center_x, center_y, wall_base + wall_height * 0.5), (width, depth, wall_height), wall, root, bevel=0.012)

    wing_overhang = min(roof_overhang * 0.65, 0.42)
    _shingled_gable_roof(
        prefix,
        width,
        depth,
        wall_top,
        max(32.0, pitch_deg),
        roof,
        dark,
        root,
        overhang_front=wing_overhang,
        overhang_side=wing_overhang,
        courses=3 if detail else 2,
        course_thickness=0.13,
        bevel=0.018 if detail else 0.008,
        gable_token=wall,
        center_x=center_x,
        center_y=center_y,
    )
    if detail:
        _architecture_shingle_rows(
            f"{prefix}_shingles",
            width,
            depth,
            wall_top,
            max(32.0, pitch_deg),
            (roof,),
            root,
            rows=4,
            columns=max(4, round(depth * 1.5)),
            seed=seed + 7,
            center_x=center_x,
            center_y=center_y,
            overhang_front=wing_overhang,
            overhang_side=wing_overhang,
        )

    front_y = center_y - depth * 0.5 - 0.04
    if opening == "window":
        add_mullioned_window(
            f"{prefix}_front_window",
            (center_x, front_y, wall_base + wall_height * 0.58),
            min(0.72, width * 0.38),
            min(0.82, wall_height * 0.34),
            dark,
            opening_token,
            timber,
            root,
            shutter_token=timber if detail else None,
        )
    else:
        door_w = min(width * 0.56, 0.92)
        door_h = min(wall_height * 0.72, 1.82)
        add_box(f"{prefix}_door_frame", (center_x, front_y, wall_base + door_h * 0.5), (door_w + 0.16, 0.14, door_h + 0.14), dark, root, bevel=0.012 if detail else 0.004)
        add_box(f"{prefix}_door_panel", (center_x, front_y - 0.035, wall_base + door_h * 0.5), (door_w, 0.07, door_h), timber, root, bevel=0.01 if detail else 0.0)
        if detail:
            add_beam(f"{prefix}_door_brace_a", (center_x - door_w * 0.38, front_y - 0.07, wall_base + 0.18), (center_x + door_w * 0.38, front_y - 0.07, wall_base + door_h - 0.18), 0.025, dark, root, vertices=5)
            add_beam(f"{prefix}_door_brace_b", (center_x + door_w * 0.38, front_y - 0.07, wall_base + 0.18), (center_x - door_w * 0.38, front_y - 0.07, wall_base + door_h - 0.18), 0.025, dark, root, vertices=5)


def _village_aligned_plinth(
    prefix: str,
    width: float,
    depth: float,
    height: float,
    courses: int,
    long_blocks: int,
    tokens: tuple[str, ...],
    root,
    *,
    center_x: float = 0.0,
    center_y: float = 0.0,
) -> None:
    """Flush stacked-bond masonry so village plinths sit on the shared ground plane."""
    course_h = height / max(1, courses)
    block_depth = 0.22
    short_blocks = max(3, round(long_blocks * depth / max(width, 0.001)))
    for course in range(courses):
        z = course_h * (course + 0.5)
        for face, axis, span, count, fixed in (
            ("front", "x", width, long_blocks, center_y - depth * 0.5 - block_depth * 0.35),
            ("back", "x", width, long_blocks, center_y + depth * 0.5 + block_depth * 0.35),
            ("left", "y", depth, short_blocks, center_x - width * 0.5 - block_depth * 0.35),
            ("right", "y", depth, short_blocks, center_x + width * 0.5 + block_depth * 0.35),
        ):
            block_span = span / count
            for index in range(count):
                along = -span * 0.5 + block_span * (index + 0.5)
                token = tokens[(course + index) % len(tokens)]
                if axis == "x":
                    location = (center_x + along, fixed, z)
                    dimensions = (block_span * 0.98, block_depth, course_h * 0.96)
                else:
                    location = (fixed, center_y + along, z)
                    dimensions = (block_depth, block_span * 0.98, course_h * 0.96)
                add_box(
                    f"{prefix}_{face}_{course:02d}_{index:02d}",
                    location,
                    dimensions,
                    token,
                    root,
                    bevel=0.012,
                )


def _village_glazed_window(
    name: str,
    location: tuple[float, float, float],
    width: float,
    height: float,
    frame: str,
    glass: str,
    mullion: str,
    root,
    *,
    shutter_token: str | None = None,
) -> None:
    """Hollow frame + proud emissive pane so village openings read as glass, not wood slabs."""
    cx, cy, cz = location
    add_box(f"{name}_glass", (cx, cy - 0.05, cz), (width * 0.90, 0.035, height * 0.90), glass, root, bevel=0.006)
    add_box(f"{name}_mullion_v", (cx, cy - 0.07, cz), (0.04, 0.04, height * 0.88), mullion, root, bevel=0.005)
    add_box(f"{name}_mullion_h", (cx, cy - 0.07, cz), (width * 0.88, 0.04, 0.04), mullion, root, bevel=0.005)
    add_box(f"{name}_frame_l", (cx - width * 0.5, cy - 0.02, cz), (0.10, 0.12, height + 0.16), frame, root, bevel=0.012)
    add_box(f"{name}_frame_r", (cx + width * 0.5, cy - 0.02, cz), (0.10, 0.12, height + 0.16), frame, root, bevel=0.012)
    add_box(f"{name}_frame_t", (cx, cy - 0.02, cz + height * 0.5), (width + 0.16, 0.12, 0.10), frame, root, bevel=0.012)
    add_box(f"{name}_frame_b", (cx, cy - 0.02, cz - height * 0.5), (width + 0.16, 0.12, 0.10), frame, root, bevel=0.012)
    if shutter_token:
        shutter_w = width * 0.48
        add_box(f"{name}_shutter_l", (cx - width * 0.5 - shutter_w * 0.45, cy - 0.01, cz), (shutter_w, 0.06, height), shutter_token, root, bevel=0.012)
        add_box(f"{name}_shutter_r", (cx + width * 0.5 + shutter_w * 0.45, cy - 0.01, cz), (shutter_w, 0.06, height), shutter_token, root, bevel=0.012)


def _village_glazed_side_window(
    name: str,
    x: float,
    y: float,
    z: float,
    width: float,
    height: float,
    frame: str,
    glass: str,
    mullion: str,
    root,
    *,
    side: int,
    shutters: bool = False,
) -> None:
    add_box(f"{name}_glass", (x + side * 0.05, y, z), (0.035, width * 0.90, height * 0.90), glass, root, bevel=0.006)
    add_box(f"{name}_mullion_v", (x + side * 0.07, y, z), (0.04, 0.04, height * 0.88), mullion, root, bevel=0.005)
    add_box(f"{name}_mullion_h", (x + side * 0.07, y, z), (0.04, width * 0.88, 0.04), mullion, root, bevel=0.005)
    add_box(f"{name}_frame_l", (x + side * 0.02, y - width * 0.5, z), (0.12, 0.10, height + 0.16), frame, root, bevel=0.012)
    add_box(f"{name}_frame_r", (x + side * 0.02, y + width * 0.5, z), (0.12, 0.10, height + 0.16), frame, root, bevel=0.012)
    add_box(f"{name}_frame_t", (x + side * 0.02, y, z + height * 0.5), (0.12, width + 0.16, 0.10), frame, root, bevel=0.012)
    add_box(f"{name}_frame_b", (x + side * 0.02, y, z - height * 0.5), (0.12, width + 0.16, 0.10), frame, root, bevel=0.012)
    if shutters:
        shutter_w = width * 0.40
        for index, sy in enumerate((-1, 1)):
            add_box(
                f"{name}_shutter_{index}",
                (x + side * 0.02, y + sy * (width * 0.5 + shutter_w * 0.45), z),
                (0.06, shutter_w, height * 0.96),
                mullion,
                root,
                bevel=0.008,
            )


def _village_ground_stairs(
    prefix: str,
    x: float,
    start_y: float,
    deck_z: float,
    stair_w: float,
    token: str,
    root,
    *,
    detail: bool,
) -> None:
    """Equal-riser treads from a raised deck or door sill onto the shared ground plane (z=0)."""
    tread_h = 0.16
    tread_run = 0.22
    z_high = deck_z - tread_h * 0.5
    z_low = tread_h * 0.5
    step_count = max(3, int(round(max(deck_z, tread_h) / tread_h)))
    for step_idx in range(step_count):
        t = step_idx / (step_count - 1)
        add_box(
            f"{prefix}_{step_idx}",
            (x, start_y - step_idx * tread_run, z_high * (1.0 - t) + z_low * t),
            (stair_w + step_idx * 0.12, 0.34, tread_h),
            token,
            root,
            bevel=0.010 if detail else 0.004,
        )


def _build_village_building(spec: dict, root) -> None:
    """Role-profiled village architecture derived from the farmhouse construction grammar."""
    params = spec["parameters"]
    variant = _village_required_param(params, "variant")
    if variant not in _VILLAGE_PROFILES:
        raise ValueError(f"Unknown village architecture variant: {variant}")
    profile = _VILLAGE_PROFILES[variant]
    stone, wall, timber, dark, roof, accent = _village_palette(spec["palette"])
    detail = _is_hero_detail(spec) and (
        spec.get("lod") != "small" or variant in ("shed", "shed-b", "outhouse", "outhouse-b")
    )
    seed = spec["seed"]

    width = float(_village_required_param(params, "width"))
    depth = float(_village_required_param(params, "depth"))
    wall_height = float(_village_required_param(params, "wallHeight"))
    pitch_deg = float(_village_required_param(params, "roofPitchDeg"))
    foundation_h = float(_village_required_param(params, "foundationHeight"))
    roof_overhang = float(_village_required_param(params, "roofOverhang"))
    roof_courses = int(_village_required_param(params, "roofCourses"))
    shingle_rows = int(_village_required_param(params, "shingleRows"))
    shingle_columns = int(_village_required_param(params, "shingleColumns"))
    masonry_courses = int(_village_required_param(params, "masonryCourses"))
    masonry_blocks = int(_village_required_param(params, "masonryBlocks"))
    porch_depth = float(_village_required_param(params, "porchDepth"))
    porch_planks = int(_village_required_param(params, "porchPlanks"))
    wing_offset = float(_village_required_param(params, "wingOffset"))
    wing_width = float(_village_required_param(params, "wingWidth"))
    wing_depth = float(_village_required_param(params, "wingDepth"))
    chimney_x = float(_village_required_param(params, "chimneyOffsetX"))
    chimney_h = float(_village_required_param(params, "chimneyHeight"))
    plinth_scale = float(_village_required_param(params, "plinthScale"))
    porch_width_ratio = float(_village_required_param(params, "porchWidthRatio"))
    door_w = float(_village_required_param(params, "doorWidth"))
    door_h = float(_village_required_param(params, "doorHeight"))
    if params.get("roofForm") != profile["roofForm"] or params.get("openingLayout") != profile["openingLayout"]:
        raise ValueError(f"{variant}: catalog roofForm/openingLayout do not match the registered role profile")

    is_plank = profile["wallStyle"] == "plank"
    bevel = 0.05 if detail else 0.02
    front_y = -depth * 0.5
    wall_base = foundation_h + 0.08
    wall_cz = wall_base + wall_height * 0.5
    wall_top = wall_base + wall_height
    foundation_width = width + 0.28 * plinth_scale
    foundation_depth = depth + 0.28 * plinth_scale
    window_glow = "emissive_window_01" if "emissive_window_01" in spec["palette"] else timber
    glass = accent if profile["feature"].startswith("arcade") else window_glow
    declared_half_width = float(spec["dimensions"]["width"]) * 0.5

    # Shared farmhouse-derived plinth grammar: stacked-bond courses on z=0.
    add_box(f"{variant}_foundation", (0, 0, foundation_h * 0.5), (foundation_width, foundation_depth, foundation_h), stone, root, bevel=bevel)
    if detail and masonry_courses > 0:
        _village_aligned_plinth(
            f"{variant}_foundation_masonry",
            width + 0.52 * plinth_scale,
            depth + 0.52 * plinth_scale,
            foundation_h,
            masonry_courses,
            masonry_blocks,
            (stone,),
            root,
        )
    add_box(f"{variant}_water_table", (0, 0, foundation_h + 0.045), (width + 0.40 * plinth_scale, depth + 0.40 * plinth_scale, 0.09), stone, root, bevel=0.025 if detail else 0.012)

    # Material follows construction. Dwellings expose a real post-and-infill
    # hierarchy; agricultural buildings use separate, uneven vertical boards;
    # market halls remain genuinely open on their working front.
    if is_plank:
        add_box(
            f"{variant}_inner_shell",
            (0, 0, wall_cz),
            (width - 0.24, depth - 0.24, wall_height - 0.12),
            dark,
            root,
            bevel=0.014 if detail else 0.008,
        )
        add_timber_corner_frame(f"{variant}_timber", width, depth, wall_base, wall_height, dark, root, post_w=0.28 if detail else 0.21)
        if detail:
            front_count = max(6, round(width / 0.48))
            side_count = max(5, round(depth / 0.48))
            for y_sign, name in ((-1, "front"), (1, "back")):
                face_y = y_sign * (depth * 0.5 - 0.035)
                add_plank_field(
                    f"{variant}_planks_{name}",
                    (0, face_y, wall_cz),
                    width - 0.24,
                    0.085,
                    wall_height - 0.18,
                    (wall, timber),
                    root,
                    count=front_count,
                    axis="x",
                    seed=seed + 31 + (0 if y_sign < 0 else 6),
                    bevel=0.009,
                )
                for rail_index, z in enumerate((wall_base + wall_height * 0.34, wall_base + wall_height * 0.70)):
                    add_box(f"{variant}_rail_{name}_{rail_index}", (0, face_y - y_sign * 0.055, z), (width - 0.30, 0.13, 0.15), dark, root, bevel=0.010)
                _add_rect_brace(
                    f"{variant}_brace_{name}",
                    (-width * 0.43, face_y - y_sign * 0.075, wall_base + 0.24),
                    (-width * 0.10, face_y - y_sign * 0.075, wall_top - 0.25),
                    0.14,
                    0.12,
                    dark,
                    root,
                    plane="xz",
                    bevel=0.009,
                )
            for side, name in ((-1, "left"), (1, "right")):
                face_x = side * (width * 0.5 - 0.035)
                add_plank_field(
                    f"{variant}_planks_{name}",
                    (face_x, 0, wall_cz),
                    0.085,
                    depth - 0.24,
                    wall_height - 0.18,
                    (wall, timber),
                    root,
                    count=side_count,
                    axis="y",
                    seed=seed + 43 + (0 if side < 0 else 6),
                    bevel=0.009,
                )
                for rail_index, z in enumerate((wall_base + wall_height * 0.34, wall_base + wall_height * 0.70)):
                    add_box(f"{variant}_rail_{name}_{rail_index}", (face_x - side * 0.055, 0, z), (0.13, depth - 0.30, 0.15), dark, root, bevel=0.010)
        else:
            add_box(f"{variant}_wall_lod", (0, 0, wall_cz), (width, depth, wall_height), wall, root, bevel=0.012)
    else:
        front_bays = 6 if profile["feature"].startswith(("veranda", "arcade")) else 4
        panel_rows = 3 if profile["feature"].startswith("veranda") else 2
        _add_framed_infill_volume(
            f"{variant}_frame",
            width,
            depth,
            wall_base,
            wall_height,
            wall,
            timber,
            dark,
            root,
            detail=detail,
            seed=seed + 29,
            front_bays=front_bays,
            side_bays=max(3, round(depth / 1.35)),
            panel_rows=panel_rows,
            open_front=profile["feature"].startswith("arcade"),
            daub_texture=detail,
        )

    # The roof form is explicit per catalog entry: cottages can turn their ridge, sheds can lean, and halls remain open-front gables.
    roof_detail_courses = roof_courses if detail else max(2, roof_courses // 2)
    if profile["roofForm"] == "side-gable":
        roof_top = _side_shingled_gable_roof(variant, width, depth, wall_top, pitch_deg, roof, dark, root, overhang_front=roof_overhang, overhang_side=roof_overhang, courses=roof_detail_courses, course_thickness=0.16 if detail else 0.18, bevel=0.025 if detail else 0.012, gable_token=wall)
        if detail:
            _side_shingle_rows(f"{variant}_shingles", width, depth, wall_top, pitch_deg, roof, root, rows=shingle_rows, columns=shingle_columns, seed=seed + 19, overhang_front=roof_overhang, overhang_side=roof_overhang)
    elif profile["roofForm"] == "lean-to":
        roof_top = _lean_to_roof(variant, width, depth, wall_top, pitch_deg, roof, dark, root, overhang=roof_overhang, bevel=0.025 if detail else 0.012, courses=roof_detail_courses, detail=detail, seed=seed + 19)
    else:
        if profile["roofForm"] == "offset-gable":
            offset_side = _village_wing_side(wing_offset)
            roof_center_x = offset_side * max(abs(wing_offset) * 1.35, width * 0.18)
        else:
            roof_center_x = 0.0
        roof_top = _shingled_gable_roof(variant, width, depth, wall_top, pitch_deg, roof, dark, root, overhang_front=roof_overhang, overhang_side=roof_overhang, courses=roof_detail_courses, course_thickness=0.16 if detail else 0.18, include_fascia=True, bevel=0.025 if detail else 0.012, gable_token=wall, center_x=roof_center_x)
        if detail:
            _architecture_shingle_rows(f"{variant}_shingles", width, depth, wall_top, pitch_deg, (roof,), root, rows=shingle_rows, columns=shingle_columns, seed=seed + 19, center_x=roof_center_x, overhang_front=roof_overhang, overhang_side=roof_overhang)

    # A small offset cross-gable gives the garden cottage a second silhouette beat without making a second generic house.
    if profile["feature"] == "offset-cross-gable" and wing_width > 0 and wing_depth > 0:
        cross_y = front_y + wing_depth * 0.20
        cross_overhang = roof_overhang * 0.55
        _village_offset_framed_room(
            f"{variant}_cross_gable_room",
            wing_offset,
            cross_y,
            wing_width,
            wing_depth,
            foundation_h,
            wall_base,
            wall_height,
            stone,
            wall,
            dark,
            root,
            detail=detail,
        )
        _shingled_gable_roof(
            f"{variant}_cross_gable",
            wing_width,
            wing_depth,
            wall_top + 0.05,
            max(38.0, pitch_deg),
            roof,
            dark,
            root,
            overhang_front=cross_overhang,
            overhang_side=cross_overhang,
            courses=3 if detail else 2,
            course_thickness=0.14,
            bevel=0.02 if detail else 0.01,
            gable_token=wall,
            center_x=wing_offset,
            center_y=cross_y,
        )
        if detail:
            _architecture_shingle_rows(
                f"{variant}_cross_shingles",
                wing_width,
                wing_depth,
                wall_top + 0.05,
                max(38.0, pitch_deg),
                (roof,),
                root,
                rows=4,
                columns=4,
                seed=seed + 67,
                center_x=wing_offset,
                center_y=cross_y,
                overhang_front=cross_overhang,
                overhang_side=cross_overhang,
            )
        _village_glazed_window(
            f"{variant}_cross_gable_window",
            (wing_offset, cross_y - wing_depth * 0.5 - 0.12, wall_top + 0.62),
            0.54,
            0.54,
            dark,
            glass,
            timber,
            root,
        )

    # Front door and opening hierarchy. Market halls stay open-front and do not
    # hide a generic cottage door behind their service counter. Barns use split
    # loading leaves instead of a single cottage door.
    door_x = wing_offset if profile["openingLayout"] == "cottage-side" else 0.0
    door_y = front_y - 0.06
    is_barn = profile["feature"] == "loading-lean-to"

    # Doorway lantern. Named `*_lantern_glow` so the runtime attaches a practical
    # point light to it, and preserved out of the material join by
    # `village_building` so that name survives into the published GLB.
    if variant in VILLAGE_LANTERN_VARIANTS:
        lantern_side = -1.0 if door_x > 0 else 1.0
        lantern_x = door_x + lantern_side * (door_w * 0.5 + 0.34)
        # Keep the bracket on the wall even where the door sits near a corner.
        lantern_reach = max(0.0, width * 0.5 - 0.24)
        lantern_x = max(-lantern_reach, min(lantern_reach, lantern_x))
        lantern_z = wall_base + door_h + 0.24
        # Reuses the palette's existing window emissive rather than introducing a
        # lantern token: a sixth material would break these assets' budgets.
        lantern_glow = window_glow
        add_box(
            f"{variant}_lantern_bracket",
            (lantern_x, front_y + 0.05, lantern_z + 0.20),
            (0.05, 0.20, 0.05),
            dark,
            root,
            bevel=0.008 if detail else 0.0,
        )
        add_box(
            f"{variant}_lantern_frame",
            (lantern_x, front_y - 0.06, lantern_z),
            (0.24, 0.24, 0.32),
            dark,
            root,
            bevel=0.014 if detail else 0.0,
        )
        add_ico(
            village_lantern_node_name(variant),
            (lantern_x, front_y - 0.06, lantern_z),
            (0.10, 0.10, 0.14),
            lantern_glow,
            root,
            subdivisions=2,
        )
    if not profile["feature"].startswith("arcade"):
        add_box(f"{variant}_door_reveal", (door_x, door_y + 0.06, wall_base + door_h * 0.5), (door_w + 0.28, 0.24, door_h + 0.24), dark, root, bevel=0.014 if detail else 0.0)
        add_box(f"{variant}_door_frame", (door_x, door_y - 0.04, wall_base + door_h * 0.5), (door_w + 0.18, 0.16, door_h + 0.14), dark, root, bevel=0.014 if detail else 0.0)
        if is_barn:
            leaf_w = door_w * 0.48
            for leaf_index, leaf_side in enumerate((-1, 1)):
                lx = door_x + leaf_side * door_w * 0.25
                add_box(
                    f"{variant}_loading_leaf_{leaf_index}",
                    (lx, door_y - 0.105, wall_base + door_h * 0.5),
                    (leaf_w, 0.07, door_h - 0.06),
                    timber if leaf_index == 0 else dark,
                    root,
                    bevel=0.008 if detail else 0.0,
                )
                if detail:
                    _add_rect_brace(
                        f"{variant}_loading_leaf_brace_{leaf_index}",
                        (lx - leaf_w * 0.36, door_y - 0.145, wall_base + 0.20),
                        (lx + leaf_w * 0.36, door_y - 0.145, wall_base + door_h - 0.20),
                        0.075,
                        0.05,
                        dark,
                        root,
                        plane="xz",
                        bevel=0.006,
                    )
        elif detail:
            board_count = max(3, round(door_w / 0.24))
            board_w = door_w / board_count
            for board in range(board_count):
                bx = door_x - door_w * 0.5 + board_w * (board + 0.5)
                add_box(
                    f"{variant}_door_board_{board:02d}",
                    (bx, door_y - 0.105, wall_base + door_h * 0.5),
                    (board_w * 0.90, 0.055, door_h - 0.06),
                    timber if board % 3 else dark,
                    root,
                    rotation=(0, 0, 0.004 if board % 2 else -0.004),
                    bevel=0.008,
                )
            _add_rect_brace(
                f"{variant}_door_brace",
                (door_x - door_w * 0.40, door_y - 0.145, wall_base + 0.20),
                (door_x + door_w * 0.40, door_y - 0.145, wall_base + door_h - 0.20),
                0.085,
                0.055,
                dark,
                root,
                plane="xz",
                bevel=0.006,
            )
            add_fasteners(f"{variant}_door_fastener", ((door_x - door_w * 0.28, door_y - 0.16, wall_base + door_h * 0.68), (door_x + door_w * 0.28, door_y - 0.16, wall_base + door_h * 0.68)), 0.016, dark, root, depth=0.05)
        else:
            add_box(f"{variant}_door_panel", (door_x, door_y - 0.075, wall_base + door_h * 0.5), (door_w, 0.07, door_h), timber if is_plank else dark, root, bevel=0.0)

    window_w = 0.62 if not is_plank else 0.48
    window_h = 0.74 if not is_plank else 0.46
    window_z = wall_base + wall_height * (0.62 if profile["openingLayout"] != "outhouse-vent" else 0.80)
    front_windows = {
        "cottage-front": ((-width * 0.30, window_z), (width * 0.30, window_z)),
        "cottage-side": ((-width * 0.28, window_z),),
        "cottage-garden": ((-width * 0.34, window_z), (width * 0.30, window_z)),
        "inn-veranda": ((-width * 0.34, window_z), (width * 0.34, window_z), (-width * 0.28, wall_base + wall_height * 0.84), (width * 0.28, wall_base + wall_height * 0.84)),
        "market-arcade": (),
        "barn-loft": (),
        "shed-tools": ((width * 0.25, wall_base + wall_height * 0.62),),
        "outhouse-vent": (),
    }.get(profile["openingLayout"], ())
    if not detail:
        front_windows = front_windows[:1]
    for index, (wx, wz) in enumerate(front_windows):
        add_box(f"{variant}_front_window_reveal_{index}", (wx, front_y + 0.055, wz), (window_w + 0.24, 0.22, window_h + 0.24), dark, root, bevel=0.014 if detail else 0.0)
        _village_glazed_window(
            f"{variant}_front_window_{index}",
            (wx, front_y + 0.02, wz),
            window_w,
            window_h,
            dark,
            glass,
            timber,
            root,
            shutter_token=timber if profile["openingLayout"] in ("cottage-front", "cottage-side", "cottage-garden", "inn-veranda", "shed-tools") and detail else None,
        )

    if variant == "cottage-a" and detail:
        # The front gable otherwise reads as an uninterrupted plaster triangle.
        # A small recessed attic opening adds the reference's lived-in scale
        # without turning the cottage into a dormer-heavy hero building.
        gable_pitch = math.radians(pitch_deg)
        gable_rise = math.tan(gable_pitch) * (width * 0.5 + roof_overhang)
        gable_window_z = wall_top + min(gable_rise * 0.46, gable_rise - 0.55)
        add_box(
            f"{variant}_gable_window_reveal",
            (0.0, front_y - 0.12, gable_window_z),
            (0.78, 0.24, 0.72),
            dark,
            root,
            bevel=0.014,
        )
        _village_glazed_window(
            f"{variant}_gable_window",
            (0.0, front_y - 0.17, gable_window_z),
            0.52,
            0.50,
            dark,
            glass,
            timber,
            root,
            shutter_token=timber,
        )

    if profile["openingLayout"] in ("cottage-side", "cottage-garden"):
        _village_glazed_side_window(f"{variant}_side_window", -width * 0.5 - 0.04, 0.0, wall_base + wall_height * 0.62, window_w, window_h, dark, glass, timber, root, side=-1, shutters=detail)
    if profile["openingLayout"] == "inn-veranda" and detail:
        inn_window_side = -_village_wing_side(wing_offset) if profile["feature"] == "veranda-wing" else 1
        _village_glazed_side_window(
            f"{variant}_side_window",
            inn_window_side * (width * 0.5 + 0.04),
            -depth * 0.10,
            wall_base + wall_height * 0.84,
            0.64,
            0.72,
            dark,
            glass,
            timber,
            root,
            side=inn_window_side,
            shutters=False,
        )
    if profile["openingLayout"] == "outhouse-vent":
        add_box(f"{variant}_vent_frame", (width * 0.28, depth * 0.5 + 0.04, window_z), (0.42, 0.08, 0.30), dark, root, bevel=0.008 if detail else 0.0)
        add_box(f"{variant}_vent_slit", (width * 0.28, depth * 0.5 + 0.085, window_z), (0.24, 0.025, 0.08), timber, root, bevel=0.004)

    # Chimney placement is an explicit catalog binding, not a profile-wide random choice.
    if profile["chimney"] and chimney_h > 0:
        chimney_y = depth * 0.12
        if variant == "cottage-a":
            # The catalog value is the visible stack emphasis. Anchor the body
            # to the actual front-gable roof plane so it cannot disappear
            # inside the wall, then let the cap clear the ridge by a readable
            # but restrained amount.
            pitch = math.radians(pitch_deg)
            roof_half_span = width * 0.5 + roof_overhang
            chimney_roof_z = wall_top + math.tan(pitch) * max(
                0.0, roof_half_span - min(abs(chimney_x), roof_half_span)
            )
            ridge_z = wall_top + math.tan(pitch) * roof_half_span
            chimney_bottom_z = wall_top - 0.06
            chimney_top_z = max(chimney_roof_z + chimney_h * 0.55, ridge_z + 0.08)
            chimney_body_h = chimney_top_z - chimney_bottom_z
            chimney_body_cz = (chimney_bottom_z + chimney_top_z) * 0.5
            add_box(
                f"{variant}_chimney",
                (chimney_x, chimney_y, chimney_body_cz),
                (0.62, 0.54, chimney_body_h),
                stone,
                root,
                bevel=0.03 if detail else 0.0,
            )
            if detail:
                add_masonry_courses(
                    f"{variant}_chimney_masonry",
                    (chimney_x, chimney_y, chimney_body_cz),
                    0.62,
                    0.54,
                    chimney_body_h,
                    (stone,),
                    root,
                    courses=max(4, round(chimney_body_h / 0.46)),
                    blocks_per_long_side=2,
                    seed=seed + 23,
                    block_depth=0.12,
                    bevel=0.012,
                )
                add_box(
                    f"{variant}_chimney_crown",
                    (chimney_x, chimney_y, chimney_top_z + 0.06),
                    (0.72, 0.64, 0.12),
                    stone,
                    root,
                    bevel=0.012,
                )
                add_box(
                    f"{variant}_chimney_pot",
                    (chimney_x, chimney_y, chimney_top_z + 0.20),
                    (0.22, 0.22, 0.22),
                    dark,
                    root,
                    bevel=0.01,
                )
        else:
            add_box(f"{variant}_chimney", (chimney_x, chimney_y, wall_top + chimney_h * 0.28), (0.62, 0.54, chimney_h), stone, root, bevel=0.03 if detail else 0.0)
            if detail:
                add_masonry_courses(f"{variant}_chimney_masonry", (chimney_x, chimney_y, wall_top + chimney_h * 0.28), 0.62, 0.54, chimney_h, (stone,), root, courses=3, blocks_per_long_side=2, seed=seed + 23, block_depth=0.12, bevel=0.012)
                add_box(f"{variant}_chimney_crown", (chimney_x, chimney_y, wall_top + chimney_h * 0.82), (0.72, 0.64, 0.12), stone, root, bevel=0.012)
                add_box(f"{variant}_chimney_pot", (chimney_x, chimney_y, wall_top + chimney_h * 0.96), (0.22, 0.22, 0.28), dark, root, bevel=0.01)

    added_entry_stairs = False

    # Cottages inherit the farmhouse entry hierarchy without becoming smaller
    # copies: one uses a compact porch, the garden cottage the same porch under
    # an offset cross-gable, and the side-gable variant a working lean-to.
    if profile["feature"] in ("compact-porch", "offset-cross-gable") and porch_depth > 0:
        porch_w = width * porch_width_ratio
        deck_z = wall_base + 0.09
        porch_center_y = front_y - porch_depth * 0.48
        add_box(f"{variant}_porch_deck", (0, porch_center_y, deck_z - 0.07), (porch_w, porch_depth, 0.14), dark, root, bevel=0.018 if detail else 0.008)
        if detail and porch_planks > 0:
            add_plank_field(f"{variant}_porch_planks", (0, porch_center_y, deck_z + 0.025), porch_w - 0.08, porch_depth - 0.06, 0.06, (timber,), root, count=porch_planks, axis="x", seed=seed + 59, bevel=0.009)
        porch_front_y = front_y - porch_depth + 0.10
        post_x = porch_w * 0.42
        for index, px in enumerate((-post_x, post_x)):
            add_box(f"{variant}_porch_post_{index}", (px, porch_front_y, deck_z + wall_height * 0.34), (0.18, 0.18, wall_height * 0.64), dark, root, bevel=0.012 if detail else 0.006)
        add_box(f"{variant}_porch_header", (0, porch_front_y, deck_z + wall_height * 0.65), (porch_w + 0.16, 0.16, 0.16), dark, root, bevel=0.012 if detail else 0.006)
        _add_tiled_canopy(
            f"{variant}_porch_canopy",
            0.0,
            front_y,
            porch_w,
            porch_depth,
            deck_z + wall_height * 0.69,
            11.0,
            roof,
            dark,
            root,
            detail=detail,
            seed=seed + 61,
        )
        _village_ground_stairs(
            f"{variant}_porch_step",
            0.0,
            front_y - porch_depth - 0.16,
            deck_z,
            max(1.40, door_w + 0.42),
            timber,
            root,
            detail=detail,
        )
        added_entry_stairs = True

    if profile["feature"] == "lean-to" and wing_width > 0 and wing_depth > 0:
        side = _village_wing_side(wing_offset)
        lean_center_x = side * width * 0.5
        lean_outer_x = lean_center_x + side * wing_width * 0.44
        lean_pitch = math.radians(12)
        lean_slope = wing_width / math.cos(lean_pitch)
        lean_wall_z = wall_base + wall_height * 0.76
        lean_outer_z = lean_wall_z - math.sin(lean_pitch) * lean_slope
        platform_x = lean_center_x + side * wing_width * 0.5
        add_box(
            f"{variant}_cottage_lean_platform",
            (platform_x, 0, 0.07),
            (wing_width + 0.18, wing_depth + 0.22, 0.14),
            stone,
            root,
            bevel=0.016 if detail else 0.008,
        )
        if detail:
            _village_aligned_plinth(
                f"{variant}_cottage_lean_platform_masonry",
                wing_width + 0.26,
                wing_depth + 0.30,
                0.14,
                2,
                max(3, round(wing_width * 2.0)),
                (stone,),
                root,
                center_x=platform_x,
                center_y=0.0,
            )
        post_bottom = 0.14
        post_top = wall_base + wall_height * 0.63
        post_h = max(0.40, post_top - post_bottom)
        for index, py in enumerate((-wing_depth * 0.32, wing_depth * 0.32)):
            add_box(
                f"{variant}_cottage_lean_post_{index}",
                (lean_outer_x, py, post_bottom + post_h * 0.5),
                (0.16, 0.16, post_h),
                dark,
                root,
                bevel=0.01 if detail else 0.004,
            )
        add_box(f"{variant}_cottage_lean_header", (lean_outer_x, 0, post_top), (0.16, wing_depth + 0.12, 0.14), dark, root, bevel=0.01 if detail else 0.004)
        add_box(
            f"{variant}_cottage_lean_roof",
            (lean_center_x + side * wing_width * 0.5, 0, (lean_wall_z + lean_outer_z) * 0.5 - 0.04),
            (lean_slope + 0.08, wing_depth + 0.28, 0.065),
            roof,
            root,
            rotation=(0, side * lean_pitch, 0),
            bevel=0.008,
        )
        if detail:
            lean_rows = 5
            lean_columns = max(4, round((wing_depth + 0.28) / 0.42))
            row_step = lean_slope / lean_rows
            tile_d = (wing_depth + 0.28) / lean_columns
            lean_rng = seeded_rng(seed + 83)
            for row in range(lean_rows):
                distance = row_step * (row + 0.5)
                x = lean_center_x + side * math.cos(lean_pitch) * distance
                z = lean_wall_z - math.sin(lean_pitch) * distance + 0.09
                stagger = -tile_d * 0.5 if row % 2 else 0.0
                for column in range(lean_columns + (1 if row % 2 else 0)):
                    y = -(wing_depth + 0.28) * 0.5 + tile_d * (column + 0.5) + stagger
                    add_box(
                        f"{variant}_cottage_lean_tile_{row:02d}_{column:02d}",
                        (x, y, z + lean_rng.uniform(-0.009, 0.012)),
                        (row_step * 1.55, tile_d * lean_rng.uniform(0.88, 0.96), 0.085),
                        roof,
                        root,
                        rotation=(0, side * lean_pitch, lean_rng.uniform(-0.014, 0.014)),
                        bevel=0.008,
                    )
        add_box(f"{variant}_cottage_lean_bench", (lean_center_x + side * wing_width * 0.42, 0, 0.28), (wing_width * 0.72, wing_depth * 0.62, 0.12), timber, root, bevel=0.012 if detail else 0.006)

    # Inn: a deep farmhouse porch becomes a two-storey veranda and a side lodging wing.
    if profile["feature"].startswith("veranda"):
        porch_w = width * porch_width_ratio
        deck_z = wall_base + 0.10
        floor_z = wall_base + wall_height * 0.50
        add_box(
            f"{variant}_storey_band",
            (0, 0, floor_z),
            (width + 0.18, depth + 0.18, 0.14),
            dark,
            root,
            bevel=0.016 if detail else 0.008,
        )
        if profile["feature"] == "veranda-wing":
            add_box(
                f"{variant}_jetty_front",
                (0, front_y - 0.08, floor_z + 0.04),
                (width + 0.12, 0.16, 0.10),
                dark,
                root,
                bevel=0.012 if detail else 0.006,
            )
            for side_sign, name in ((-1, "left"), (1, "right")):
                add_box(
                    f"{variant}_jetty_{name}",
                    (side_sign * (width * 0.5 + 0.06), 0, floor_z + 0.04),
                    (0.14, depth + 0.08, 0.10),
                    dark,
                    root,
                    bevel=0.012 if detail else 0.006,
                )
        add_box(f"{variant}_veranda_deck", (0, front_y - porch_depth * 0.5, deck_z - 0.08), (porch_w, porch_depth, 0.16), dark, root, bevel=0.02 if detail else 0.0)
        if detail and porch_planks > 0:
            add_plank_field(f"{variant}_veranda_planks", (0, front_y - porch_depth * 0.5, deck_z + 0.04), porch_w - 0.08, porch_depth - 0.06, 0.07, (timber,), root, count=porch_planks, axis="x", seed=seed + 29, bevel=0.01)
        _add_tiled_canopy(
            f"{variant}_veranda_roof",
            0.0,
            front_y,
            porch_w,
            porch_depth,
            deck_z + wall_height * 0.64,
            10.0,
            roof,
            dark,
            root,
            detail=detail,
            seed=seed + 73,
        )
        post_front_y = front_y - porch_depth + 0.16
        for p_idx, px in enumerate((-porch_w * 0.42, porch_w * 0.42)):
            add_box(f"{variant}_veranda_post_{p_idx}", (px, post_front_y, deck_z + wall_height * 0.30), (0.22, 0.22, wall_height * 0.60), dark, root, bevel=0.014 if detail else 0.008)
        sign_x = porch_w * 0.42
        sign_z = wall_base + wall_height * 0.52
        add_box(f"{variant}_inn_sign_arm", (sign_x, post_front_y - 0.28, sign_z), (0.08, 0.58, 0.08), dark, root, bevel=0.008 if detail else 0.004)
        add_box(f"{variant}_inn_sign_hanger", (sign_x, post_front_y - 0.54, sign_z - 0.04), (0.04, 0.04, 0.18), dark, root, bevel=0.004)
        add_box(f"{variant}_inn_sign", (sign_x, post_front_y - 0.56, sign_z - 0.22), (0.90, 0.08, 0.46), accent, root, bevel=0.01 if detail else 0.0)
        add_box(f"{variant}_inn_sign_frame", (sign_x, post_front_y - 0.53, sign_z - 0.22), (1.00, 0.05, 0.54), dark, root, bevel=0.008 if detail else 0.0)
        _village_ground_stairs(
            f"{variant}_veranda_step",
            0.0,
            front_y - porch_depth - 0.16,
            deck_z,
            max(1.80, door_w + 0.50),
            timber,
            root,
            detail=detail,
        )
        added_entry_stairs = True
        if profile["feature"] == "veranda-wing" and wing_width > 0 and wing_depth > 0:
            wing_x = _village_signed_wing_x(width, wing_width, wing_offset, declared_half_width, roof_overhang)
            wing_y = depth * 0.12
            _add_attached_working_wing(
                f"{variant}_lodging_wing",
                wing_x,
                wing_y,
                wing_width,
                wing_depth,
                foundation_h,
                wall_base,
                wall_height * 0.88,
                pitch_deg,
                roof_overhang,
                stone,
                wall,
                timber,
                dark,
                roof,
                accent,
                root,
                detail=detail,
                seed=seed + 79,
                opening="window",
            )

    # Market hall: the front is a working counter, not another closed cottage facade.
    if profile["feature"].startswith("arcade"):
        awning_depth = max(0.65, porch_depth)
        awning_y = front_y - awning_depth * 0.52
        awning_pitch = math.radians(10)
        awning_panel_count = 10 if detail else 5
        awning_panel_w = width * 0.94 / awning_panel_count
        for panel in range(awning_panel_count):
            px = -width * 0.47 + awning_panel_w * (panel + 0.5)
            token = accent if panel % 3 else wall
            add_box(
                f"{variant}_awning_canvas_{panel:02d}",
                (px, awning_y - 0.03, wall_base + wall_height * 0.72 - (0.014 if panel % 2 else 0.0)),
                (awning_panel_w * 0.94, awning_depth, 0.075),
                token,
                root,
                rotation=(awning_pitch + (0.008 if panel % 2 else -0.005), 0, 0.005 if panel % 3 == 1 else -0.004),
                bevel=0.009 if detail else 0.005,
            )
        for rafter in range(6 if detail else 3):
            px = -width * 0.44 + width * 0.88 * rafter / (5 if detail else 2)
            add_box(f"{variant}_awning_rafter_{rafter}", (px, awning_y, wall_base + wall_height * 0.695), (0.09, awning_depth + 0.14, 0.09), dark, root, rotation=(awning_pitch, 0, 0), bevel=0.007)
        post_count = 4 if detail else 3
        for index in range(post_count):
            px = -width * 0.43 + width * 0.86 * index / max(1, post_count - 1)
            add_box(f"{variant}_arcade_post_{index}", (px, front_y - awning_depth * 0.78, wall_base + wall_height * 0.34), (0.22, 0.22, wall_height * 0.68), dark, root, bevel=0.014 if detail else 0.008)
        mouth_w = width * 0.58
        mouth_mid_z = wall_base + wall_height * 0.48
        add_box(
            f"{variant}_arcade_lintel",
            (0, front_y - 0.06, mouth_mid_z + wall_height * 0.28),
            (mouth_w + 0.28, 0.16, 0.18),
            dark,
            root,
            bevel=0.016 if detail else 0.0,
        )
        for reveal_side, name in ((-1, "left"), (1, "right")):
            add_box(
                f"{variant}_arcade_reveal_{name}",
                (reveal_side * mouth_w * 0.5, front_y - 0.06, mouth_mid_z),
                (0.16, 0.14, wall_height * 0.54),
                dark,
                root,
                bevel=0.012 if detail else 0.0,
            )
        counter_z = wall_base + wall_height * 0.18
        add_box(f"{variant}_stall_counter", (0, front_y - awning_depth * 0.78, counter_z), (width * 0.70, 0.50, 0.16), timber, root, bevel=0.012 if detail else 0.006)
        if detail and porch_planks > 0:
            add_plank_field(f"{variant}_counter_planks", (0, front_y - awning_depth * 0.78, counter_z + 0.09), width * 0.68, 0.40, 0.06, (timber, dark), root, count=min(porch_planks, 8), axis="x", seed=seed + 43, bevel=0.008)
        _village_ground_stairs(
            f"{variant}_arcade_step",
            0.0,
            front_y - awning_depth * 0.78 - 0.28,
            counter_z + 0.08,
            max(1.80, width * 0.42),
            timber,
            root,
            detail=detail,
        )
        added_entry_stairs = True
        if profile["feature"] == "arcade-storage" and wing_width > 0 and wing_depth > 0:
            wing_x = _village_signed_wing_x(width, wing_width, wing_offset, declared_half_width, roof_overhang)
            _add_attached_working_wing(
                f"{variant}_storage_wing",
                wing_x,
                depth * 0.12,
                wing_width,
                wing_depth,
                foundation_h,
                wall_base,
                wall_height * 0.72,
                pitch_deg,
                roof_overhang,
                stone,
                wall,
                timber,
                dark,
                roof,
                accent,
                root,
                detail=detail,
                seed=seed + 89,
                opening="door",
            )

    # Barn: a tall agricultural volume, front double doors, loft opening, and a loading lean-to.
    if profile["feature"] == "loading-lean-to":
        loft_z = wall_base + wall_height * 0.82
        if variant.endswith("-b"):
            add_box(f"{variant}_loft_vent_left", (-width * 0.22, front_y - 0.06, loft_z), (0.72, 0.08, 0.24), dark, root, bevel=0.01 if detail else 0.0)
            add_box(f"{variant}_loft_vent_right", (width * 0.22, front_y - 0.06, loft_z), (0.72, 0.08, 0.24), dark, root, bevel=0.01 if detail else 0.0)
        else:
            add_box(f"{variant}_loft_door_frame", (0.0, front_y - 0.04, loft_z), (0.78, 0.12, 0.90), dark, root, bevel=0.012 if detail else 0.0)
            add_box(f"{variant}_loft_door_panel", (0.0, front_y - 0.09, loft_z), (0.60, 0.06, 0.74), timber, root, bevel=0.008 if detail else 0.0)
            if detail:
                add_beam(
                    f"{variant}_loft_door_brace",
                    (-0.22, front_y - 0.12, loft_z - 0.28),
                    (0.22, front_y - 0.12, loft_z + 0.28),
                    0.022,
                    dark,
                    root,
                    vertices=5,
                )
        if wing_width > 0 and wing_depth > 0:
            side = _village_wing_side(wing_offset)
            lean_x = side * (width * 0.5 + wing_width * 0.5 + abs(wing_offset))
            lean_outer_x = lean_x + side * wing_width * 0.42
            add_box(
                f"{variant}_lean_deck",
                (lean_x, 0.0, 0.08),
                (wing_width + 0.16, wing_depth + 0.18, 0.14),
                timber,
                root,
                bevel=0.012 if detail else 0.006,
            )
            if detail:
                add_plank_field(
                    f"{variant}_lean_deck_planks",
                    (lean_x, 0.0, 0.16),
                    wing_width + 0.08,
                    wing_depth + 0.10,
                    0.05,
                    (timber, dark),
                    root,
                    count=max(4, round(wing_width / 0.28)),
                    axis="x",
                    seed=seed + 101,
                    bevel=0.008,
                )
            lean_pitch = 0.22
            lean_span = wing_width + 0.20
            post_top = wall_top * 0.60
            post_h = max(0.50, post_top - 0.14)
            for index, py in enumerate((-wing_depth * 0.30, wing_depth * 0.30)):
                add_box(
                    f"{variant}_lean_post_{index}",
                    (lean_outer_x, py, 0.14 + post_h * 0.5),
                    (0.20, 0.20, post_h),
                    dark,
                    root,
                    bevel=0.012 if detail else 0.006,
                )
            lean_courses = 4 if detail else 2
            course_span = lean_span / lean_courses
            for course in range(lean_courses):
                local_x = -lean_span * 0.5 + course_span * (course + 0.5)
                add_box(
                    f"{variant}_lean_roof_course_{course:02d}",
                    (lean_x + side * math.cos(lean_pitch) * local_x, 0.0, wall_top * 0.60 - math.sin(lean_pitch) * local_x + (lean_courses - course) * 0.012),
                    (course_span * 1.18, wing_depth + 0.24, 0.12),
                    roof,
                    root,
                    rotation=(0, side * lean_pitch, 0),
                    bevel=0.010 if detail else 0.005,
                )
            for rafter, py in enumerate((-wing_depth * 0.40, 0.0, wing_depth * 0.40)):
                add_box(f"{variant}_lean_rafter_{rafter}", (lean_x, py, wall_top * 0.60 - 0.09), (lean_span, 0.10, 0.10), dark, root, rotation=(0, side * lean_pitch, 0), bevel=0.007)

    # Shed: offset overhang and a functional tool rail break the miniature-cottage read.
    if profile["feature"] == "tool-overhang":
        overhang_x = width * 0.5 - wing_width * 0.15 + wing_offset * 0.20
        canopy_depth = max(0.48, porch_depth)
        canopy_w = max(0.86, wing_width + 0.20)
        _add_tiled_canopy(
            f"{variant}_tool_canopy",
            overhang_x,
            front_y,
            canopy_w,
            canopy_depth * 0.92,
            wall_base + wall_height * 0.78,
            14.0,
            roof,
            dark,
            root,
            detail=detail,
            seed=seed + 97,
        )
        canopy_front_y = front_y - canopy_depth * 0.82
        post_h = wall_height * 0.78
        for index, px in enumerate((overhang_x - canopy_w * 0.38, overhang_x + canopy_w * 0.38)):
            add_box(
                f"{variant}_tool_canopy_post_{index}",
                (px, canopy_front_y, wall_base + post_h * 0.5),
                (0.14, 0.14, post_h),
                dark,
                root,
                bevel=0.01 if detail else 0.004,
            )
        add_box(f"{variant}_tool_canopy_header", (overhang_x, canopy_front_y, wall_base + wall_height * 0.77), (canopy_w + 0.08, 0.14, 0.14), dark, root, bevel=0.01 if detail else 0.004)
        add_box(f"{variant}_tool_rail", (overhang_x, front_y - 0.10, wall_base + wall_height * 0.42), (max(0.55, wing_width * 0.78), 0.08, 0.10), dark, root, bevel=0.008 if detail else 0.004)
        for index in range(3 if detail else 2):
            add_box(f"{variant}_tool_hook_{index}", (overhang_x - 0.28 + index * 0.28, front_y - 0.14, wall_base + wall_height * 0.28), (0.06, 0.10, 0.24), timber, root, bevel=0.006)

    # Outhouse: offset roof edge, high vent, and privacy wall establish a functional micro-silhouette.
    if profile["feature"] == "privacy-wall":
        privacy_side = 1 if wing_offset >= 0 else -1
        privacy_x = privacy_side * (width * 0.5 + 0.055)
        privacy_h = wall_height * 0.76
        privacy_y = front_y - depth * 0.22
        add_box(
            f"{variant}_privacy_side_wall",
            (privacy_x, privacy_y, wall_base + privacy_h * 0.5),
            (0.11, depth * 0.58, privacy_h),
            timber,
            root,
            bevel=0.012 if detail else 0.006,
        )
        return_x = privacy_x - privacy_side * width * 0.18
        return_y = front_y - depth * 0.40
        add_box(
            f"{variant}_privacy_return_wall",
            (return_x, return_y, wall_base + privacy_h * 0.5),
            (width * 0.36, 0.11, privacy_h),
            timber,
            root,
            bevel=0.012 if detail else 0.006,
        )
        add_box(
            f"{variant}_privacy_top_rail",
            (privacy_x, privacy_y, wall_base + privacy_h + 0.02),
            (0.15, depth * 0.64, 0.12),
            dark,
            root,
            bevel=0.008 if detail else 0.004,
        )
        if detail:
            for slit in range(3):
                add_box(
                    f"{variant}_rear_vent_louver_{slit}",
                    (width * 0.28, depth * 0.5 + 0.10, window_z - 0.09 + slit * 0.09),
                    (0.28, 0.035, 0.035),
                    dark,
                    root,
                    bevel=0.003,
                )

    if not added_entry_stairs:
        _village_ground_stairs(
            f"{variant}_entry_step",
            door_x,
            front_y - 0.28,
            wall_base,
            max(1.10, door_w + 0.36),
            timber,
            root,
            detail=detail,
        )
