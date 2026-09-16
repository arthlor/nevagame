"""Reusable authored construction systems for Neva's low-poly asset families."""

from __future__ import annotations

import math
import bpy

from mathutils import Euler, Vector

from .geometry import _build_mesh, add_beam, add_box, add_cone, add_conforming_shell, add_cylinder, add_ico, add_limb_tube, add_lofted_form, add_ring, add_tri_prism, apply_vertex_values, graft_limb, seeded_rng
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


def add_tree_buttresses(prefix, center, radius, height, token, parent, *, count, seed):
    """Low roots enter the bole with a tall shoulder and bury their thin ends."""
    rng = seeded_rng(seed)
    origin = Vector(center)
    for index in range(count):
        angle = index * math.tau / count + rng.uniform(-0.22, 0.22)
        axis = Vector((math.cos(angle), math.sin(angle), 0))
        side = Vector((-axis.y, axis.x, 0))
        reach = radius * rng.uniform(0.68, 1.0)
        width = radius * rng.uniform(0.09, 0.14)
        verts = []
        for distance, half_width, z_low, z_high in (
            (radius * .10, width, .008, height * rng.uniform(.8, 1.05)),
            (reach, width * .22, .004, .022),
        ):
            for sign, z in ((-1, z_low), (1, z_low), (1, z_high), (-1, z_high)):
                verts.append(tuple(axis * distance + side * half_width * sign + Vector((0, 0, z))))
        _build_mesh(f"{prefix}_{index:02d}", origin, verts,
                    [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
                     (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)],
                    token, parent, recalc_normals=True)


def add_canopy_lobe(name, center, scale, token, parent, *, seed, detail=1, rotation=(0, 0, 0)):
    """A clipped, asymmetric leaf mass with broad facets and a broken shoulder.

    The same low-frequency deformation is evaluated at both resolutions, so a
    distant crown keeps its gesture instead of becoming a different random tree.
    """
    rng = seeded_rng(seed)
    phase = rng.uniform(-math.pi, math.pi)
    obj = add_ico(name, center, (1, 1, 1), token, parent,
                  subdivisions=2 if detail else 1, normal_mode="planar")
    basis = Euler(rotation).to_matrix()
    for vertex in obj.data.vertices:
        v = vertex.co.copy()
        angle = math.atan2(v.y, v.x)
        ripple = 1 + .12 * math.sin(3 * angle + phase) * (1 - abs(v.z) * .55)
        ripple += .045 * math.cos(5 * angle - phase + v.z * 2)
        v.x = v.x * ripple + .10 * v.z * v.z
        v.y *= ripple * (1 + .07 * v.x)
        v.z = max(-.78, min(.88, v.z)) + .065 * math.sin(angle * 2 + phase) * (1 - abs(v.z))
        vertex.co = basis @ Vector((v.x * scale[0], v.y * scale[1], v.z * scale[2]))
    obj.data.update()
    apply_vertex_values(obj)
    return obj


def add_conifer_tier(name, center, radius, height, token, parent, *, seed, detail=1):
    """One closed tier with uneven sweeping boughs, never a regular cone rim."""
    rng = seeded_rng(seed)
    sides = 24 if detail else 8
    phase = rng.uniform(-math.pi, math.pi)
    verts, faces = [], []
    for row, (reach, z) in enumerate(((.20, -.23), (1, -.12), (.38, .40))):
        for index in range(sides):
            angle = phase + index * math.tau / sides
            notch = .79 if index % 2 else 1
            variation = 1 + .10 * math.sin(3 * angle + phase) + .06 * math.cos(5 * angle)
            verts.append((math.cos(angle) * radius * reach * variation * notch,
                          math.sin(angle) * radius * reach * variation * notch,
                          height * (z + (.09 * math.sin(3 * angle + phase) if row == 1 else 0))))
    for row in range(2):
        for index in range(sides):
            a, b = row * sides + index, row * sides + (index + 1) % sides
            faces.extend(((a, b, b + sides), (a, b + sides, a + sides)))
    bottom, top = len(verts), len(verts) + 1
    verts.extend(((0, 0, -height * .24), (radius * .06, 0, height * .66)))
    for index in range(sides):
        nxt = (index + 1) % sides
        faces.extend(((bottom, nxt, index), (top, 2 * sides + index, 2 * sides + nxt)))
    return _build_mesh(name, center, verts, faces, token, parent, recalc_normals=True)


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


