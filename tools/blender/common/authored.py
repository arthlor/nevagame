"""Reusable authored construction systems for Neva's low-poly asset families."""

from __future__ import annotations

import math

from mathutils import Vector

from .geometry import add_beam, add_box, add_tri_prism, seeded_rng


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
                token = tokens[(course + index) % len(tokens)]
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
                token = tokens[(row + column + (1 if side > 0 else 0)) % len(tokens)]
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
    for index, (start, end) in enumerate(zip(points, points[1:])):
        add_beam(f"{prefix}_{index:02d}", start, end, radius, token, parent, vertices=vertices)


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
