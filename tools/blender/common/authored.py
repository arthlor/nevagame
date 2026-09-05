"""Reusable authored construction systems for Neva's low-poly asset families."""

from __future__ import annotations

import math
import bpy

from mathutils import Euler, Vector

from .geometry import add_beam, add_box, add_cone, add_conforming_shell, add_limb_tube, add_lofted_form, add_tri_prism, apply_vertex_values, graft_limb, seeded_rng
from .materials import get_or_create_material


def add_masonry_courses(
    prefix,
    center,
    width,
    depth,
    height,
    tokens,
    parent,
    *,
    courses,
    blocks_per_long_side,
    seed,
    block_depth=0.20,
    bevel=0.025,
):
    """Build a readable perimeter of staggered stone blocks around a box mass."""
    rng = seeded_rng(seed)
    cx, cy, cz = center
    course_height = height / courses
    short_blocks = max(3, round(blocks_per_long_side * depth / max(width, 0.001)))
    for course in range(courses):
        z = cz - height * 0.5 + course_height * (course + 0.5)
        for face, axis, span, count, fixed in (
            ("front", "x", width, blocks_per_long_side, cy - depth * 0.5 - block_depth * 0.35),
            ("back", "x", width, blocks_per_long_side, cy + depth * 0.5 + block_depth * 0.35),
            ("left", "y", depth, short_blocks, cx - width * 0.5 - block_depth * 0.35),
            ("right", "y", depth, short_blocks, cx + width * 0.5 + block_depth * 0.35),
        ):
            block_span = span / count
            offset = (block_span * 0.5 if course % 2 else 0.0)
            for index in range(count):
                along = -span * 0.5 + block_span * (index + 0.5) + offset
                if along > span * 0.5 - block_span * 0.25:
                    along -= span
                jitter = rng.uniform(-0.025, 0.025)
                token = tokens[(course // 2 + index // 3) % len(tokens)]
                if axis == "x":
                    location = (cx + along, fixed, z + jitter)
                    dimensions = (block_span * 0.90, block_depth, course_height * 0.86)
                    rotation = (0, rng.uniform(-0.012, 0.012), rng.uniform(-0.018, 0.018))
                else:
                    location = (fixed, cy + along, z + jitter)
                    dimensions = (block_depth, block_span * 0.90, course_height * 0.86)
                    rotation = (rng.uniform(-0.012, 0.012), 0, rng.uniform(-0.018, 0.018))
                add_box(
                    f"{prefix}_{face}_{course:02d}_{index:02d}",
                    location,
                    dimensions,
                    token,
                    parent,
                    rotation=rotation,
                    bevel=bevel,
                )


def add_cylindrical_masonry(
    prefix,
    base_z,
    height,
    radius_bottom,
    radius_top,
    tokens,
    parent,
    *,
    courses,
    blocks_per_course,
    seed,
    block_depth=0.22,
):
    """Wrap tapered towers in staggered, tangential low-poly masonry courses."""
    rng = seeded_rng(seed)
    course_height = height / courses
    for course in range(courses):
        progress = (course + 0.5) / courses
        radius = radius_bottom + (radius_top - radius_bottom) * progress
        angle_offset = (math.pi / blocks_per_course) if course % 2 else 0.0
        for index in range(blocks_per_course):
            angle = index * math.tau / blocks_per_course + angle_offset
            tangent_width = math.tau * radius / blocks_per_course * 0.88
            token = tokens[course % len(tokens)]
            add_box(
                f"{prefix}_{course:02d}_{index:02d}",
                (
                    math.cos(angle) * (radius + block_depth * 0.22),
                    math.sin(angle) * (radius + block_depth * 0.22),
                    base_z + course_height * (course + 0.5) + rng.uniform(-0.018, 0.018),
                ),
                (tangent_width, block_depth, course_height * 0.82),
                token,
                parent,
                rotation=(0, 0, angle + math.pi * 0.5),
                bevel=min(0.028, course_height * 0.08),
            )


def add_shingle_rows(
    prefix,
    width,
    depth,
    wall_top,
    pitch_deg,
    tokens,
    parent,
    *,
    rows,
    columns,
    seed,
):
    """Layer broad, readable roof shingles without micro-tile noise."""
    rng = seeded_rng(seed)
    pitch = math.radians(pitch_deg)
    half_width = width * 0.55
    slope = half_width / math.cos(pitch)
    row_length = slope / rows
    tile_depth = (depth + 0.72) / columns
    for side in (-1, 1):
        for row in range(rows):
            distance = row_length * (row + 0.55)
            x = side * (half_width - math.cos(pitch) * distance)
            z = wall_top + math.sin(pitch) * distance + 0.16
            for column in range(columns):
                y = -depth * 0.5 - 0.30 + tile_depth * (column + 0.5)
                token = tokens[(row // 3 + column // 4 + (1 if side > 0 else 0)) % len(tokens)]
                add_box(
                    f"{prefix}_{'right' if side > 0 else 'left'}_{row:02d}_{column:02d}",
                    (x, y, z + rng.uniform(-0.012, 0.012)),
                    (row_length * 1.10, tile_depth * 0.90, 0.075),
                    token,
                    parent,
                    rotation=(0, side * pitch, rng.uniform(-0.012, 0.012)),
                    bevel=0.012,
                )


def add_plank_field(
    prefix,
    center,
    width,
    depth,
    thickness,
    tokens,
    parent,
    *,
    count,
    axis="x",
    seed=0,
    bevel=0.012,
):
    """Create individually readable boards with bounded authored offsets."""
    rng = seeded_rng(seed)
    cx, cy, cz = center
    span = width if axis == "x" else depth
    board_span = span / count
    for index in range(count):
        along = -span * 0.5 + board_span * (index + 0.5)
        offset = rng.uniform(-0.018, 0.018)
        token = tokens[index % len(tokens)]
        if axis == "x":
            location = (cx + along, cy + offset, cz + rng.uniform(-0.008, 0.008))
            dimensions = (board_span * 0.91, depth, thickness)
            rotation = (0, rng.uniform(-0.009, 0.009), rng.uniform(-0.012, 0.012))
        else:
            location = (cx + offset, cy + along, cz + rng.uniform(-0.008, 0.008))
            dimensions = (width, board_span * 0.91, thickness)
            rotation = (rng.uniform(-0.009, 0.009), 0, rng.uniform(-0.012, 0.012))
        add_box(f"{prefix}_{index:03d}", location, dimensions, token, parent, rotation=rotation, bevel=bevel)


def add_lattice(prefix, center, width, height, token, parent, *, columns, rows, depth=0.035, rotation=(0, 0, 0)):
    """Build a coarse functional net or cage lattice from crossing members."""
    cx, cy, cz = center
    for index in range(columns + 1):
        x = cx - width * 0.5 + width * index / columns
        add_box(
            f"{prefix}_vertical_{index:02d}", (x, cy, cz),
            (depth, depth, height), token, parent, rotation=rotation, bevel=0.006,
        )
    for index in range(rows + 1):
        z = cz - height * 0.5 + height * index / rows
        add_box(
            f"{prefix}_horizontal_{index:02d}", (cx, cy, z),
            (width, depth, depth), token, parent, rotation=rotation, bevel=0.006,
        )


def add_rope_line(prefix, points, radius, token, parent, *, vertices=6):
    return add_limb_tube(prefix, points, [radius] * len(points), token, parent, sides=vertices)


def grow_branch(surface, start, end, radius, tip_radius, *, token=None):
    """Grow from an outward-facing trunk opening toward an authored branch tip."""
    start, end = Vector(start), Vector(end)
    bpy.context.view_layer.update()
    normal_matrix = surface.matrix_world.to_3x3().inverted().transposed()
    candidates = [face for face in surface.data.polygons if len(face.vertices) == 4
                  and (normal_matrix @ face.normal).normalized().dot((end - surface.matrix_world @ face.center).normalized()) > .01]
    opening = min(candidates, key=lambda face: (surface.matrix_world @ face.center - start).length_squared)
    shoulder = surface.matrix_world @ opening.center
    outward = (normal_matrix @ opening.normal).normalized()
    joint = shoulder + outward * radius * 1.5
    bend = joint.lerp(end, .45)
    return graft_limb(surface, [opening.index], [joint, bend, end], [radius, radius * .72, tip_radius],
                      token=token, collar_radius=radius)


def add_arch_ring(
    prefix, center_x, y, radius, token_a, token_b, parent, *,
    blocks, block_depth, block_size, start_deg=30, end_deg=150,
):
    for index in range(blocks):
        theta = math.radians(start_deg + index * (end_deg - start_deg) / max(1, blocks - 1))
        x = center_x + math.cos(theta) * radius
        z = math.sin(theta) * radius
        add_box(
            f"{prefix}_{index:02d}", (x, y, z),
            (block_size, block_depth, block_size * 0.72),
            token_a if index % 2 else token_b,
            parent,
            rotation=(0, -theta + math.pi * 0.5, 0),
            bevel=0.025,
        )


def add_root_flare(prefix, center, radius, height, token, parent, *, count, seed):
    rng = seeded_rng(seed)
    cx, cy, cz = center
    for index in range(count):
        angle = index * math.tau / count + rng.uniform(-0.12, 0.12)
        start = (cx + math.cos(angle) * radius * 0.15, cy + math.sin(angle) * radius * 0.15, cz + height)
        end = (cx + math.cos(angle) * radius, cy + math.sin(angle) * radius, cz + 0.04)
        midpoint = (Vector(start) + Vector(end)) * 0.5
        add_tri_prism(
            f"{prefix}_{index:02d}", midpoint,
            (radius * 0.30, radius * 0.52, height * 0.72), token, parent,
            rotation=(math.pi * 0.5, angle, angle),
        )


def add_fasteners(prefix, positions, radius, token, parent, *, depth=0.04):
    for index, position in enumerate(positions):
        start = (position[0], position[1] - depth * 0.5, position[2])
        end = (position[0], position[1] + depth * 0.5, position[2])
        add_beam(f"{prefix}_{index:03d}", start, end, radius, token, parent, vertices=6)


def add_catenary_rope(prefix, start, end, sag, radius, token, parent, *, segments=6, vertices=6):
    """Build a natural hanging catenary/parabolic rope curve under gravity."""
    points = []
    sx, sy, sz = start
    ex, ey, ez = end
    for index in range(segments + 1):
        t = index / segments
        px = sx + (ex - sx) * t
        py = sy + (ey - sy) * t
        pz = sz + (ez - sz) * t - sag * 4.0 * t * (1.0 - t)
        points.append((px, py, pz))
    add_rope_line(prefix, points, radius, token, parent, vertices=vertices)


def add_burlap_sack(prefix, center, dimensions, token, tie_token, parent, *, rotation=(0, 0, 0)):
    """Build a settled, bulged burlap cargo sack resting with realistic weight."""
    cx, cy, cz = center
    width, depth, height = dimensions
    sections = [((cx + dx * width, cy + dy * depth, cz + z * height), width * w, depth * d)
                for dx, dy, z, w, d in ((0, 0, 0, .34, .34), (-.025, .01, .12, .49, .48),
                    (.015, -.015, .42, .50, .49), (.025, 0, .66, .38, .39),
                    (.02, .01, .78, .19, .19), (.02, .01, .90, .28, .25),
                    (.03, .01, .98, .20, .19))]
    body = add_lofted_form(prefix + "_body", sections, token, parent, sides=10)
    tie_sections = [((cx + .02 * width, cy + .01 * depth, cz + z * height), width * .19, depth * .19)
                    for z in (.765, .795)]
    tie = add_conforming_shell(prefix + "_tie", tie_sections, tie_token, parent,
                               arc=(0, math.tau), offset=.003, thickness=min(width, depth) * .018, segments=10)
    rotation_matrix = Euler(rotation).to_matrix()
    origin = Vector(center)
    for obj in (body, tie):
        for vertex in obj.data.vertices:
            world = vertex.co + obj.location
            vertex.co = origin + rotation_matrix @ (world - origin) - obj.location
        obj.data.update()
    return body


def add_profiled_vessel(name, center, profile, thickness, token, parent, *, sides=12):
    """Revolve an authored (height, radius) profile with a real rim and interior."""
    cx, cy, cz = center
    if len(profile) < 2 or thickness <= 0 or any(radius <= thickness for _, radius in profile):
        raise ValueError(f"{name}: vessel needs an open profile wider than its wall")
    outer = [((cx, cy, cz + z), radius, radius) for z, radius in profile]
    inner = [((cx, cy, cz + max(profile[0][0] + thickness, z)), radius - thickness, radius - thickness)
             for z, radius in reversed(profile)]
    return add_lofted_form(name, outer + inner, token, parent, sides=sides)


def add_timber_corner_frame(
    prefix,
    width,
    depth,
    wall_base,
    wall_height,
    token,
    parent,
    *,
    post_w=0.28,
):
    """Readable corner posts, sills, and plates around a plaster or timber wall mass."""
    wall_cz = wall_base + wall_height * 0.5
    for x_idx, px in enumerate((-width * 0.5 + post_w * 0.4, width * 0.5 - post_w * 0.4)):
        for y_idx, py in enumerate((-depth * 0.5 + post_w * 0.4, depth * 0.5 - post_w * 0.4)):
            add_box(
                f"{prefix}_corner_{x_idx}_{y_idx}",
                (px, py, wall_cz),
                (post_w, post_w, wall_height + 0.06),
                token,
                parent,
                bevel=0.025,
            )
    for y_sign, name in ((-1, "front"), (1, "back")):
        add_box(
            f"{prefix}_plate_{name}",
            (0, y_sign * (depth * 0.5 - 0.08), wall_base + wall_height - 0.08),
            (width + 0.14, 0.18, 0.18),
            token,
            parent,
            bevel=0.02,
        )
        add_box(
            f"{prefix}_sill_{name}",
            (0, y_sign * (depth * 0.5 - 0.04), wall_base + wall_height * 0.42),
            (width - 0.10, 0.10, 0.12),
            token,
            parent,
            bevel=0.015,
        )


def add_mullioned_window(
    prefix,
    location,
    width,
    height,
    frame_token,
    glass_token,
    mullion_token,
    parent,
    *,
    shutter_token=None,
):
    """Proud frame, glowing pane, cross mullions, and optional shutters facing -Y."""
    cx, cy, cz = location
    # A frame surrounds an opening. A solid backing slab hid the glass and
    # flattened the recess from the gameplay camera.
    for side in (-1, 1):
        add_box(f"{prefix}_jamb_{side}", (cx + side * (width / 2 + .035), cy, cz),
                (.07, .14, height + .14), frame_token, parent, bevel=.012)
        add_box(f"{prefix}_rail_{side}", (cx, cy, cz + side * (height / 2 + .035)),
                (width, .14, .07), frame_token, parent, bevel=.012)
    add_box(
        f"{prefix}_glass",
        (cx, cy - 0.02, cz),
        (width, 0.04, height),
        glass_token,
        parent,
        bevel=0.01,
    )
    add_box(
        f"{prefix}_mullion_v",
        (cx, cy - 0.05, cz),
        (0.06, 0.05, height),
        mullion_token,
        parent,
        bevel=0.008,
    )
    add_box(
        f"{prefix}_mullion_h",
        (cx, cy - 0.05, cz),
        (width, 0.05, 0.06),
        mullion_token,
        parent,
        bevel=0.008,
    )
    if shutter_token:
        shutter_w = width * 0.48
        add_box(
            f"{prefix}_shutter_l",
            (cx - width * 0.5 - shutter_w * 0.45, cy - 0.01, cz),
            (shutter_w, 0.06, height),
            shutter_token,
            parent,
            bevel=0.012,
        )
        add_box(
            f"{prefix}_shutter_r",
            (cx + width * 0.5 + shutter_w * 0.45, cy - 0.01, cz),
            (shutter_w, 0.06, height),
            shutter_token,
            parent,
            bevel=0.012,
        )


def add_banded_tapered_tower(
    prefix,
    base_z,
    height,
    radius_bottom,
    radius_top,
    tokens,
    parent,
    *,
    bands,
    sides,
):
    """Continuous shaft; palette bands change color without overlapping drums."""
    sections = [((0, 0, base_z + height * i / bands),
                 radius_bottom + (radius_top - radius_bottom) * i / bands,
                 radius_bottom + (radius_top - radius_bottom) * i / bands) for i in range(bands + 1)]
    shaft = add_lofted_form(prefix, sections, tokens[0], parent, sides=sides, normal_mode="planar")
    for token in tokens[1:]:
        shaft.data.materials.append(get_or_create_material(token))
    for polygon in shaft.data.polygons:
        if polygon.index < bands * sides:
            polygon.material_index = (polygon.index // sides) % len(tokens)
    apply_vertex_values(shaft)
    return shaft


def add_mooring_cleat(prefix, center, length, token, parent, *, yaw=0.0):
    """Build a functional low-poly iron T-cleat for mooring line tie-offs."""
    cx, cy, cz = center
    # Base mount
    add_box(
        f"{prefix}_base", (cx, cy, cz + 0.02),
        (length * 0.35, length * 0.22, 0.04), token, parent,
        rotation=(0, 0, yaw), bevel=0.008,
    )
    # Central riser
    add_box(
        f"{prefix}_stem", (cx, cy, cz + 0.065),
        (length * 0.24, length * 0.14, 0.07), token, parent,
        rotation=(0, 0, yaw), bevel=0.008,
    )
    # Horn bar
    add_box(
        f"{prefix}_horn", (cx, cy, cz + 0.11),
        (length, length * 0.12, 0.05), token, parent,
        rotation=(0, 0, yaw), bevel=0.012,
    )