def add_stall_timber_frame(prefix, width, depth, wall_base, wall_height, token, parent, *, post_w=0.16, proud=0.02, seed=0):
    """Medieval stall timber language: proud posts, plates, ties, 45deg braces, girts."""
    rng = seeded_rng(seed)
    wall_cz = wall_base + wall_height * 0.5
    for x_idx, px in enumerate((-width * 0.5 + post_w * 0.5 - proud, width * 0.5 - post_w * 0.5 + proud)):
        for y_idx, py in enumerate((-depth * 0.5 + post_w * 0.5 - proud, depth * 0.5 - post_w * 0.5 + proud)):
            add_box(
                f"{prefix}_post_{x_idx}_{y_idx}", (px, py, wall_cz),
                (post_w, post_w, wall_height), token, parent, bevel=0.02,
            )
    for side in (-1, 1):
        add_box(
            f"{prefix}_plate_{'p' if side > 0 else 'n'}",
            (side * (width * 0.5 - post_w * 0.5 + 0.02), 0, wall_base + wall_height - post_w * 0.5),
            (post_w + 0.04, depth + 0.35, post_w), token, parent, bevel=0.018,
        )
        add_box(
            f"{prefix}_tie_{'p' if side > 0 else 'n'}",
            (0, side * (depth * 0.5 - post_w * 0.5 + 0.015), wall_base + wall_height - post_w * 0.5),
            (width + 0.15, post_w + 0.03, post_w), token, parent, bevel=0.018,
        )
    brace_len = math.sqrt(2.0) * 0.40
    for side in (-1, 1):
        for end in (-1, 1):
            add_box(
                f"{prefix}_brace_{'p' if side > 0 else 'n'}_{'p' if end > 0 else 'n'}",
                (side * (width * 0.5 - 0.03), end * (depth * 0.5 - post_w - 0.20), wall_base + wall_height - post_w - 0.20),
                (0.11, 0.11, brace_len), token, parent,
                rotation=(end * math.pi * 0.25, 0, 0), bevel=0.012,
            )
    add_box(
        f"{prefix}_girt_rear", (0, -(depth * 0.5 - 0.03), wall_base + wall_height * 0.45),
        (width - 2.0 * (post_w - proud), 0.10, 0.12), token, parent, bevel=0.012,
    )
    add_box(
        f"{prefix}_girt_side", (-(width * 0.5 - 0.03), 0, wall_base + wall_height * 0.45),
        (0.10, depth - 2.0 * (post_w - proud), 0.12), token, parent, bevel=0.012,
    )
    void = rng.random()
    void = void


def add_stall_tile_field(prefix, width, depth, wall_top, rise, tokens, parent, *, rows=8, columns=9, seed=0):
    """Lapped half-bond cambered plain tiles with timber ridge, stall pitch math."""
    rng = seeded_rng(seed)
    half_span = width * 0.5 + 0.40
    pitch = math.atan2(rise, half_span)
    slope = math.hypot(half_span, rise)
    row_pitch = slope / rows
    tile_len = row_pitch * 1.4
    tile_w = 0.22
    for side in (-1, 1):
        for row in range(rows):
            dist = row_pitch * (row + 0.55)
            x = side * (half_span - math.cos(pitch) * dist)
            z = wall_top + math.sin(pitch) * dist + 0.06
            offset = (tile_w * 0.5) if row % 2 else 0.0
            for col in range(columns):
                y = -depth * 0.5 - 0.30 + (depth + 0.72) / columns * (col + 0.5) + offset * 0.12
                token = tokens[(row + col + (1 if side > 0 else 0)) % len(tokens)]
                add_box(
                    f"{prefix}_{'r' if side > 0 else 'l'}_{row:02d}_{col:02d}",
                    (x, y, z + rng.uniform(-0.008, 0.008)),
                    (row_pitch * 0.42, tile_w * 0.92, tile_len * 0.32),
                    token, parent,
                    rotation=(0, side * pitch, rng.uniform(-0.02, 0.02)), bevel=0.008,
                )
    add_box(
        f"{prefix}_ridge", (0, 0, wall_top + rise + 0.08),
        (0.22, depth + 0.75, 0.20), tokens[0], parent, bevel=0.02,
    )


