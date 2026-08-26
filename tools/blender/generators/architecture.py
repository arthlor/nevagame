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
    add_marker,
    add_ring,
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
    add_shingle_rows,
    add_timber_corner_frame,
)
from common.lod import consolidate_lod_level, create_lod_roots


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
) -> float:
    """Build broad, faceted gabled roof with authentic tiered tile courses, eaves overhang, and ridge beam."""
    pitch = math.radians(pitch_deg)
    half_w = width * 0.5 + overhang_side
    slope_length = half_w / math.cos(pitch)
    rise = math.sin(pitch) * slope_length
    roof_depth = depth + overhang_front * 2.0
    ridge_z = wall_top + rise

    tier_len = slope_length / courses
    for c_idx in range(courses):
        # Progress from eaves (0) to ridge (1)
        t0 = c_idx / courses
        t1 = (c_idx + 1) / courses
        mid_t = (t0 + t1) * 0.5
        dist_along = mid_t * slope_length

        # Offset along slope
        dx = dist_along * math.cos(pitch)
        dz = dist_along * math.sin(pitch)

        # Slight step up for lower courses
        step_z = (courses - c_idx) * 0.015

        # Left slope tier
        add_box(
            f"{prefix}_roof_tile_l_{c_idx:02d}",
            (-half_w + dx, 0, wall_top + dz + step_z),
            (tier_len * 1.08, roof_depth, course_thickness),
            roof_token,
            root,
            rotation=(0, -pitch, 0),
            bevel=bevel,
        )
        # Right slope tier
        add_box(
            f"{prefix}_roof_tile_r_{c_idx:02d}",
            (half_w - dx, 0, wall_top + dz + step_z),
            (tier_len * 1.08, roof_depth, course_thickness),
            roof_token,
            root,
            rotation=(0, pitch, 0),
            bevel=bevel,
        )

    # Ridge Cap Beam / Ridge Tiles
    add_box(
        f"{prefix}_roof_ridge_beam",
        (0, 0, ridge_z + 0.08),
        (0.28, roof_depth + 0.12, 0.22),
        trim_token,
        root,
        bevel=bevel,
    )

    # Gable End Walls
    gable_w = width - 0.10
    gable_h = rise * 0.98
    add_tri_prism(
        f"{prefix}_gable_wall_front",
        (0, -depth * 0.5 - 0.02, wall_top + gable_h * 0.5),
        (gable_w, 0.18, gable_h),
        trim_token,
        root,
    )
    add_tri_prism(
        f"{prefix}_gable_wall_back",
        (0, depth * 0.5 + 0.02, wall_top + gable_h * 0.5),
        (gable_w, 0.18, gable_h),
        trim_token,
        root,
    )

    if include_fascia:
        for side_sign, side_name in ((-1, "left"), (1, "right")):
            fascia_x = side_sign * half_w * 0.5
            for end_sign, end_name in ((-1, "front"), (1, "back")):
                fascia_y = end_sign * (depth * 0.5 + overhang_front - 0.04)
                add_box(
                    f"{prefix}_fascia_{end_name}_{side_name}",
                    (fascia_x, fascia_y, wall_top + rise * 0.5),
                    (slope_length + 0.08, 0.10, 0.16),
                    trim_token,
                    root,
                    rotation=(0, side_sign * pitch, 0),
                    bevel=min(bevel, 0.015) if bevel > 0 else 0.0,
                )

    return ridge_z


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
    return {
        "spec": spec,
        "params": params,
        "seed": spec["seed"],
        "detail": detail,
        "stone": palette[0],
        "plaster": palette[1] if len(palette) > 1 else "plaster_cream_01",
        "timber": palette[2] if len(palette) > 2 else "wood_honey_01",
        "dark": palette[3] if len(palette) > 3 else "wood_dark_01",
        "roof": palette[4] if len(palette) > 4 else "roof_terracotta_01",
        "glow": palette[5] if len(palette) > 5 else "emissive_lantern_01",
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
        "cross_gable_width": params["crossGableWidth"],
        "porch_depth": params["porchDepth"],
        "porch_planks": params["porchPlanks"] if detail else max(5, params["porchPlanks"] // 2),
        "chimney_offset_x": params["chimneyOffsetX"],
        "chimney_height": params["chimneyHeight"],
    }


def _farmhouse_foundation(ctx: dict, root) -> None:
    width, depth = ctx["width"], ctx["depth"]
    foundation_h = ctx["foundation_h"]
    stone = ctx["stone"]
    add_box(
        "farmhouse_foundation_base",
        (0, 0, foundation_h * 0.5),
        (width + 0.28, depth + 0.28, foundation_h),
        stone,
        root,
        bevel=0.06,
    )
    if ctx["masonry_courses"]:
        add_masonry_courses(
            "farmhouse_foundation_masonry",
            (0, 0, foundation_h * 0.5),
            width + 0.64,
            depth + 0.64,
            foundation_h,
            (stone,),
            root,
            courses=ctx["masonry_courses"],
            blocks_per_long_side=ctx["masonry_blocks"],
            seed=ctx["seed"] + 11,
            block_depth=0.22,
            bevel=0.018,
        )
    add_box(
        "farmhouse_foundation_water_table",
        (0, 0, foundation_h + 0.04),
        (width + 0.46, depth + 0.46, 0.10),
        stone,
        root,
        bevel=0.03,
    )


def _farmhouse_timber_frame(ctx: dict, root) -> None:
    add_box(
        "farmhouse_wall_core",
        (0, 0, ctx["wall_base"] + ctx["wall_height"] * 0.5),
        (ctx["width"], ctx["depth"], ctx["wall_height"]),
        ctx["plaster"],
        root,
        bevel=0.04,
    )
    add_timber_corner_frame(
        "farmhouse_frame",
        ctx["width"],
        ctx["depth"],
        ctx["wall_base"],
        ctx["wall_height"],
        ctx["timber"],
        root,
        post_w=0.28 if ctx["detail"] else 0.22,
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
    )
    add_shingle_rows(
        "farmhouse_shingles",
        width,
        depth,
        wall_top,
        pitch_deg,
        (roof,),
        root,
        rows=ctx["shingle_rows"],
        columns=ctx["shingle_columns"],
        seed=ctx["seed"] + 17,
    )

    cg_w = ctx["cross_gable_width"]
    cg_d = 2.2
    cg_pitch = math.radians(38)
    cg_slope = (cg_w * 0.5 + 0.4) / math.cos(cg_pitch)
    cg_rise = math.sin(cg_pitch) * cg_slope
    cg_base_z = wall_top + 0.10
    cg_y = -depth * 0.5 - 0.45
    add_box(
        "farmhouse_cg_roof_l",
        (-cg_w * 0.30, cg_y, cg_base_z + cg_rise * 0.48),
        (cg_slope, cg_d, 0.14),
        roof,
        root,
        rotation=(0, -cg_pitch, 0),
        bevel=0.02,
    )
    add_box(
        "farmhouse_cg_roof_r",
        (cg_w * 0.30, cg_y, cg_base_z + cg_rise * 0.48),
        (cg_slope, cg_d, 0.14),
        roof,
        root,
        rotation=(0, cg_pitch, 0),
        bevel=0.02,
    )
    add_box(
        "farmhouse_cg_ridge",
        (0, cg_y, cg_base_z + cg_rise + 0.06),
        (0.22, cg_d + 0.10, 0.18),
        timber,
        root,
        bevel=0.02,
    )
    add_mullioned_window(
        "farmhouse_attic_win",
        (0, -depth * 0.5 - 0.15, wall_top + 0.85),
        0.58,
        0.58,
        timber,
        glow,
        dark,
        root,
    )


def _farmhouse_chimney(ctx: dict, root) -> None:
    chim_x = ctx["chimney_offset_x"]
    chim_y = ctx["depth"] * 0.12
    chim_h = ctx["chimney_height"]
    stone, roof = ctx["stone"], ctx["roof"]
    add_box("farmhouse_chimney_base", (chim_x, chim_y, 1.15), (1.25, 1.25, 2.30), stone, root, bevel=0.06)
    add_box("farmhouse_chimney_shaft", (chim_x, chim_y, chim_h * 0.5), (0.96, 0.96, chim_h), stone, root, bevel=0.05)
    if ctx["masonry_courses"]:
        add_masonry_courses(
            "farmhouse_chimney_masonry",
            (chim_x, chim_y, chim_h * 0.5),
            0.96,
            0.96,
            chim_h,
            (stone,),
            root,
            courses=max(3, ctx["masonry_courses"]),
            blocks_per_long_side=3,
            seed=ctx["seed"] + 23,
            block_depth=0.16,
            bevel=0.016,
        )
    add_box("farmhouse_chimney_crown", (chim_x, chim_y, chim_h + 0.08), (1.10, 1.10, 0.18), stone, root, bevel=0.03)
    add_cylinder("farmhouse_chimney_pot", (chim_x, chim_y, chim_h + 0.38), 0.24, 0.48, roof, root, vertices=8, bevel=0.02)


def _farmhouse_porch(ctx: dict, root) -> None:
    front_y = ctx["front_y"]
    porch_w = 4.8
    porch_d = ctx["porch_depth"]
    porch_deck_z = ctx["wall_base"] + 0.12
    timber, dark, roof, glow = ctx["timber"], ctx["dark"], ctx["roof"], ctx["glow"]
    add_box(
        "farmhouse_porch_deck_base",
        (0, front_y - porch_d * 0.5, porch_deck_z - 0.08),
        (porch_w, porch_d, 0.18),
        dark,
        root,
        bevel=0.025,
    )
    add_plank_field(
        "farmhouse_porch_planks",
        (0, front_y - porch_d * 0.5, porch_deck_z + 0.05),
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
    post_x = porch_w * 0.44
    post_y = front_y - porch_d + 0.15
    for p_idx, px in enumerate((-post_x, post_x)):
        add_box(f"farmhouse_porch_post_{p_idx}", (px, post_y, porch_deck_z + 1.15), (0.26, 0.26, 2.30), timber, root, bevel=0.025)
        add_box(f"farmhouse_porch_post_cap_{p_idx}", (px, post_y, porch_deck_z + 2.32), (0.26, 0.26, 0.10), timber, root, bevel=0.015)
    add_box("farmhouse_porch_header_beam", (0, post_y, porch_deck_z + 2.26), (porch_w + 0.20, 0.18, 0.18), timber, root, bevel=0.02)
    canopy_pitch = math.radians(14)
    for c_idx in range(3):
        tier_p = (c_idx + 0.5) / 3.0
        add_box(
            f"farmhouse_porch_roof_tile_{c_idx}",
            (0, front_y - porch_d * tier_p, porch_deck_z + 2.45 - tier_p * 0.35),
            (porch_w + 0.35, porch_d * 0.42, 0.10),
            roof,
            root,
            rotation=(canopy_pitch, 0, 0),
            bevel=0.02,
        )
    for side_idx, sx in enumerate((-post_x, post_x)):
        add_box(
            f"farmhouse_porch_rail_top_{side_idx}",
            (sx, front_y - porch_d * 0.5, porch_deck_z + 0.88),
            (0.12, porch_d - 0.25, 0.10),
            timber,
            root,
            bevel=0.015,
        )
        for b_idx in range(3):
            add_box(
                f"farmhouse_porch_baluster_{side_idx}_{b_idx}",
                (sx, front_y - 0.35 - b_idx * 0.42, porch_deck_z + 0.46),
                (0.08, 0.08, 0.74),
                timber,
                root,
                bevel=0.01,
            )
    for step_idx in range(3):
        add_box(
            f"farmhouse_entry_step_{step_idx}",
            (0, front_y - porch_d - 0.16 - step_idx * 0.24, porch_deck_z - 0.06 - step_idx * 0.20),
            (1.90 + step_idx * 0.18, 0.32, 0.16),
            timber,
            root,
            bevel=0.02,
        )
    bench_x = -post_x * 0.55
    bench_y = front_y - porch_d * 0.45
    add_box("farmhouse_porch_bench_seat", (bench_x, bench_y, porch_deck_z + 0.42), (1.35, 0.38, 0.09), timber, root, bevel=0.015)
    add_box("farmhouse_porch_bench_back", (bench_x, bench_y + 0.15, porch_deck_z + 0.72), (1.35, 0.08, 0.52), timber, root, bevel=0.015)
    for l_idx, lx in enumerate((bench_x - 0.52, bench_x + 0.52)):
        add_box(f"farmhouse_porch_bench_leg_{l_idx}", (lx, bench_y, porch_deck_z + 0.20), (0.10, 0.32, 0.38), timber, root, bevel=0.01)
    lamp_x, lamp_y, lamp_z = 0.85, front_y - porch_d + 0.30, porch_deck_z + 1.95
    add_box("farmhouse_lantern_bracket", (lamp_x, lamp_y + 0.10, lamp_z + 0.22), (0.06, 0.22, 0.06), dark, root, bevel=0.008)
    add_box("farmhouse_lantern_frame", (lamp_x, lamp_y, lamp_z), (0.32, 0.32, 0.42), dark, root, bevel=0.018)
    add_ico("farmhouse_lantern_glow", (lamp_x, lamp_y, lamp_z), (0.13, 0.13, 0.20), glow, root, subdivisions=2)
    ctx["_porch_posts"] = (post_x, post_y, porch_deck_z)


def _farmhouse_openings(ctx: dict, root) -> None:
    front_y = ctx["front_y"]
    wall_base = ctx["wall_base"]
    timber, dark, glow = ctx["timber"], ctx["dark"], ctx["glow"]
    add_box("farmhouse_front_door_frame", (0, front_y - 0.03, wall_base + 1.15), (1.38, 0.16, 2.34), timber, root, bevel=0.025)
    add_box("farmhouse_front_door_panel", (0, front_y - 0.06, wall_base + 1.12), (1.18, 0.10, 2.18), dark, root, bevel=0.015)
    add_cylinder("farmhouse_door_handle", (0.42, front_y - 0.14, wall_base + 1.10), 0.025, 0.18, dark, root, vertices=6, bevel=0.005)
    win_z = wall_base + 1.65
    for sname, wx in (("left", -2.25), ("right", 2.25)):
        add_mullioned_window(
            f"farmhouse_window_{sname}",
            (wx, front_y - 0.04, win_z),
            1.15,
            1.15,
            timber,
            glow,
            dark,
            root,
            shutter_token=timber,
        )
    if not ctx["detail"]:
        return
    post_x, post_y, porch_deck_z = ctx["_porch_posts"]
    add_fasteners(
        "farmhouse_door_fastener",
        (
            (-0.46, front_y - 0.10, wall_base + 1.55),
            (0.46, front_y - 0.10, wall_base + 1.55),
            (-0.46, front_y - 0.10, wall_base + 0.72),
            (0.46, front_y - 0.10, wall_base + 0.72),
        ),
        0.018,
        dark,
        root,
        depth=0.07,
    )
    add_fasteners(
        "farmhouse_porch_fastener",
        (
            (-post_x, post_y, porch_deck_z + 2.20),
            (post_x, post_y, porch_deck_z + 2.20),
            (-post_x, post_y, porch_deck_z + 0.18),
            (post_x, post_y, porch_deck_z + 0.18),
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

    height = params.get("height", 7.8)
    radius = params.get("baseRadius", 2.3)
    sides = params.get("sides", 10)
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
            courses=params.get("masonryCourses", 8),
            blocks_per_course=params.get("masonryBlocks", 14),
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
    # Turf/thatch conical roof
    roof_h = 1.95
    add_cone(
        "windmill_roof_cone",
        (0, 0, cap_base_z + 0.16 + roof_h * 0.5),
        cap_r + 0.05,
        0.08,
        roof_h,
        turf,
        root,
        vertices=sides,
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
    rotor_y = -timber_top_r - 0.35
    rotor_name = "windmill_rotor" if spec.get("_lodIndex", 0) == 0 else f"{spec['id']}_LOD{spec.get('_lodIndex')}_rotor"
    rotor = add_marker(rotor_name, (0, 0, 0), root, marker_type="animation_pivot")
    rotor["pivot"] = [0, rotor_y, rotor_z]

    hub_center = (0, rotor_y - 0.06, rotor_z)
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
    sail_reach = 3.90
    r_min = 1.05
    r_max = 3.65
    sail_w = 0.76
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
    add_box("lighthouse_cottage_walls", (cottage_x, cottage_y, cottage_z), (cottage_w, cottage_d, cottage_h), plaster, root, bevel=0.03)
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
    )
    add_shingle_rows(
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
    )
    add_box(
        "lighthouse_cottage_chimney",
        (cottage_x + cottage_w * 0.32, cottage_y + cottage_d * 0.25, foundation_h + cottage_h + 0.85),
        (0.60, 0.60, 1.70),
        stone,
        root,
        bevel=0.03,
    )
    add_box(
        "lighthouse_cottage_door",
        (cottage_x, cottage_y - cottage_d * 0.5 - 0.02, foundation_h + 1.05),
        (0.85, 0.12, 1.85),
        dark,
        root,
        bevel=0.02,
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
        for vl_idx in range(9 if detail else 5):
            v_angle = math.pi * (vl_idx + 0.5) / 9
            lx = acx + math.cos(v_angle) * (arch_radius - 0.02)
            lz = arch_center_z + math.sin(v_angle) * (arch_radius - 0.02)
            seg_chord = (math.pi * arch_radius / 9) + 0.04
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
                add_box(
                    f"bridge_spandrel_{y_side}_{seg:02d}",
                    (x, y_pos, spandrel_cz),
                    (seg_len + 0.04, 0.20, spandrel_h),
                    stone if seg % 3 != 1 else shadow,
                    root,
                    bevel=0.02,
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
        "length": params["length"],
        "width": params["width"],
        "has_canopy": params["canopy"],
        "deck_planks": params["deckPlanks"],
        "pile_rows": params["pileRows"],
        "deck_z": 1.48,
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
        (honey,),
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
    """Paired weathered pilings, collars, caps, and braces."""
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

    # 2. Round Weathered Pilings with Footing Collars and Caps
    for r_idx in range(pile_rows):
        px = -length * 0.44 + r_idx * (length * 0.88) / (pile_rows - 1)
        for s_idx, py in enumerate((-width * 0.46, width * 0.46)):
            # Piling column
            add_cylinder(
                f"dock_piling_{r_idx}_{s_idx}",
                (px, py, 0.75),
                0.22,
                1.55,
                weathered,
                root,
                vertices=8,
                bevel=0.02,
            )
            # Bottom footing collar
            add_box(
                f"dock_piling_collar_{r_idx}_{s_idx}",
                (px, py, 0.12),
                (0.52, 0.52, 0.24),
                dark,
                root,
                bevel=0.03,
            )
            # Piling top cap extending above deck
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
            (px, -width * 0.44, 0.65),
            (px, width * 0.44, 1.25),
            0.065,
            weathered,
            root,
            vertices=6,
        )

    # Longitudinal side diagonal cross-braces
    for s_idx, py in enumerate((-width * 0.44, width * 0.44)):
        add_beam(
            f"dock_diag_brace_left_{s_idx}",
            (-length * 0.42, py, 0.35),
            (-length * 0.15, py, 1.25),
            0.065,
            weathered,
            root,
            vertices=6,
        )
        add_beam(
            f"dock_diag_brace_right_{s_idx}",
            (length * 0.15, py, 1.25),
            (length * 0.42, py, 0.35),
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

    # 3. Harbor Trading Stall with Gabled Striped Canvas Canopy
    if has_canopy:
        stall_x = 0.90
        stall_w = 3.20
        stall_d = 2.40
        stall_post_h = 2.55

        # 4 Sturdy timber canopy posts
        for p_idx, (px, py) in enumerate((
            (stall_x - stall_w * 0.44, -stall_d * 0.44),
            (stall_x + stall_w * 0.44, -stall_d * 0.44),
            (stall_x - stall_w * 0.44, stall_d * 0.44),
            (stall_x + stall_w * 0.44, stall_d * 0.44),
        )):
            add_box(
                f"dock_canopy_post_{p_idx}",
                (px, py, deck_z + stall_post_h * 0.5),
                (0.16, 0.16, stall_post_h),
                dark,
                root,
                bevel=0.02,
            )

        # Gabled Striped Canvas Awning Canopy
        canopy_ridge_z = deck_z + stall_post_h + 0.48
        canopy_pitch = math.radians(16)
        # Left & right canvas roof slopes
        add_box(
            "dock_canopy_canvas_left",
            (stall_x, -stall_d * 0.25, canopy_ridge_z - 0.12),
            (stall_w + 0.35, stall_d * 0.55, 0.08),
            canvas,
            root,
            rotation=(-canopy_pitch, 0, 0),
            bevel=0.015,
        )
        add_box(
            "dock_canopy_canvas_right",
            (stall_x, stall_d * 0.25, canopy_ridge_z - 0.12),
            (stall_w + 0.35, stall_d * 0.55, 0.08),
            canvas,
            root,
            rotation=(canopy_pitch, 0, 0),
            bevel=0.015,
        )
        # Red coastal awning stripes
        for s_idx, stripe_x in enumerate((-1.1, 0.0, 1.1)):
            add_box(
                f"dock_canopy_stripe_l_{s_idx}",
                (stall_x + stripe_x, -stall_d * 0.25, canopy_ridge_z - 0.11),
                (0.35, stall_d * 0.56, 0.09),
                red,
                root,
                rotation=(-canopy_pitch, 0, 0),
                bevel=0.01,
            )
            add_box(
                f"dock_canopy_stripe_r_{s_idx}",
                (stall_x + stripe_x, stall_d * 0.25, canopy_ridge_z - 0.11),
                (0.35, stall_d * 0.56, 0.09),
                red,
                root,
                rotation=(canopy_pitch, 0, 0),
                bevel=0.01,
            )

        # Ridge beam
        add_box(
            "dock_canopy_ridge",
            (stall_x, 0, canopy_ridge_z + 0.02),
            (stall_w + 0.40, 0.14, 0.14),
            dark,
            root,
            bevel=0.015,
        )

        # Wooden fish cleaning / trading market counter
        add_box(
            "dock_counter_body",
            (stall_x, 0, deck_z + 0.45),
            (stall_w * 0.85, 1.10, 0.86),
            honey,
            root,
            bevel=0.025,
        )
        add_box(
            "dock_counter_top",
            (stall_x, 0, deck_z + 0.90),
            (stall_w * 0.90, 1.20, 0.12),
            dark,
            root,
            bevel=0.015,
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

    # Wooden boarding ladders on dock side
    for side_idx, lx in enumerate((-length * 0.28, length * 0.28)):
        for rung in range(5):
            add_box(
                f"dock_ladder_rung_{side_idx}_{rung}",
                (lx, -width * 0.52, 0.32 + rung * 0.26),
                (0.58, 0.08, 0.07),
                weathered,
                root,
                bevel=0.01,
            )
        for rail_idx, rx in enumerate((lx - 0.30, lx + 0.30)):
            add_box(
                f"dock_ladder_rail_{side_idx}_{rail_idx}",
                (rx, -width * 0.52, 0.85),
                (0.08, 0.08, 1.45),
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


def working_dock(spec: dict, root) -> None:
    """Authored harbor working dock matching dock_market_isolated."""
    ctx = _dock_context(spec)
    _dock_deck(ctx, root)
    _dock_pilings(ctx, root)
    _dock_canopy(ctx, root)
    add_collision_primitives(spec, root)



def fish_market(spec: dict, root) -> None:
    _finish_architecture(spec, root, _build_fish_market)


def _fish_market_context(spec: dict) -> dict:
    """Catalog parameters plus palette for brief-component fish-market builders."""
    params = spec["parameters"]
    palette = spec["palette"]
    detail = _is_hero_detail(spec)
    foundation_h = 0.76
    wall_height = params["wallHeight"]
    wall_base = foundation_h + 0.06
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
        "width": params["width"],
        "depth": params["depth"],
        "wall_height": wall_height,
        "pitch_deg": params["roofPitchDeg"],
        "masonry_courses": params["masonryCourses"] if detail else 0,
        "masonry_blocks": params["masonryBlocks"],
        "shingle_rows": params["shingleRows"] if detail else max(3, params["shingleRows"] // 2),
        "shingle_columns": params["shingleColumns"] if detail else max(4, params["shingleColumns"] // 2),
        "foundation_h": foundation_h,
        "wall_base": wall_base,
        "wall_cz": wall_base + wall_height * 0.5,
        "wall_top": wall_base + wall_height,
    }


def _fish_market_foundation(ctx: dict, root) -> None:
    """Masonry-wrapped stone plinth."""
    width = ctx["width"]
    depth = ctx["depth"]
    wall_height = ctx["wall_height"]
    pitch_deg = ctx["pitch_deg"]
    detail = ctx["detail"]
    seed = ctx["seed"]
    masonry_courses = ctx["masonry_courses"]
    masonry_blocks = ctx["masonry_blocks"]
    shingle_rows = ctx["shingle_rows"]
    shingle_columns = ctx["shingle_columns"]
    stone = ctx["stone"]
    weathered = ctx["weathered"]
    roof = ctx["roof"]
    teal = ctx["teal"]
    canvas = ctx["canvas"]
    dark = ctx["dark"]
    foundation_h = ctx["foundation_h"]
    wall_base = ctx["wall_base"]
    wall_cz = ctx["wall_cz"]
    wall_top = ctx["wall_top"]

    # 1. Grounded Stone Foundation Plinth
    foundation_h = 0.76
    add_box(
        "fish_market_foundation",
        (0, 0, foundation_h * 0.5),
        (width + 0.24, depth + 0.24, foundation_h),
        stone,
        root,
        bevel=0.06,
    )
    if masonry_courses:
        add_masonry_courses(
            "fish_market_foundation_masonry",
            (0, 0, foundation_h * 0.5),
            width + 0.60,
            depth + 0.60,
            foundation_h,
            (stone,),
            root,
            courses=masonry_courses,
            blocks_per_long_side=masonry_blocks,
            seed=seed + 41,
            block_depth=0.20,
            bevel=0.018,
        )


def _fish_market_warehouse(ctx: dict, root) -> None:
    """Weathered timber hall and corner frame."""
    width = ctx["width"]
    depth = ctx["depth"]
    wall_height = ctx["wall_height"]
    pitch_deg = ctx["pitch_deg"]
    detail = ctx["detail"]
    seed = ctx["seed"]
    masonry_courses = ctx["masonry_courses"]
    masonry_blocks = ctx["masonry_blocks"]
    shingle_rows = ctx["shingle_rows"]
    shingle_columns = ctx["shingle_columns"]
    stone = ctx["stone"]
    weathered = ctx["weathered"]
    roof = ctx["roof"]
    teal = ctx["teal"]
    canvas = ctx["canvas"]
    dark = ctx["dark"]
    foundation_h = ctx["foundation_h"]
    wall_base = ctx["wall_base"]
    wall_cz = ctx["wall_cz"]
    wall_top = ctx["wall_top"]

    # 2. Weathered Timber Warehouse Body with Exposed Dark Timber Frame
    wall_base = foundation_h + 0.06
    wall_cz = wall_base + wall_height * 0.5
    add_box(
        "fish_market_wall_core",
        (0, 0, wall_cz),
        (width, depth, wall_height),
        weathered,
        root,
        bevel=0.04,
    )

    add_timber_corner_frame(
        "fish_market_frame",
        width,
        depth,
        wall_base,
        wall_height,
        dark,
        root,
        post_w=0.28 if detail else 0.22,
    )


def _fish_market_roof(ctx: dict, root) -> None:
    """Overlapping deep-red shingle gable."""
    width = ctx["width"]
    depth = ctx["depth"]
    wall_height = ctx["wall_height"]
    pitch_deg = ctx["pitch_deg"]
    detail = ctx["detail"]
    seed = ctx["seed"]
    masonry_courses = ctx["masonry_courses"]
    masonry_blocks = ctx["masonry_blocks"]
    shingle_rows = ctx["shingle_rows"]
    shingle_columns = ctx["shingle_columns"]
    stone = ctx["stone"]
    weathered = ctx["weathered"]
    roof = ctx["roof"]
    teal = ctx["teal"]
    canvas = ctx["canvas"]
    dark = ctx["dark"]
    foundation_h = ctx["foundation_h"]
    wall_base = ctx["wall_base"]
    wall_cz = ctx["wall_cz"]
    wall_top = ctx["wall_top"]

    # 3. Clean Gabled Deep-Red Terracotta Roof with Shingle Courses
    wall_top = wall_base + wall_height
    _shingled_gable_roof(
        "fish_market",
        width,
        depth,
        wall_top,
        pitch_deg,
        roof,
        dark,
        root,
        overhang_front=0.72,
        overhang_side=0.55,
        courses=3 if detail else 2,
        course_thickness=0.18,
    )
    add_shingle_rows(
        "fish_market_shingles",
        width,
        depth,
        wall_top,
        pitch_deg,
        (roof,),
        root,
        rows=shingle_rows,
        columns=shingle_columns,
        seed=seed + 43,
    )


def _fish_market_stall(ctx: dict, root) -> None:
    """Striped stall, loading doors, and trade sign."""
    width = ctx["width"]
    depth = ctx["depth"]
    wall_height = ctx["wall_height"]
    pitch_deg = ctx["pitch_deg"]
    detail = ctx["detail"]
    seed = ctx["seed"]
    masonry_courses = ctx["masonry_courses"]
    masonry_blocks = ctx["masonry_blocks"]
    shingle_rows = ctx["shingle_rows"]
    shingle_columns = ctx["shingle_columns"]
    stone = ctx["stone"]
    weathered = ctx["weathered"]
    roof = ctx["roof"]
    teal = ctx["teal"]
    canvas = ctx["canvas"]
    dark = ctx["dark"]
    foundation_h = ctx["foundation_h"]
    wall_base = ctx["wall_base"]
    wall_cz = ctx["wall_cz"]
    wall_top = ctx["wall_top"]

    # 4. Open Market Trading Facade with Striped Canvas Awning
    front_y = -depth * 0.5
    stall_w = 5.2
    stall_d = 1.45
    counter_z = wall_base + 0.95

    # Wooden trading counter
    add_box(
        "fish_market_counter_body",
        (0, front_y - stall_d * 0.4, counter_z * 0.5),
        (stall_w, 0.65, counter_z),
        weathered,
        root,
        bevel=0.025,
    )
    add_plank_field(
        "fish_market_counter_planks",
        (0, front_y - stall_d * 0.4, counter_z + 0.08),
        stall_w + 0.15,
        0.78,
        0.10,
        (teal,),
        root,
        count=10 if detail else 4,
        axis="x",
        seed=seed + 47,
        bevel=0.012,
    )

    # Timber awning posts
    for p_idx, px in enumerate((-stall_w * 0.46, stall_w * 0.46)):
        add_box(
            f"fish_market_awning_post_{p_idx}",
            (px, front_y - stall_d + 0.12, wall_base + 1.45),
            (0.18, 0.18, 2.90),
            dark,
            root,
            bevel=0.02,
        )

    # Striped Canvas Awning Canopy
    awning_pitch = math.radians(14)
    awning_cz = wall_base + 2.75
    add_box(
        "fish_market_awning_canvas",
        (0, front_y - stall_d * 0.52, awning_cz),
        (stall_w + 0.40, stall_d + 0.35, 0.12),
        canvas,
        root,
        rotation=(awning_pitch, 0, 0),
        bevel=0.02,
    )
    for s_idx, stripe_x in enumerate((-1.8, -0.6, 0.6, 1.8)):
        add_box(
            f"fish_market_awning_stripe_{s_idx}",
            (stripe_x, front_y - stall_d * 0.52, awning_cz + 0.02),
            (0.38, stall_d + 0.36, 0.08),
            teal,
            root,
            rotation=(awning_pitch, 0, 0),
            bevel=0.01,
        )

    # 5. Warehouse Loading Double Doors & Display Crates
    for d_idx, dx in enumerate((-1.45, 1.45)):
        add_box(
            f"fish_market_loading_door_{d_idx}",
            (dx, front_y - 0.04, wall_base + 1.25),
            (1.95, 0.14, 2.50),
            dark,
            root,
            bevel=0.025,
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

    # Display fish crates in front of counter
    for c_idx, cx in enumerate((-1.8, 0.0, 1.8)):
        add_box(
            f"fish_market_display_crate_{c_idx}",
            (cx, front_y - stall_d - 0.25, 0.42),
            (0.95, 0.65, 0.45),
            weathered if c_idx % 2 == 0 else teal,
            root,
            bevel=0.018,
        )

    # 6. Hanging Carved Wooden Fish Market Trade Sign
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
    # Carved fish body & tail
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


def _build_fish_market(spec: dict, root) -> None:
    """Authored coastal fish market matching dock_market_isolated warehouse language."""
    ctx = _fish_market_context(spec)
    _fish_market_foundation(ctx, root)
    _fish_market_warehouse(ctx, root)
    _fish_market_roof(ctx, root)
    _fish_market_stall(ctx, root)



def village_building(spec: dict, root) -> None:
    _finish_architecture(spec, root, _build_village_building)


def _village_palette(palette: list[str]) -> tuple[str, str, str, str, str, str]:
    stone = palette[0]
    wall = palette[1] if len(palette) > 1 else "plaster_cream_01"
    timber = palette[2] if len(palette) > 2 else "wood_honey_01"
    if len(palette) >= 6:
        return stone, wall, timber, palette[3], palette[4], palette[5]
    if len(palette) == 5:
        return stone, wall, timber, palette[3], palette[4], palette[3]
    if len(palette) == 4:
        return stone, wall, timber, timber, palette[3], timber
    return stone, wall, timber, timber, timber, timber


def _build_village_building(spec: dict, root) -> None:
    """Authored coastal-village architecture: cottages, inn, hall, barn, shed, outhouse."""
    params = spec["parameters"]
    variant = params.get("variant", "cottage-a")
    stone, wall, timber, dark, roof, accent = _village_palette(spec["palette"])
    detail = _is_hero_detail(spec)
    seed = spec["seed"]
    is_barn = variant == "barn"
    is_shed = variant in ("shed", "outhouse")
    is_hero = variant in ("inn", "market-hall")

    width = params.get("width", 5.2)
    depth = params.get("depth", 4.4)
    wall_height = params.get("wallHeight", 2.7)
    pitch_deg = params.get("roofPitchDeg", 34)
    foundation_h = 0.42 if is_shed else (0.52 if is_barn else 0.70)
    wall_token = wall
    bevel = 0.05 if detail else 0.02
    front_y = -depth * 0.5

    add_box(
        f"{variant}_foundation",
        (0, 0, foundation_h * 0.5),
        (width + 0.28, depth + 0.28, foundation_h),
        stone,
        root,
        bevel=bevel,
    )
    if detail:
        add_masonry_courses(
            f"{variant}_foundation_masonry",
            (0, 0, foundation_h * 0.5),
            width + (0.58 if is_hero else 0.48),
            depth + (0.58 if is_hero else 0.48),
            foundation_h,
            (stone,),
            root,
            courses=4 if is_hero else (3 if not is_shed else 2),
            blocks_per_long_side=6 if is_hero else (4 if not is_shed else 3),
            seed=seed + 17,
            block_depth=0.18 if is_hero else 0.14,
            bevel=0.016,
        )
    add_box(
        f"{variant}_water_table",
        (0, 0, foundation_h + 0.04),
        (width + 0.42, depth + 0.42, 0.09),
        stone,
        root,
        bevel=0.025 if detail else 0.012,
    )

    wall_base = foundation_h + 0.08
    wall_cz = wall_base + wall_height * 0.5
    add_box(
        f"{variant}_wall_core",
        (0, 0, wall_cz),
        (width, depth, wall_height),
        wall_token,
        root,
        bevel=0.035 if detail else 0.02,
    )
    if detail and is_barn:
        add_plank_field(
            f"{variant}_battens_front",
            (0, front_y + 0.04, wall_cz),
            width - 0.28,
            0.06,
            wall_height - 0.12,
            (wall, timber),
            root,
            count=7,
            axis="x",
            seed=seed + 31,
            bevel=0.01,
        )
        add_plank_field(
            f"{variant}_battens_back",
            (0, depth * 0.5 - 0.04, wall_cz),
            width - 0.28,
            0.06,
            wall_height - 0.12,
            (wall, timber),
            root,
            count=7,
            axis="x",
            seed=seed + 37,
            bevel=0.01,
        )
    if detail and is_shed:
        add_plank_field(
            f"{variant}_wall_planks",
            (0, front_y + 0.03, wall_cz),
            width - 0.18,
            0.05,
            wall_height - 0.1,
            (wall, timber),
            root,
            count=5 if variant == "shed" else 4,
            axis="x",
            seed=seed + 41,
            bevel=0.01,
        )

    post_w = 0.26 if detail else 0.2
    for x_idx, px in enumerate((-width * 0.5 + post_w * 0.4, width * 0.5 - post_w * 0.4)):
        for y_idx, py in enumerate((-depth * 0.5 + post_w * 0.4, depth * 0.5 - post_w * 0.4)):
            add_box(
                f"{variant}_corner_post_{x_idx}_{y_idx}",
                (px, py, wall_cz),
                (post_w, post_w, wall_height + 0.06),
                dark,
                root,
                bevel=0.02 if detail else 0.012,
            )

    for y_sign in (-1, 1):
        add_box(
            f"{variant}_plate_{'front' if y_sign < 0 else 'back'}",
            (0, y_sign * (depth * 0.5 - 0.07), wall_base + wall_height - 0.08),
            (width + 0.08, 0.14, 0.16),
            timber,
            root,
            bevel=0.012 if detail else 0.0,
        )
        add_box(
            f"{variant}_sill_{'front' if y_sign < 0 else 'back'}",
            (0, y_sign * (depth * 0.5 - 0.05), wall_base + 0.08),
            (width - 0.12, 0.12, 0.12),
            timber,
            root,
            bevel=0.01 if detail else 0.0,
        )
        if detail and not is_shed:
            add_box(
                f"{variant}_mid_tie_{'front' if y_sign < 0 else 'back'}",
                (0, y_sign * (depth * 0.5 - 0.04), wall_base + wall_height * 0.42),
                (width - 0.16, 0.10, 0.12),
                timber,
                root,
                bevel=0.012,
            )

    wall_top = wall_base + wall_height
    courses = 4 if detail and is_hero else (3 if detail else 2)
    _shingled_gable_roof(
        variant,
        width,
        depth,
        wall_top,
        pitch_deg,
        roof,
        dark,
        root,
        overhang_front=0.58 if is_hero else (0.28 if is_barn or is_shed else 0.42),
        overhang_side=0.46 if is_hero else 0.34,
        courses=courses,
        course_thickness=0.16 if detail else 0.18,
        include_fascia=True,
        bevel=0.025 if detail else 0.012,
    )
    if detail and is_hero:
        add_shingle_rows(
            f"{variant}_shingles",
            width,
            depth,
            wall_top,
            pitch_deg,
            (roof,),
            root,
            rows=5,
            columns=6,
            seed=seed + 19,
        )

    door_w = 0.72 if variant == "outhouse" else (0.86 if variant == "shed" else (1.7 if is_barn else 0.92))
    door_h = 1.55 if is_shed else (2.15 if is_barn else 1.78)
    door_y = front_y - 0.03
    add_box(
        f"{variant}_door_frame",
        (0, door_y, wall_base + door_h * 0.5),
        (door_w + 0.16, 0.12, door_h + 0.12),
        dark,
        root,
        bevel=0.012 if detail else 0.0,
    )
    add_box(
        f"{variant}_door_panel",
        (0, door_y - 0.03, wall_base + door_h * 0.5),
        (door_w, 0.07, door_h),
        timber if is_barn or is_shed else dark,
        root,
        bevel=0.01 if detail else 0.0,
    )
    if detail:
        add_fasteners(
            f"{variant}_door_fastener",
            (
                (-door_w * 0.28, door_y - 0.06, wall_base + door_h * 0.68),
                (door_w * 0.28, door_y - 0.06, wall_base + door_h * 0.68),
            ),
            0.016,
            dark,
            root,
            depth=0.05,
        )

    window_h = 0.52 if is_shed else 0.78
    window_w = 0.42 if is_shed else 0.62
    window_z = wall_base + wall_height * (0.62 if is_shed else 0.56)
    window_layout = {
        "cottage-a": ((-width * 0.28, door_y), (width * 0.28, door_y), (width * 0.22, depth * 0.5 + 0.03)),
        "cottage-b": ((-width * 0.26, door_y), (width * 0.32, depth * 0.5 + 0.03), (-width * 0.32, depth * 0.5 + 0.03)),
        "inn": (
            (-width * 0.32, door_y),
            (width * 0.32, door_y),
            (-width * 0.28, depth * 0.5 + 0.03),
            (width * 0.28, depth * 0.5 + 0.03),
            (width * 0.5 + 0.03, 0.0),
        ),
        "market-hall": (
            (-width * 0.34, door_y),
            (width * 0.34, door_y),
            (-width * 0.2, depth * 0.5 + 0.03),
            (width * 0.2, depth * 0.5 + 0.03),
        ),
        "barn": ((-width * 0.32, depth * 0.5 + 0.03), (width * 0.32, depth * 0.5 + 0.03)),
        "shed": ((width * 0.22, door_y),),
        "outhouse": ((0.0, depth * 0.5 + 0.03),),
    }
    windows = window_layout.get(variant, ())
    if not detail:
        windows = windows[:1]
    glass = accent if is_hero else timber
    for index, (wx, wy) in enumerate(windows):
        add_box(
            f"{variant}_window_frame_{index}",
            (wx, wy, window_z),
            (window_w + 0.1, 0.08, window_h + 0.1),
            dark,
            root,
            bevel=0.01 if detail else 0.0,
        )
        add_box(
            f"{variant}_window_glass_{index}",
            (wx, wy - 0.012 if wy < 0 else wy + 0.012, window_z),
            (window_w, 0.04, window_h),
            glass,
            root,
            bevel=0.006 if detail else 0.0,
        )
        if detail and variant in ("cottage-a", "cottage-b", "inn", "shed"):
            shutter_w = window_w * 0.42
            for side, sx in enumerate((-1, 1)):
                add_box(
                    f"{variant}_shutter_{index}_{side}",
                    (wx + sx * (window_w * 0.5 + shutter_w * 0.52), wy - 0.02 if wy < 0 else wy + 0.02, window_z),
                    (shutter_w, 0.05, window_h * 0.96),
                    timber,
                    root,
                    bevel=0.008,
                )

    if variant in ("cottage-a", "cottage-b", "inn"):
        chimney_x = width * (0.28 if variant == "inn" else 0.32)
        chimney_y = depth * 0.12
        chimney_h = 1.55 if variant == "inn" else 1.22
        add_box(
            f"{variant}_chimney",
            (chimney_x, chimney_y, wall_top + chimney_h * 0.28),
            (0.62, 0.54, chimney_h),
            stone,
            root,
            bevel=0.03 if detail else 0.0,
        )
        if detail:
            add_masonry_courses(
                f"{variant}_chimney_masonry",
                (chimney_x, chimney_y, wall_top + chimney_h * 0.28),
                0.62,
                0.54,
                chimney_h,
                (stone,),
                root,
                courses=3,
                blocks_per_long_side=2,
                seed=seed + 23,
                block_depth=0.12,
                bevel=0.012,
            )
            add_box(
                f"{variant}_chimney_crown",
                (chimney_x, chimney_y, wall_top + chimney_h * 0.82),
                (0.72, 0.64, 0.12),
                stone,
                root,
                bevel=0.012,
            )
            add_box(
                f"{variant}_chimney_pot",
                (chimney_x, chimney_y, wall_top + chimney_h * 0.96),
                (0.22, 0.22, 0.28),
                dark,
                root,
                bevel=0.01,
            )

    if variant == "inn":
        porch_d = 1.35
        porch_w = width * 0.78
        deck_z = wall_base + 0.10
        add_box(
            f"{variant}_porch_deck_base",
            (0, front_y - porch_d * 0.5, deck_z - 0.08),
            (porch_w, porch_d, 0.16),
            dark,
            root,
            bevel=0.02 if detail else 0.0,
        )
        if detail:
            add_plank_field(
                f"{variant}_porch_planks",
                (0, front_y - porch_d * 0.5, deck_z + 0.04),
                porch_w - 0.08,
                porch_d - 0.06,
                0.07,
                (timber,),
                root,
                count=7,
                axis="x",
                seed=seed + 29,
                bevel=0.01,
            )
        add_box(
            f"{variant}_porch_roof",
            (0, front_y - porch_d * 0.48, wall_base + 2.28),
            (porch_w + 0.12, porch_d + 0.12, 0.12),
            roof,
            root,
            rotation=(0.16, 0, 0),
            bevel=0.012 if detail else 0.0,
        )
        for p_idx, px in enumerate((-porch_w * 0.38, porch_w * 0.38)):
            add_box(
                f"{variant}_porch_post_{p_idx}",
                (px, front_y - porch_d + 0.16, deck_z + 1.08),
                (0.20, 0.20, 2.16),
                dark,
                root,
                bevel=0.014 if detail else 0.008,
            )
        add_box(
            f"{variant}_inn_sign",
            (width * 0.16, front_y - 0.28, wall_base + 2.42),
            (0.82, 0.08, 0.46),
            accent,
            root,
            bevel=0.01 if detail else 0.0,
        )
        add_box(
            f"{variant}_inn_sign_frame",
            (width * 0.16, front_y - 0.26, wall_base + 2.42),
            (0.90, 0.05, 0.54),
            dark,
            root,
            bevel=0.008 if detail else 0.0,
        )

    if variant == "market-hall":
        awning_y = front_y - 0.62
        add_box(
            f"{variant}_awning_frame",
            (0, awning_y, wall_base + wall_height * 0.78),
            (width * 0.94, 1.22, 0.08),
            dark,
            root,
            rotation=(0.16, 0, 0),
            bevel=0.012 if detail else 0.0,
        )
        add_box(
            f"{variant}_awning",
            (0, awning_y - 0.02, wall_base + wall_height * 0.76),
            (width * 0.90, 1.12, 0.07),
            accent,
            root,
            rotation=(0.18, 0, 0),
            bevel=0.01 if detail else 0.0,
        )
        for p_idx, px in enumerate((-width * 0.38, 0.0, width * 0.38)):
            add_box(
                f"{variant}_arcade_post_{p_idx}",
                (px, front_y - 0.48, wall_base + 1.12),
                (0.22, 0.22, 2.24),
                dark,
                root,
                bevel=0.014 if detail else 0.008,
            )
        if detail:
            add_plank_field(
                f"{variant}_stall_counter",
                (0, front_y - 0.32, wall_base + 0.58),
                width * 0.72,
                0.46,
                0.14,
                (timber, dark),
                root,
                count=6,
                axis="x",
                seed=seed + 43,
                bevel=0.012,
            )

    if is_barn:
        lean_x = width * 0.5 + 0.62
        for p_idx, py in enumerate((-depth * 0.22, depth * 0.22)):
            add_box(
                f"{variant}_lean_post_{p_idx}",
                (lean_x + 0.38, py, wall_base + 0.82),
                (0.18, 0.18, 1.64),
                dark,
                root,
                bevel=0.012 if detail else 0.0,
            )
        add_box(
            f"{variant}_lean_roof",
            (lean_x, 0.04, wall_base + 1.72),
            (1.36, depth * 0.72, 0.12),
            roof,
            root,
            rotation=(0, 0.22, 0),
            bevel=0.012 if detail else 0.0,
        )
        add_box(
            f"{variant}_loft_door",
            (0, depth * 0.5 + 0.03, wall_base + wall_height * 0.72),
            (1.12, 0.08, 0.96),
            dark,
            root,
            bevel=0.01 if detail else 0.0,
        )