def add_stall_bullnose_awning(prefix, center_x, rear_y, rear_z, width, run, drop, token_a, token_b, timber_token, parent, *, stripes=7, seed=0):
    """Bullnose striped canopy at 30deg world pitch with V-point valance and posts."""
    rng = seeded_rng(seed)
    stripe_w = width / stripes
    front_y = rear_y + run
    front_z = rear_z - drop
    pitch = math.atan2(drop, run)
    add_box(f"{prefix}_rear_beam", (center_x, rear_y, rear_z), (width + 0.04, 0.08, 0.08), timber_token, parent, bevel=0.012)
    add_box(f"{prefix}_front_beam", (center_x, front_y, front_z), (width + 0.04, 0.09, 0.09), timber_token, parent, bevel=0.012)
    for p_idx, px in enumerate((center_x - width * 0.5 + 0.08, center_x + width * 0.5 - 0.08)):
        add_box(f"{prefix}_post_{p_idx}", (px, front_y - 0.07, front_z * 0.5), (0.14, 0.14, front_z), timber_token, parent, bevel=0.018)
        add_beam(
            f"{prefix}_brace_{p_idx}",
            (px, front_y - 0.03, front_z - 0.35),
            (px + (0.37 if p_idx == 0 else -0.37), front_y - 0.03, front_z - 0.05),
            0.055, timber_token, parent, vertices=4,
        )
    for s in range(stripes):
        token = token_b if s % 2 else token_a
        sx = center_x - width * 0.5 + stripe_w * (s + 0.5)
        sag = 0.10 * math.sin(math.pi * 0.62)
        add_box(
            f"{prefix}_panel_{s:02d}", (sx, rear_y + run * 0.5, rear_z - drop * 0.5 - sag * 0.4),
            (stripe_w * 0.94, run * 1.02, 0.05), token, parent,
            rotation=(pitch + rng.uniform(-0.008, 0.008), 0, 0), bevel=0.008,
        )
        add_box(
            f"{prefix}_valance_{s:02d}", (sx, front_y + 0.04, front_z - 0.085),
            (stripe_w * 0.90, 0.014, 0.17), token, parent, bevel=0.006,
        )
        add_tri_prism(
            f"{prefix}_valance_point_{s:02d}", (sx, front_y + 0.04, front_z - 0.205),
            (stripe_w * 0.90, 0.014, 0.07), token, parent,
            rotation=(0, math.pi, 0),
        )
    for r in range(5):
        rx = center_x - width * 0.48 + width * 0.96 * r / 4
        add_box(
            f"{prefix}_rafter_{r}", (rx, rear_y + run * 0.5, rear_z - drop * 0.5 + 0.06),
            (0.09, 0.09, run + 0.20), timber_token, parent,
            rotation=(pitch, 0, 0), bevel=0.008,
        )


def add_stall_coopered_barrel(prefix, center, radius, height, wood_token, iron_token, parent, *, staves=12, seed=0):
    """Coopered barrel with bulged staves,ON-bulge hoops, and lid."""
    cx, cy, cz = center
    rng = seeded_rng(seed)
    profile = [((cx, cy, cz + height * t), radius * (1.0 + 0.16 * math.sin(t * math.pi)), radius * (1.0 + 0.16 * math.sin(t * math.pi))) for t in (0, 0.18, 0.5, 0.82, 1.0)]
    for index in range(staves):
        angle = index * math.tau / staves + rng.uniform(-0.008, 0.008)
        add_conforming_shell(
            f"{prefix}_stave_{index:02d}", profile, wood_token, parent,
            arc=(angle + 0.006, angle + math.tau / staves - 0.006),
            offset=-radius * 0.055, thickness=radius * 0.055, segments=1,
        )
    for h_idx, v in enumerate((0.10, 0.27, 0.73, 0.90)):
        band_r = radius * (1.0 + 0.16 * math.sin(v * math.pi)) + 0.012
        add_ring(f"{prefix}_hoop_{h_idx}", (cx, cy, cz + height * (v - 0.5)), band_r, 0.022, iron_token, parent, major_segments=16, minor_segments=4)
    add_cylinder(f"{prefix}_lid", (cx, cy, cz + height * 0.5 - 0.03), radius * 0.97, 0.03, wood_token, parent, vertices=16)


def add_stall_arched_doorway(prefix, center, width, height, stone_tokens, wood_token, iron_token, parent, *, voussoirs=11, seed=0):
    """Semicircular stone arch with jambs, plank leaf, straps, and ring pull."""
    cx, cy, cz = center
    arch_r = width * 0.5
    rect_h = height - arch_r
    rng = seeded_rng(seed)
    for index in range(voussoirs):
        theta = math.pi * index / max(1, voussoirs - 1)
        vx = cx + math.cos(theta) * (arch_r + 0.08)
        vz = cz + rect_h + math.sin(theta) * (arch_r + 0.08)
        add_box(
            f"{prefix}_voussoir_{index:02d}", (vx, cy, vz),
            (0.14, 0.18, 0.115), stone_tokens[index % len(stone_tokens)], parent,
            rotation=(0, -theta + math.pi * 0.5, 0), bevel=0.02,
        )
    for j in range(4):
        add_box(f"{prefix}_jamb_l_{j}", (cx - arch_r - 0.08, cy, cz + 0.14 + j * 0.28), (0.17, 0.18, 0.27), stone_tokens[j % len(stone_tokens)], parent, bevel=0.014)
        add_box(f"{prefix}_jamb_r_{j}", (cx + arch_r + 0.08, cy, cz + 0.14 + j * 0.28), (0.17, 0.18, 0.27), stone_tokens[(j + 1) % len(stone_tokens)], parent, bevel=0.014)
    add_box(f"{prefix}_leaf", (cx, cy - 0.01, cz + height * 0.5), (width, 0.05, height), wood_token, parent, bevel=0.01)
    for s_idx, sz in enumerate((height * 0.22, height * 0.68)):
        add_box(f"{prefix}_strap_{s_idx}", (cx + 0.03, cy - 0.045, cz + sz), (width * 0.74, 0.018, 0.04), iron_token, parent, bevel=0.006)
    add_ring(f"{prefix}_pull", (cx + 0.17, cy - 0.06, cz + height * 0.44), 0.038, 0.011, iron_token, parent, major_segments=12, minor_segments=6)
    void = rng.random()
    void = void


def add_stall_trade_sign(prefix, origin, boom_len, board_w, board_h, timber_token, iron_token, board_token, parent):
    """Braced boom, iron straps and chains, octagonal produce board."""
    ox, oy, oz = origin
    add_box(f"{prefix}_post", (ox, oy, oz - 0.125), (0.13, 0.13, 0.55), timber_token, parent, bevel=0.012)
    add_box(f"{prefix}_boom", (ox - boom_len * 0.5 + 0.03, oy, oz), (boom_len, 0.13, 0.13), timber_token, parent, bevel=0.012)
    add_beam(f"{prefix}_brace", (ox - 0.065, oy, oz - 0.065), (ox - 0.40, oy, oz - 0.36), 0.06, timber_token, parent, vertices=4)
    for c_idx, bx in enumerate((ox - 0.42, ox - 0.88)):
        add_box(f"{prefix}_strap_{c_idx}", (bx, oy, oz), (0.035, 0.15, 0.15), iron_token, parent, bevel=0.006)
        add_ring(f"{prefix}_link_a_{c_idx}", (bx, oy, oz - 0.105), 0.03, 0.008, iron_token, parent, major_segments=10, minor_segments=5)
        add_ring(f"{prefix}_link_b_{c_idx}", (bx, oy, oz - 0.175), 0.03, 0.008, iron_token, parent, major_segments=10, minor_segments=5)
    board_cx = ox - 0.65
    add_box(f"{prefix}_board", (board_cx, oy, oz - 0.42), (board_w, 0.05, board_h), board_token, parent, bevel=0.012)


def add_stall_produce_crate(prefix, center, width, height, depth, wood_token, dark_token, parent, *, tilt_deg=21.8, seed=0):
    """Slatted produce crate tilted forward, front edge bearing on counter."""
    cx, cy, cz = center
    rng = seeded_rng(seed)
    tilt = math.radians(tilt_deg)
    add_box(f"{prefix}_floor", (cx, cy, cz), (width, depth, 0.02), wood_token, parent, rotation=(tilt, 0, 0), bevel=0.008)
    for cx_idx, sx in enumerate((-1, 1)):
        for cz_idx, sz in enumerate((-1, 1)):
            add_box(
                f"{prefix}_corner_{cx_idx}_{cz_idx}", (cx + sx * (width * 0.5 - 0.016), cy + sz * (depth * 0.5 - 0.016), cz + height * 0.5),
                (0.032, 0.032, height), dark_token, parent, rotation=(tilt, 0, 0), bevel=0.008,
            )
    for tier in range(2):
        sy = cz + 0.02 + 0.028 + tier * 0.066
        add_box(f"{prefix}_slat_f_{tier}", (cx, cy + depth * 0.5 - 0.01, sy), (width, 0.02, 0.056), wood_token, parent, rotation=(tilt, 0, 0), bevel=0.006)
        add_box(f"{prefix}_slat_b_{tier}", (cx, cy - depth * 0.5 + 0.01, sy), (width, 0.02, 0.056), wood_token, parent, rotation=(tilt, 0, 0), bevel=0.006)
        add_box(f"{prefix}_slat_l_{tier}", (cx - width * 0.5 + 0.01, cy, sy), (0.02, depth - 0.04, 0.056), wood_token, parent, rotation=(tilt, 0, 0), bevel=0.006)
        add_box(f"{prefix}_slat_r_{tier}", (cx + width * 0.5 - 0.01, cy, sy), (0.02, depth - 0.04, 0.056), wood_token, parent, rotation=(tilt, 0, 0), bevel=0.006)
    void = rng.random()
    void = void
