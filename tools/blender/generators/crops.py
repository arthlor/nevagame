"""Distinct deterministic starter-crop stage generators for the farming gold slice."""

from __future__ import annotations

import math

import bpy
from mathutils import Vector

from common.geometry import (
    add_beam,
    add_box,
    add_flower_head,
    add_lofted_form,
    add_limb_tube,
    set_surface_normals,
    add_tapered_beam,
    apply_vertex_values,
    seeded_rng,
)
from common.materials import get_or_create_material


GOLDEN_ANGLE = math.pi * (3.0 - math.sqrt(5.0))


def _add_custom_mesh(
    name: str,
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    token: str,
    root,
    *, normal_mode="planar",
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(get_or_create_material(token))
    obj.parent = root
    set_surface_normals(obj, normal_mode)
    apply_vertex_values(obj)
    return obj


def _add_octahedron(
    name: str,
    center: tuple[float, float, float],
    scale: tuple[float, float, float],
    token: str,
    root,
    *,
    rotation: float = 0.0,
) -> None:
    cx, cy, cz = center
    sx, sy, sz = scale
    cos_r, sin_r = math.cos(rotation), math.sin(rotation)

    def rotate(x: float, y: float) -> tuple[float, float]:
        return cx + x * cos_r - y * sin_r, cy + x * sin_r + y * cos_r

    px, py = rotate(sx, 0.0)
    nx, ny = rotate(-sx, 0.0)
    yx, yy = rotate(0.0, sy)
    ynx, yny = rotate(0.0, -sy)
    vertices = [
        (px, py, cz),
        (nx, ny, cz),
        (yx, yy, cz),
        (ynx, yny, cz),
        (cx, cy, cz + sz),
        (cx, cy, cz - sz),
    ]
    faces = [
        (4, 0, 2), (4, 2, 1), (4, 1, 3), (4, 3, 0),
        (5, 2, 0), (5, 1, 2), (5, 3, 1), (5, 0, 3),
    ]
    _add_custom_mesh(name, vertices, faces, token, root)


def _add_folded_leaf(
    name: str,
    base: tuple[float, float, float],
    length: float,
    width: float,
    facing_angle: float,
    token: str,
    root,
    *,
    pitch: float = 0.42,
    droop: float = 0.0,
    cup: float = 0.10,
) -> None:
    """Ovate two-sided leaf with a midrib fold, not a triangular prism wedge."""
    horiz = length * math.cos(pitch)
    height = length * math.sin(pitch) * (1.0 - droop * 0.38)
    lean = length * (0.16 + droop * 0.62)
    along_xy = (math.cos(facing_angle), math.sin(facing_angle))
    width_axis = (-math.sin(facing_angle), math.cos(facing_angle), 0.0)
    stations = (
        base,
        (
            base[0] + along_xy[0] * (horiz * 0.42 + lean * 0.28),
            base[1] + along_xy[1] * (horiz * 0.42 + lean * 0.28),
            base[2] + height * 0.58,
        ),
        (
            base[0] + along_xy[0] * (horiz + lean),
            base[1] + along_xy[1] * (horiz + lean),
            base[2] + height * (1.0 - droop * 0.55),
        ),
    )
    half_widths = (width * 0.11, width * 0.50, width * 0.025)
    half_thickness = min(0.0048, width * 0.045)
    mid_a = Vector(stations[1]) - Vector(stations[0])
    mid_b = Vector(stations[2]) - Vector(stations[1])
    along = (mid_a + mid_b)
    if along.length <= 1e-6:
        along = Vector((along_xy[0], along_xy[1], 0.35))
    along.normalize()
    across = Vector(width_axis)
    fold = across.cross(along)
    if fold.length <= 1e-6:
        fold = Vector((0.0, 0.0, 1.0))
    fold.normalize()
    vertices: list[tuple[float, float, float]] = []
    for face_sign in (-1.0, 1.0):
        for center, half_width, station_index in zip(stations, half_widths, range(3)):
            cup_lift = cup * width * (0.35 if station_index == 1 else 0.12)
            for side_sign in (-1.0, 1.0):
                offset = (
                    Vector(center)
                    + across * (half_width * side_sign)
                    + fold * (cup_lift * abs(side_sign) * 0.55 + half_thickness * face_sign)
                )
                vertices.append(tuple(offset))
    faces = [
        (0, 2, 3), (0, 3, 1), (2, 4, 5), (2, 5, 3),
        (6, 9, 8), (6, 7, 9), (8, 11, 10), (8, 9, 11),
        (0, 6, 8, 2), (2, 8, 10, 4),
        (1, 3, 9, 7), (3, 5, 11, 9),
        (0, 1, 7, 6), (4, 10, 11, 5),
    ]
    _add_custom_mesh(name, vertices, faces, token, root, normal_mode="rounded")


def _add_culm(
    name: str,
    base: tuple[float, float, float],
    tip: tuple[float, float, float],
    radius_start: float,
    radius_end: float,
    token: str,
    root,
    *,
    knee: float = 0.035,
) -> tuple[tuple[float, float, float], tuple[float, float, float]]:
    """Two-joint tapered 5-gon stalk with a slight authored knee."""
    base_vec = Vector(base)
    tip_vec = Vector(tip)
    direction = tip_vec - base_vec
    mid = base_vec.lerp(tip_vec, 0.52)
    horizontal = Vector((direction.x, direction.y, 0.0))
    if horizontal.length > 1e-5:
        side = Vector((-horizontal.y, horizontal.x, 0.0)).normalized()
        mid = mid + side * (direction.length * knee)
    middle = tuple(mid)
    add_limb_tube(name, [base, middle, tip], [radius_start, (radius_start + radius_end) * .52, radius_end], token, root, sides=5)
    return middle, tip


def _add_wheat_head(
    name: str,
    base: tuple[float, float, float],
    tip: tuple[float, float, float],
    head_token: str,
    root,
    *,
    radius: float,
    kernel_count: int,
    awn_count: int,
) -> None:
    """Dense overlapping grain ear so mature wheat reads as a warm-gold head."""
    base_vec = Vector(base)
    tip_vec = Vector(tip)
    direction = tip_vec - base_vec
    length = direction.length
    if length <= 1e-6:
        raise ValueError(f"{name}: wheat head endpoints must be distinct")
    axis = direction.normalized()
    reference = Vector((0.0, 0.0, 1.0)) if abs(axis.z) < 0.82 else Vector((1.0, 0.0, 0.0))
    side_axis = axis.cross(reference).normalized()
    depth_axis = axis.cross(side_axis).normalized()

    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int]] = []
    kernel_centers: list[Vector] = []
    columns = 2
    for kernel_index in range(kernel_count):
        row = kernel_index // columns
        column = kernel_index % columns
        row_count = math.ceil(kernel_count / columns)
        normalized = (row + 0.38) / (row_count + 0.18)
        alternating_side = -1.0 if column == 0 else 1.0
        taper = 1.0 - abs(normalized - 0.52) * 0.62
        center = (
            base_vec
            + direction * normalized
            + side_axis * alternating_side * radius * (0.18 + normalized * 0.10)
            + depth_axis * (0.08 if column == 0 else -0.06) * radius
        )
        kernel_centers.append(center)
        half_length = length / max(3, row_count) * 0.72
        half_width = radius * taper * 0.78
        half_depth = radius * taper * 0.52
        start = len(vertices)
        vertices.extend(
            tuple(point)
            for point in (
                center + axis * half_length,
                center - axis * half_length,
                center + side_axis * half_width,
                center - side_axis * half_width,
                center + depth_axis * half_depth,
                center - depth_axis * half_depth,
            )
        )
        faces.extend(
            (start + a, start + b, start + c)
            for a, b, c in (
                (0, 2, 4), (0, 4, 3), (0, 3, 5), (0, 5, 2),
                (1, 4, 2), (1, 3, 4), (1, 5, 3), (1, 2, 5),
            )
        )

    _add_custom_mesh(f"{name}_grain", vertices, faces, head_token, root)
    add_tapered_beam(
        f"{name}_rachis",
        base,
        tip,
        radius * 0.14,
        radius * 0.06,
        head_token,
        root,
        vertices=4,
    )
    if awn_count <= 0:
        return
    for awn_index in range(awn_count):
        grain_index = min(len(kernel_centers) - 1, max(0, len(kernel_centers) - 1 - awn_index))
        anchor = kernel_centers[grain_index]
        alternating_side = -1.0 if awn_index % 2 == 0 else 1.0
        awn_tip = (
            anchor
            + axis * (length * (0.28 + 0.08 * awn_index))
            + side_axis * alternating_side * radius * (0.70 + 0.12 * awn_index)
            + Vector((0.0, 0.0, max(0.012, length * 0.06)))
        )
        add_beam(
            f"{name}_awn_{awn_index}",
            tuple(anchor),
            tuple(awn_tip),
            0.0038,
            head_token,
            root,
            vertices=3,
        )


def _add_compound_leaf(
    prefix: str,
    origin: tuple[float, float, float],
    facing_angle: float,
    length: float,
    token: str,
    stem_token: str,
    root,
    *,
    leaflet_count: int = 3,
    droop: float = 0.0,
) -> None:
    """Tomato leaflet chain along a short petiole."""
    pitch = 0.38 - droop * 0.22
    horiz = length * math.cos(pitch)
    tip = (
        origin[0] + math.cos(facing_angle) * horiz,
        origin[1] + math.sin(facing_angle) * horiz,
        origin[2] + length * math.sin(pitch) * (1.0 - droop * 0.45),
    )
    add_tapered_beam(
        f"{prefix}_petiole",
        origin,
        tip,
        max(0.007, length * 0.028),
        max(0.004, length * 0.016),
        stem_token,
        root,
        vertices=4,
    )
    for leaflet_index in range(leaflet_count):
        t = 0.34 + leaflet_index * (0.58 / max(1, leaflet_count - 1))
        side = 0.0 if leaflet_index == leaflet_count - 1 else (-1.0 if leaflet_index % 2 == 0 else 1.0)
        attach = (
            origin[0] * (1.0 - t) + tip[0] * t,
            origin[1] * (1.0 - t) + tip[1] * t,
            origin[2] * (1.0 - t) + tip[2] * t,
        )
        leaflet_angle = facing_angle + side * 0.72
        leaflet_length = length * (0.42 if side == 0.0 else 0.34)
        _add_folded_leaf(
            f"{prefix}_leaflet_{leaflet_index:02d}",
            attach,
            leaflet_length,
            leaflet_length * 0.46,
            leaflet_angle,
            token,
            root,
            pitch=0.22 + droop * 0.18,
            droop=droop,
            cup=0.14,
        )


def _add_tomato_fruit(
    name: str,
    center: tuple[float, float, float],
    radius: float,
    fruit_token: str,
    calyx_token: str,
    root,
    *,
    rotation: float = 0.0,
    flatten: float = 0.84,
) -> None:
    """Flattened faceted tomato with a star calyx."""
    cx, cy, cz = center
    # One equator makes a bipyramid, which from a game camera reads as a red
    # umbrella. Two shoulder rings round it into fruit for six more triangles.
    vertices = [(cx, cy, cz + radius * flatten * 0.98)]
    rings = ((radius * 0.62, radius * flatten * 0.52), (radius * 1.0, -radius * 0.10))
    for ring_scale, ring_z in rings:
        for index in range(6):
            angle = rotation + index * math.tau / 6
            ring_radius = ring_scale * (0.94 if index % 2 == 0 else 1.04)
            vertices.append(
                (
                    cx + math.cos(angle) * ring_radius,
                    cy + math.sin(angle) * ring_radius,
                    cz + ring_z,
                )
            )
    vertices.append((cx, cy, cz - radius * flatten * 0.80))
    faces = []
    for index in range(6):
        nxt = (index + 1) % 6
        faces.append((0, 1 + index, 1 + nxt))
        faces.append((1 + index, 7 + index, 7 + nxt, 1 + nxt))
        faces.append((13, 7 + nxt, 7 + index))
    _add_custom_mesh(f"{name}_body", vertices, faces, fruit_token, root, normal_mode="rounded")

    calyx_vertices: list[tuple[float, float, float]] = []
    calyx_faces: list[tuple[int, int, int]] = []
    calyx_z = cz + radius * flatten * 0.86
    for sepal in range(5):
        angle = rotation + sepal * math.tau / 5
        direction = (math.cos(angle), math.sin(angle))
        side = (-direction[1], direction[0])
        start = len(calyx_vertices)
        calyx_vertices.extend(
            (
                (cx, cy, calyx_z + radius * 0.04),
                (
                    cx + direction[0] * radius * 0.22 + side[0] * radius * 0.10,
                    cy + direction[1] * radius * 0.22 + side[1] * radius * 0.10,
                    calyx_z + radius * 0.02,
                ),
                (
                    cx + direction[0] * radius * 0.42,
                    cy + direction[1] * radius * 0.42,
                    calyx_z - radius * 0.02,
                ),
                (
                    cx + direction[0] * radius * 0.22 - side[0] * radius * 0.10,
                    cy + direction[1] * radius * 0.22 - side[1] * radius * 0.10,
                    calyx_z + radius * 0.02,
                ),
            )
        )
        calyx_faces.extend(
            (
                (start, start + 1, start + 2),
                (start, start + 2, start + 3),
                (start, start + 2, start + 1),
                (start, start + 3, start + 2),
            )
        )
    _add_custom_mesh(f"{name}_calyx", calyx_vertices, calyx_faces, calyx_token, root)


def _add_seed_bed(
    name: str, radius: float, height: float, token: str, root, *, sides: int = 10, furrows: int = 3
) -> None:
    """A low tilled mound with furrow ridges for the seeded stage.

    Seeds dropped straight onto the world's grass read as litter. A worked bed
    under them is what says someone planted here, and it is the same cue the
    tilled soil tile already uses elsewhere on the farm.
    """
    add_lofted_form(
        name,
        (
            ((0.0, 0.0, 0.002), radius, radius * 0.94),
            ((0.0, 0.0, height * 0.55), radius * 0.88, radius * 0.82),
            ((0.0, 0.0, height), radius * 0.58, radius * 0.54),
        ),
        token,
        root,
        sides=sides,
    )
    for index in range(furrows):
        offset = (index - (furrows - 1) * 0.5) * radius * 0.46
        add_box(
            f"{name}_furrow_{index}",
            (offset, 0.0, height * 0.92),
            (radius * 0.16, radius * 1.10, height * 0.34),
            token,
            root,
            rotation=(0.0, 0.0, 0.42),
            bevel=height * 0.06,
        )


def _add_star_flower(
    name: str,
    center: tuple[float, float, float],
    radius: float,
    petal_token: str,
    center_token: str,
    root,
    *,
    petals: int = 5,
    rotation: float = 0.0,
) -> None:
    cx, cy, cz = center
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int]] = []
    lift = radius * 0.045
    for petal in range(petals):
        angle = rotation + petal * math.tau / petals
        direction = (math.cos(angle), math.sin(angle))
        side = (-direction[1], direction[0])
        outline = (
            (cx + direction[0] * radius * 0.14, cy + direction[1] * radius * 0.14, cz),
            (
                cx + direction[0] * radius * 0.52 + side[0] * radius * 0.22,
                cy + direction[1] * radius * 0.52 + side[1] * radius * 0.22,
                cz + radius * 0.04,
            ),
            (cx + direction[0] * radius, cy + direction[1] * radius, cz + radius * 0.02),
            (
                cx + direction[0] * radius * 0.52 - side[0] * radius * 0.22,
                cy + direction[1] * radius * 0.52 - side[1] * radius * 0.22,
                cz + radius * 0.04,
            ),
        )
        # Two coplanar copies in opposite windings z-fight and still vanish edge
        # on. A petal with real thickness survives backface culling from below.
        start = len(vertices)
        vertices.extend((x, y, z + lift) for x, y, z in outline)
        vertices.extend((x, y, z - lift) for x, y, z in outline)
        faces.extend(
            (
                (start, start + 1, start + 2),
                (start, start + 2, start + 3),
                (start + 4, start + 6, start + 5),
                (start + 4, start + 7, start + 6),
                (start, start + 4, start + 5, start + 1),
                (start + 1, start + 5, start + 6, start + 2),
                (start + 2, start + 6, start + 7, start + 3),
                (start + 3, start + 7, start + 4, start),
            )
        )

    _add_custom_mesh(f"{name}_petals", vertices, faces, petal_token, root)
    _add_octahedron(
        f"{name}_center",
        (cx, cy, cz + radius * 0.06),
        (radius * 0.22, radius * 0.22, radius * 0.16),
        center_token,
        root,
    )


def _add_tomato_fruit_cluster(
    prefix: str,
    center: tuple[float, float, float],
    fruit_token: str,
    accent_token: str,
    stem_token: str,
    root,
    *,
    fruit_count: int,
    radius: float,
    droop: float = 0.0,
) -> None:
    cluster_top = (center[0], center[1], center[2] + radius * 0.78)
    add_tapered_beam(
        f"{prefix}_peduncle",
        cluster_top,
        center,
        max(0.010, radius * 0.10),
        max(0.006, radius * 0.06),
        stem_token,
        root,
        vertices=5,
    )
    for index in range(fruit_count):
        angle = index * GOLDEN_ANGLE + 0.38
        spread = radius * (0.40 + 0.10 * (index % 2))
        fruit_center = (
            center[0] + math.cos(angle) * spread,
            center[1] + math.sin(angle) * spread,
            center[2] - droop * radius * (0.28 + 0.12 * index) - (index % 2) * radius * 0.16,
        )
        token = accent_token if index % 2 == 1 else fruit_token
        _add_tomato_fruit(
            f"{prefix}_fruit_{index:02d}",
            fruit_center,
            radius * 0.42,
            token,
            stem_token,
            root,
            rotation=angle,
            flatten=0.80 if droop < 0.2 else 0.70,
        )

def _add_garden_stake(
    name: str,
    base: tuple[float, float, float],
    height: float,
    width: float,
    token: str,
    root,
) -> None:
    """Faceted wooden garden stake with an angled chisel top."""
    bx, by, bz = base
    top_z = bz + height
    hw = width * 0.5
    thw = width * 0.38
    vertices = [
        (bx - hw, by - hw, bz),
        (bx + hw, by - hw, bz),
        (bx + hw, by + hw, bz),
        (bx - hw, by + hw, bz),
        (bx - thw, by - thw, top_z - width * 0.6),
        (bx + thw, by - thw, top_z - width * 0.6),
        (bx + thw, by + thw, top_z - width * 0.6),
        (bx - thw, by + thw, top_z - width * 0.6),
        (bx, by, top_z),
    ]
    faces = [
        (0, 1, 5, 4),
        (1, 2, 6, 5),
        (2, 3, 7, 6),
        (3, 0, 4, 7),
        (4, 5, 8),
        (5, 6, 8),
        (6, 7, 8),
        (7, 4, 8),
        (3, 2, 1, 0),
    ]
    _add_custom_mesh(name, vertices, faces, token, root)


def _add_twine_tie(
    name: str,
    center: tuple[float, float, float],
    radius: float,
    height: float,
    token: str,
    root,
) -> None:
    """Faceted cord or twine collar securing a vine to its stake."""
    cx, cy, cz = center
    add_tapered_beam(
        name,
        (cx, cy, cz),
        (cx, cy, cz + height),
        radius,
        radius * 0.94,
        token,
        root,
        vertices=6,
    )


def _add_carrot_frond(
    prefix: str,
    base: tuple[float, float, float],
    angle: float,
    length: float,
    pitch: float,
    leaf_token: str,
    stem_token: str,
    root,
    *,
    pinnae_pairs: int = 3,
    droop: float = 0.12,
) -> None:
    """Feathery bipinnate carrot frond with arching rachis and faceted leaf segments."""
    bx, by, bz = base
    dir_x = math.cos(angle)
    dir_y = math.sin(angle)

    reach = length * math.cos(pitch)
    rise = length * math.sin(pitch) - droop * length * 0.35
    tip = (bx + dir_x * reach, by + dir_y * reach, max(0.02, bz + rise))

    add_tapered_beam(
        f"{prefix}_rachis",
        base,
        tip,
        0.007,
        0.0025,
        stem_token,
        root,
        vertices=3,
    )

    for pair in range(pinnae_pairs):
        t = 0.32 + 0.58 * (pair / max(1, pinnae_pairs - 1))
        node_x = bx + (tip[0] - bx) * t
        node_y = by + (tip[1] - by) * t
        node_z = bz + (tip[2] - bz) * t
        pinna_len = length * (0.28 - 0.05 * pair)
        pinna_w = pinna_len * 0.42

        for side, side_mult in (("L", 1.0), ("R", -1.0)):
            pinna_angle = angle + side_mult * 0.78
            _add_folded_leaf(
                f"{prefix}_p_{pair}_{side}",
                (node_x, node_y, node_z),
                pinna_len,
                pinna_w,
                pinna_angle,
                leaf_token,
                root,
                pitch=0.22,
                droop=droop * 0.5,
                cup=0.08,
            )

    _add_folded_leaf(
        f"{prefix}_term",
        tip,
        length * 0.22,
        length * 0.10,
        angle,
        leaf_token,
        root,
        pitch=0.15,
        droop=droop * 0.8,
        cup=0.06,
    )


def _add_carrot_crown(
    name: str,
    center: tuple[float, float, float],
    radius: float,
    height: float,
    orange_token: str,
    accent_token: str,
    root,
) -> None:
    """Tapered conical root shoulder protruding above soil level."""
    cx, cy, cz = center
    add_tapered_beam(
        f"{name}_root",
        (cx, cy, cz - 0.02),
        (cx, cy, cz + height),
        radius,
        radius * 0.70,
        orange_token,
        root,
        vertices=6,
    )
    add_tapered_beam(
        f"{name}_neck",
        (cx, cy, cz + height * 0.85),
        (cx, cy, cz + height * 1.05),
        radius * 0.55,
        radius * 0.30,
        accent_token,
        root,
        vertices=5,
    )


def _add_carrot_umbel(
    name: str,
    stem_base: tuple[float, float, float],
    height: float,
    radius: float,
    flower_token: str,
    center_token: str,
    stem_token: str,
    root,
) -> None:
    """Queen Anne's lace umbel flower: radiating rays, creamy florets, and center dark dot."""
    bx, by, bz = stem_base
    head_z = bz + height
    add_tapered_beam(
        f"{name}_stalk",
        stem_base,
        (bx, by, head_z),
        0.009,
        0.004,
        stem_token,
        root,
        vertices=4,
    )
    rays = 6
    for i in range(rays):
        a = i * math.tau / rays + 0.2
        rx = bx + math.cos(a) * radius * 0.75
        ry = by + math.sin(a) * radius * 0.75
        rz = head_z + 0.02
        add_tapered_beam(
            f"{name}_ray_{i}",
            (bx, by, head_z),
            (rx, ry, rz),
            0.003,
            0.0015,
            stem_token,
            root,
            vertices=3,
        )
        _add_octahedron(
            f"{name}_floret_{i}",
            (rx, ry, rz + 0.008),
            (radius * 0.28, radius * 0.28, 0.012),
            flower_token,
            root,
            rotation=a,
        )
    _add_octahedron(
        f"{name}_center",
        (bx, by, head_z + 0.022),
        (0.012, 0.012, 0.008),
        center_token,
        root,
    )


def _add_micro_seedling(
    name: str,
    center: tuple[float, float, float],
    shoot_height: float,
    seed_token: str,
    shoot_token: str,
    root,
    *,
    angle: float = 0.0,
    cotyledon: bool = False,
) -> None:
    """Authored germinating seedling: half-buried seed hull and emerging green micro-shoot.

    Zero circular base discs so instances never z-fight with dynamic farm soil.
    """
    cx, cy, cz = center
    _add_octahedron(
        f"{name}_hull",
        (cx, cy, cz + 0.005),
        (0.018, 0.011, 0.009),
        seed_token,
        root,
        rotation=angle,
    )
    if not cotyledon:
        # Monocot coleoptile (grass/cereal spear)
        lean_x = math.cos(angle) * 0.010
        lean_y = math.sin(angle) * 0.010
        add_tapered_beam(
            f"{name}_spear",
            (cx, cy, cz + 0.004),
            (cx + lean_x, cy + lean_y, cz + shoot_height),
            0.0055,
            0.0020,
            shoot_token,
            root,
            vertices=3,
        )
    else:
        # Dicot twin embryonic leaves
        stem_top = (cx, cy, cz + shoot_height * 0.65)
        add_tapered_beam(
            f"{name}_stem",
            (cx, cy, cz + 0.004),
            stem_top,
            0.0045,
            0.0025,
            shoot_token,
            root,
            vertices=3,
        )
        leaf_len = shoot_height * 0.55
        leaf_w = shoot_height * 0.40
        _add_folded_leaf(
            f"{name}_cot_0",
            stem_top,
            leaf_len,
            leaf_w,
            angle,
            shoot_token,
            root,
            pitch=0.14,
            droop=0.0,
            cup=0.06,
        )
        _add_folded_leaf(
            f"{name}_cot_1",
            stem_top,
            leaf_len,
            leaf_w,
            angle + math.pi,
            shoot_token,
            root,
            pitch=0.14,
            droop=0.0,
            cup=0.06,
        )


def wheat_crop(spec: dict, root) -> None:
    rng = seeded_rng(spec["seed"])
    stage = spec["parameters"]["stage"]
    tokens = spec["palette"]
    stalk_token = tokens[0]
    head_token = tokens[1] if len(tokens) > 1 else stalk_token
    leaf_token = tokens[2] if len(tokens) > 2 else stalk_token

    # Soil is rendered as one batched, irregular runtime layer. Crop GLBs carry
    # only the authored plant so repeated circular bases can never tile the farm.
    if stage == "seeded":
        seed_token = stalk_token
        shoot_token = head_token if len(tokens) > 1 else stalk_token
        for index in range(6):
            angle = index * GOLDEN_ANGLE + rng.uniform(-0.12, 0.12)
            radius = 0.06 + 0.14 * ((index + 1) / 6.0)
            center = (
                math.cos(angle) * radius,
                math.sin(angle) * radius,
                0.002,
            )
            _add_micro_seedling(
                f"wheat_seeded_{index:02d}",
                center,
                0.045 + (index % 3) * 0.010,
                seed_token,
                shoot_token,
                root,
                angle=angle + 0.18,
                cotyledon=False,
            )
        return

    stalk_count = spec["parameters"]["stalks"]
    stage_height = {
        "sprout": 0.30,
        "growing": 0.78,
        "mature": 1.02,
        "overripe": 0.76,
        "withered": 0.40,
    }[stage]
    stage_spread = {
        "sprout": 0.22,
        "growing": 0.33,
        "mature": 0.36,
        "overripe": 0.40,
        "withered": 0.38,
    }[stage]

    for index in range(stalk_count):
        angle = index * GOLDEN_ANGLE + rng.uniform(-0.10, 0.10)
        normalized_radius = math.sqrt((index + 0.55) / max(1, stalk_count))
        radius = stage_spread * normalized_radius
        base = (math.cos(angle) * radius, math.sin(angle) * radius, 0.018)
        height = stage_height * rng.uniform(0.88, 1.04)

        if stage == "overripe":
            lean = 0.12 + 0.10 * ((index % 4) / 3.0)
        elif stage == "withered":
            lean = 0.18 + 0.12 * ((index % 3) / 2.0)
        else:
            lean = 0.028 + 0.040 * ((index % 5) / 4.0)
        radial_x, radial_y = math.cos(angle), math.sin(angle)
        end = (base[0] + radial_x * lean, base[1] + radial_y * lean, base[2] + height)
        stalk_radius = 0.011 if stage == "sprout" else 0.014 if stage == "growing" else 0.016
        if stage in ("overripe", "withered"):
            stalk_radius *= 0.86
        _add_culm(
            f"wheat_stalk_{index:02d}",
            base,
            end,
            stalk_radius,
            stalk_radius * 0.52,
            stalk_token,
            root,
            knee=0.055 if stage in ("overripe", "withered") else 0.028,
        )

        leaf_count = {
            "sprout": 2,
            "growing": 2 if index < 8 else 1,
            "mature": 1 if index < 10 else 0,
            "overripe": 1 if index < 7 else 0,
            "withered": 1 if index < 4 else 0,
        }[stage]
        for leaf_index in range(leaf_count):
            side = -1.0 if leaf_index == 0 else 1.0
            leaf_angle = angle + side * (0.70 + 0.10 * (index % 2))
            attach_height = height * (0.22 + leaf_index * 0.18)
            attach = (
                base[0] + radial_x * lean * (attach_height / max(height, 1e-4)) * 0.55,
                base[1] + radial_y * lean * (attach_height / max(height, 1e-4)) * 0.55,
                base[2] + attach_height,
            )
            leaf_length = height * (0.42 if stage in ("sprout", "growing") else 0.30)
            _add_folded_leaf(
                f"wheat_leaf_{index:02d}_{leaf_index}",
                attach,
                leaf_length,
                leaf_length * (0.18 if stage == "sprout" else 0.16),
                leaf_angle,
                leaf_token,
                root,
                pitch=0.18 + (0.08 if stage == "sprout" else 0.0),
                droop=0.12 if stage == "overripe" else 0.55 if stage == "withered" else 0.04,
                cup=0.08,
            )

        if stage == "sprout":
            continue

        if stage == "growing":
            if index >= max(7, stalk_count // 2 + 1):
                continue
            head_tip = (
                end[0] + radial_x * 0.02,
                end[1] + radial_y * 0.02,
                end[2] + 0.14,
            )
            _add_wheat_head(
                f"wheat_head_{index:02d}",
                end,
                head_tip,
                head_token,
                root,
                radius=0.046,
                kernel_count=4,
                awn_count=0,
            )
            continue

        if stage == "mature":
            head_tip = (
                end[0] + radial_x * 0.04,
                end[1] + radial_y * 0.04,
                end[2] + 0.30,
            )
            head_radius = 0.068
            kernels = 6
            awns = 2 if index < 6 else 0
        elif stage == "overripe":
            head_tip = (
                end[0] + radial_x * (0.24 + 0.03 * (index % 2)),
                end[1] + radial_y * (0.24 + 0.03 * (index % 2)),
                end[2] + 0.06 - 0.03 * (index % 3),
            )
            head_radius = 0.074
            kernels = 6
            awns = 2 if index < 4 else 0
        else:
            head_tip = (
                end[0] + radial_x * (0.22 + 0.03 * (index % 2)),
                end[1] + radial_y * (0.22 + 0.03 * (index % 2)),
                end[2] - 0.03 - 0.04 * (index % 3),
            )
            head_radius = 0.058
            kernels = 4
            awns = 1 if index < 3 else 0

        _add_wheat_head(
            f"wheat_head_{index:02d}",
            end,
            head_tip,
            head_token,
            root,
            radius=head_radius,
            kernel_count=kernels,
            awn_count=awns,
        )


def _add_barley_head(
    name: str,
    base: tuple[float, float, float],
    tip: tuple[float, float, float],
    head_token: str,
    awn_token: str,
    root,
    *,
    radius: float,
    kernel_count: int,
    awn_length: float,
    droop: float = 0.0,
) -> None:
    """Arching two-row barley spike with long sweeping bristle awns."""
    base_vec = Vector(base)
    tip_vec = Vector(tip)
    direction = tip_vec - base_vec
    length = direction.length
    if length <= 1e-6:
        return
    axis = direction.normalized()
    reference = Vector((0.0, 0.0, 1.0)) if abs(axis.z) < 0.82 else Vector((1.0, 0.0, 0.0))
    side_axis = axis.cross(reference).normalized()
    depth_axis = axis.cross(side_axis).normalized()

    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int]] = []
    awn_anchors: list[tuple[Vector, float]] = []

    columns = 2
    rows = math.ceil(kernel_count / columns)
    for index in range(kernel_count):
        row = index // columns
        col = index % columns
        t = (row + 0.30) / (rows + 0.20)
        side = -1.0 if col == 0 else 1.0
        taper = 1.0 - abs(t - 0.48) * 0.50
        center = (
            base_vec
            + direction * t
            + side_axis * (side * radius * 0.42 * taper)
            + depth_axis * ((0.035 if col == 0 else -0.035) * radius)
        )
        half_len = length / max(3, rows) * 0.65
        half_w = radius * taper * 0.68
        half_d = radius * taper * 0.42
        start = len(vertices)
        vertices.extend(
            tuple(p)
            for p in (
                center + axis * half_len,
                center - axis * half_len,
                center + side_axis * half_w,
                center - side_axis * half_w,
                center + depth_axis * half_d,
                center - depth_axis * half_d,
            )
        )
        faces.extend(
            (start + a, start + b, start + c)
            for a, b, c in (
                (0, 2, 4), (0, 4, 3), (0, 3, 5), (0, 5, 2),
                (1, 4, 2), (1, 3, 4), (1, 5, 3), (1, 2, 5),
            )
        )
        awn_anchors.append((center + axis * (half_len * 0.80), side))

    _add_custom_mesh(f"{name}_spike", vertices, faces, head_token, root)
    add_tapered_beam(
        f"{name}_rachis",
        base,
        tip,
        radius * 0.12,
        radius * 0.05,
        head_token,
        root,
        vertices=4,
    )

    # Distinct sweeping long awns
    for awn_i, (anchor, side) in enumerate(awn_anchors[:5]):
        fan = (awn_i / max(1, min(5, len(awn_anchors)) - 1) - 0.5) * 0.22
        awn_dir = (
            axis * (0.84 - droop * 0.18)
            + side_axis * (side * 0.36 + fan)
            + depth_axis * (0.10 if awn_i % 2 == 0 else -0.10)
            + Vector((0.0, 0.0, 0.16 * (1.0 - droop * 0.65)))
        ).normalized()
        awn_tip = anchor + awn_dir * awn_length
        add_beam(
            f"{name}_awn_{awn_i:02d}",
            tuple(anchor),
            tuple(awn_tip),
            0.0032,
            awn_token,
            root,
            vertices=3,
        )


def barley_crop(spec: dict, root) -> None:
    """Distinct nodding barley with prominent long arching awns ('whispering barley')."""
    rng = seeded_rng(spec["seed"])
    stage = spec["parameters"]["stage"]
    tokens = spec["palette"]
    stalk_token = tokens[0]
    head_token = tokens[1] if len(tokens) > 1 else stalk_token
    awn_token = tokens[2] if len(tokens) > 2 else head_token

    if stage == "seeded":
        seed_token = stalk_token
        shoot_token = head_token if len(tokens) > 1 else stalk_token
        for index in range(6):
            angle = index * GOLDEN_ANGLE + rng.uniform(-0.12, 0.12)
            radius = 0.06 + 0.14 * ((index + 1) / 6.0)
            center = (math.cos(angle) * radius, math.sin(angle) * radius, 0.002)
            _add_micro_seedling(
                f"barley_seeded_{index:02d}",
                center,
                0.042 + (index % 3) * 0.008,
                seed_token,
                shoot_token,
                root,
                angle=angle + 0.15,
                cotyledon=False,
            )
        return

    stalk_count = spec["parameters"].get("stalks", 12)
    stage_height = {
        "sprout": 0.28,
        "growing": 0.70,
        "mature": 0.94,
        "overripe": 0.74,
        "withered": 0.38,
    }[stage]
    stage_spread = {
        "sprout": 0.20,
        "growing": 0.32,
        "mature": 0.35,
        "overripe": 0.38,
        "withered": 0.36,
    }[stage]

    for index in range(stalk_count):
        angle = index * GOLDEN_ANGLE + rng.uniform(-0.10, 0.10)
        norm_r = math.sqrt((index + 0.55) / max(1, stalk_count))
        radius = stage_spread * norm_r
        base = (math.cos(angle) * radius, math.sin(angle) * radius, 0.016)
        height = stage_height * rng.uniform(0.90, 1.05)

        if stage == "mature":
            lean = 0.08 + 0.05 * (index % 3)
        elif stage == "overripe":
            lean = 0.18 + 0.08 * (index % 3)
        elif stage == "withered":
            lean = 0.24 + 0.10 * (index % 3)
        else:
            lean = 0.03 + 0.03 * (index % 3)

        rad_x, rad_y = math.cos(angle), math.sin(angle)
        end = (base[0] + rad_x * lean, base[1] + rad_y * lean, base[2] + height)
        stalk_r = 0.010 if stage == "sprout" else 0.013 if stage == "growing" else 0.015
        if stage in ("overripe", "withered"):
            stalk_r *= 0.86

        _add_culm(
            f"barley_stalk_{index:02d}",
            base,
            end,
            stalk_r,
            stalk_r * 0.50,
            stalk_token,
            root,
            knee=0.06 if stage in ("overripe", "withered") else 0.035,
        )

        leaf_count = 2 if stage in ("sprout", "growing") else 1 if index < 8 else 0
        for leaf_i in range(leaf_count):
            side = -1.0 if leaf_i == 0 else 1.0
            leaf_angle = angle + side * 0.75
            attach_h = height * (0.24 + leaf_i * 0.20)
            attach = (
                base[0] + rad_x * lean * (attach_h / max(height, 1e-4)),
                base[1] + rad_y * lean * (attach_h / max(height, 1e-4)),
                base[2] + attach_h,
            )
            leaf_len = height * 0.38
            _add_folded_leaf(
                f"barley_leaf_{index:02d}_{leaf_i}",
                attach,
                leaf_len,
                leaf_len * 0.15,
                leaf_angle,
                stalk_token if stage == "sprout" else awn_token if stage == "mature" else stalk_token,
                root,
                pitch=0.20,
                droop=0.15 if stage == "overripe" else 0.50 if stage == "withered" else 0.05,
                cup=0.07,
            )

        if stage == "sprout":
            continue

        if stage == "growing":
            if index >= max(6, stalk_count // 2 + 1):
                continue
            head_tip = (end[0] + rad_x * 0.04, end[1] + rad_y * 0.04, end[2] + 0.16)
            _add_barley_head(
                f"barley_head_{index:02d}",
                end,
                head_tip,
                head_token,
                head_token,
                root,
                radius=0.040,
                kernel_count=6,
                awn_length=0.08,
                droop=0.0,
            )
            continue

        droop_val = 0.08 if stage == "mature" else 0.35 if stage == "overripe" else 0.65
        awn_len = 0.18 if stage == "mature" else 0.16 if stage == "overripe" else 0.12
        nod_x = rad_x * (0.08 + droop_val * 0.14)
        nod_y = rad_y * (0.08 + droop_val * 0.14)
        nod_z = 0.22 - droop_val * 0.16
        head_tip = (end[0] + nod_x, end[1] + nod_y, end[2] + nod_z)

        _add_barley_head(
            f"barley_head_{index:02d}",
            end,
            head_tip,
            head_token,
            awn_token,
            root,
            radius=0.052 if stage == "mature" else 0.048,
            kernel_count=6 if stage != "withered" else 4,
            awn_length=awn_len,
            droop=droop_val,
        )


def _add_corn_ear(
    name: str,
    stem_pos: tuple[float, float, float],
    facing_angle: float,
    ear_length: float,
    husk_token: str,
    kernel_token: str,
    silk_token: str,
    root,
    *,
    droop: float = 0.0,
    show_kernels: bool = True,
) -> None:
    """An ear of corn nestled against the stalk at a leaf axil."""
    pitch = 0.55 + droop * 0.65
    along_xy = (math.cos(facing_angle), math.sin(facing_angle))
    base = Vector(stem_pos)
    tip = (
        base.x + along_xy[0] * ear_length * math.cos(pitch),
        base.y + along_xy[1] * ear_length * math.cos(pitch),
        base.z + ear_length * (math.sin(pitch) if droop < 0.4 else -math.sin(pitch) * 0.4),
    )
    ear_axis = (Vector(tip) - base).normalized()
    ear_radius = ear_length * 0.22

    add_tapered_beam(
        f"{name}_husk",
        stem_pos,
        tip,
        ear_radius * 0.55,
        ear_radius * 0.90,
        husk_token,
        root,
        vertices=6,
    )

    if show_kernels:
        cob_base = Vector(tip) - ear_axis * (ear_length * 0.30)
        cob_tip = Vector(tip) + ear_axis * (ear_length * 0.18)
        add_tapered_beam(
            f"{name}_cob",
            tuple(cob_base),
            tuple(cob_tip),
            ear_radius * 0.78,
            ear_radius * 0.45,
            kernel_token,
            root,
            vertices=6,
        )

        silk_tip = cob_tip + ear_axis * (ear_length * 0.22) + Vector((0.0, 0.0, -ear_length * 0.14))
        add_tapered_beam(
            f"{name}_silk",
            tuple(cob_tip),
            tuple(silk_tip),
            ear_radius * 0.42,
            ear_radius * 0.12,
            silk_token,
            root,
            vertices=4,
        )


def _add_corn_tassel(
    name: str,
    top_pos: tuple[float, float, float],
    height: float,
    tassel_token: str,
    root,
    *,
    droop: float = 0.0,
) -> None:
    """Spreading pollen tassel at the summit of the corn stalk."""
    top = Vector(top_pos)
    central_tip = top + Vector((0.0, 0.0, height * (1.0 - droop * 0.2)))
    add_tapered_beam(f"{name}_central", tuple(top), tuple(central_tip), 0.014, 0.004, tassel_token, root, vertices=4)

    for i in range(5):
        angle = i * (math.tau / 5) + 0.2
        radial = height * (0.35 + 0.15 * (i % 2))
        branch_tip = (
            top.x + math.cos(angle) * radial,
            top.y + math.sin(angle) * radial,
            top.z + height * (0.65 - droop * 0.25),
        )
        add_tapered_beam(
            f"{name}_branch_{i}",
            tuple(top + Vector((0, 0, height * 0.15))),
            branch_tip,
            0.009,
            0.003,
            tassel_token,
            root,
            vertices=3,
        )


def corn_crop(spec: dict, root) -> None:
    """Towering sweet corn with jointed stalks, broad ribbon leaves, pollen tassels, and silked ears."""
    rng = seeded_rng(spec["seed"])
    stage = spec["parameters"]["stage"]
    tokens = spec["palette"]
    leaf_token = tokens[0]
    stalk_token = tokens[1] if len(tokens) > 1 else leaf_token
    ear_token = tokens[2] if len(tokens) > 2 else stalk_token
    tassel_token = tokens[3] if len(tokens) > 3 else ear_token

    if stage == "seeded":
        seed_token = leaf_token
        shoot_token = tokens[1] if len(tokens) > 1 else leaf_token
        for index in range(4):
            angle = index * (math.tau / 4) + 0.35
            radius = 0.12 + 0.06 * (index % 2)
            center = (math.cos(angle) * radius, math.sin(angle) * radius, 0.002)
            _add_micro_seedling(
                f"corn_seeded_{index:02d}",
                center,
                0.060 + (index % 2) * 0.012,
                seed_token,
                shoot_token,
                root,
                angle=angle,
                cotyledon=False,
            )
        return

    stalk_count = spec["parameters"].get("stalks", 3)
    stage_height = {
        "sprout": 0.38,
        "growing": 1.35,
        "mature": 2.10,
        "overripe": 1.85,
        "withered": 1.10,
    }[stage]

    for s_idx in range(stalk_count):
        s_angle = s_idx * (math.tau / max(1, stalk_count)) + 0.28
        s_rad = 0.16 if stage != "sprout" else 0.12
        base = (math.cos(s_angle) * s_rad, math.sin(s_angle) * s_rad, 0.016)
        s_height = stage_height * rng.uniform(0.94, 1.04)

        if stage == "overripe":
            lean_mag = 0.15 + 0.05 * (s_idx % 2)
        elif stage == "withered":
            lean_mag = 0.32 + 0.08 * (s_idx % 2)
        else:
            lean_mag = 0.05

        rad_x, rad_y = math.cos(s_angle), math.sin(s_angle)
        top = (base[0] + rad_x * lean_mag, base[1] + rad_y * lean_mag, base[2] + s_height)

        base_r = 0.016 if stage == "sprout" else 0.038 if stage in ("mature", "overripe") else 0.028
        if stage == "withered":
            base_r *= 0.85
        tip_r = base_r * 0.45

        _add_culm(
            f"corn_stalk_{s_idx:02d}",
            base,
            top,
            base_r,
            tip_r,
            stalk_token,
            root,
            knee=0.08 if stage == "withered" else 0.025,
        )

        leaf_count = 3 if stage == "sprout" else 7 if stage in ("mature", "overripe") else 5
        for l_idx in range(leaf_count):
            t = (l_idx + 1) / (leaf_count + 1.2)
            node_pos = (
                base[0] + (top[0] - base[0]) * t,
                base[1] + (top[1] - base[1]) * t,
                base[2] + (top[2] - base[2]) * t,
            )
            l_angle = s_angle + l_idx * GOLDEN_ANGLE
            l_len = (s_height * 0.22) * (1.0 + 0.20 * (1.0 - abs(t - 0.5) * 1.5))
            l_w = l_len * (0.24 if stage != "sprout" else 0.20)
            droop_val = 0.08 if stage == "sprout" else 0.22 if stage in ("growing", "mature") else 0.48 if stage == "overripe" else 0.75
            _add_folded_leaf(
                f"corn_leaf_{s_idx:02d}_{l_idx:02d}",
                node_pos,
                l_len,
                l_w,
                l_angle,
                leaf_token,
                root,
                pitch=0.32 - droop_val * 0.20,
                droop=droop_val,
                cup=0.18,
            )

        if stage == "sprout":
            continue

        if stage in ("growing", "mature", "overripe"):
            tassel_h = 0.28 if stage == "mature" else 0.22 if stage == "overripe" else 0.16
            _add_corn_tassel(
                f"corn_tassel_{s_idx:02d}",
                top,
                tassel_h,
                tassel_token,
                root,
                droop=0.04 if stage == "mature" else 0.28 if stage == "overripe" else 0.0,
            )

        if stage in ("growing", "mature", "overripe"):
            ear_count = 1 if stage == "growing" else 2
            for e_idx in range(ear_count):
                ear_t = 0.42 + e_idx * 0.18
                ear_node = (
                    base[0] + (top[0] - base[0]) * ear_t,
                    base[1] + (top[1] - base[1]) * ear_t,
                    base[2] + (top[2] - base[2]) * ear_t,
                )
                ear_facing = s_angle + 0.6 + e_idx * 2.2
                ear_len = 0.22 if stage == "mature" else 0.20 if stage == "overripe" else 0.14
                _add_corn_ear(
                    f"corn_ear_{s_idx:02d}_{e_idx}",
                    ear_node,
                    ear_facing,
                    ear_len,
                    leaf_token if stage == "growing" else stalk_token if stage == "overripe" else leaf_token,
                    ear_token,
                    tassel_token,
                    root,
                    droop=0.05 if stage == "growing" else 0.18 if stage == "mature" else 0.55,
                    show_kernels=stage in ("mature", "overripe"),
                )


def _add_flax_flower(
    name: str,
    center: tuple[float, float, float],
    petal_token: str,
    center_token: str,
    root,
    *,
    radius: float = 0.045,
    facing_angle: float = 0.0,
) -> None:
    """Delicate 5-petaled sky-blue flax blossom."""
    cx, cy, cz = center
    _add_octahedron(f"{name}_eye", center, (radius * 0.22, radius * 0.22, radius * 0.16), center_token, root)
    vertices: list[tuple[float, float, float]] = [(cx, cy, cz + radius * 0.02)]
    faces: list[tuple[int, int, int]] = []
    for p in range(5):
        angle = facing_angle + p * (math.tau / 5)
        angle_l = angle - 0.26
        angle_r = angle + 0.26
        p_base = len(vertices)
        v_left = (
            cx + math.cos(angle_l) * radius * 0.48,
            cy + math.sin(angle_l) * radius * 0.48,
            cz + radius * 0.05,
        )
        v_tip = (
            cx + math.cos(angle) * radius,
            cy + math.sin(angle) * radius,
            cz + radius * 0.08,
        )
        v_right = (
            cx + math.cos(angle_r) * radius * 0.48,
            cy + math.sin(angle_r) * radius * 0.48,
            cz + radius * 0.05,
        )
        vertices.extend([v_left, v_tip, v_right])
        faces.append((0, p_base, p_base + 1))
        faces.append((0, p_base + 1, p_base + 2))
    _add_custom_mesh(f"{name}_petals", vertices, faces, petal_token, root)


def flax_crop(spec: dict, root) -> None:
    """Slender wiry flax with delicate periwinkle blue blossoms transitioning to golden seed bolls."""
    rng = seeded_rng(spec["seed"])
    stage = spec["parameters"]["stage"]
    tokens = spec["palette"]
    stem_token = tokens[0]
    flower_token = tokens[1] if len(tokens) > 1 else stem_token
    boll_token = tokens[2] if len(tokens) > 2 else flower_token
    accent_token = tokens[3] if len(tokens) > 3 else boll_token

    if stage == "seeded":
        shoot_token = stem_token
        seed_token = tokens[2] if len(tokens) > 2 else stem_token
        for index in range(6):
            angle = index * GOLDEN_ANGLE + rng.uniform(-0.12, 0.12)
            radius = 0.06 + 0.13 * ((index + 1) / 6.0)
            center = (math.cos(angle) * radius, math.sin(angle) * radius, 0.002)
            _add_micro_seedling(
                f"flax_seeded_{index:02d}",
                center,
                0.038 + (index % 2) * 0.008,
                seed_token,
                shoot_token,
                root,
                angle=angle,
                cotyledon=True,
            )
        return

    stem_count = spec["parameters"].get("stems", 18)
    stage_height = {
        "sprout": 0.22,
        "growing": 0.54,
        "mature": 0.82,
        "overripe": 0.74,
        "withered": 0.42,
    }[stage]
    spread = 0.22 if stage == "sprout" else 0.36

    for index in range(stem_count):
        angle = index * GOLDEN_ANGLE + rng.uniform(-0.10, 0.10)
        norm_r = math.sqrt((index + 0.5) / max(1, stem_count))
        base = (math.cos(angle) * spread * norm_r, math.sin(angle) * spread * norm_r, 0.016)
        height = stage_height * rng.uniform(0.91, 1.07)

        lean_dir = angle + 0.25
        lean_dist = 0.03 if stage in ("sprout", "growing") else 0.07 if stage == "mature" else 0.12 if stage == "overripe" else 0.20
        rad_x, rad_y = math.cos(lean_dir), math.sin(lean_dir)
        top = (base[0] + rad_x * lean_dist, base[1] + rad_y * lean_dist, base[2] + height)

        stem_r = 0.007 if stage == "sprout" else 0.009 if stage in ("mature", "overripe") else 0.008
        if stage == "withered":
            stem_r *= 0.85

        _add_culm(
            f"flax_stem_{index:02d}",
            base,
            top,
            stem_r,
            stem_r * 0.40,
            stem_token,
            root,
            knee=0.06 if stage in ("overripe", "withered") else 0.02,
        )

        leaf_num = 2 if stage in ("sprout", "withered") else 3
        for l_i in range(leaf_num):
            along = 0.20 + l_i * (0.55 / max(1, leaf_num - 1))
            l_pos = (
                base[0] + (top[0] - base[0]) * along,
                base[1] + (top[1] - base[1]) * along,
                base[2] + (top[2] - base[2]) * along,
            )
            l_len = 0.12 if stage != "sprout" else 0.08
            _add_folded_leaf(
                f"flax_leaf_{index:02d}_{l_i}",
                l_pos,
                l_len,
                l_len * 0.14,
                angle + l_i * GOLDEN_ANGLE,
                stem_token,
                root,
                pitch=0.25,
                droop=0.10 if stage != "withered" else 0.50,
                cup=0.05,
            )

        if stage in ("sprout", "growing"):
            if stage == "growing" and index % 3 == 0:
                _add_octahedron(
                    f"flax_bud_{index:02d}",
                    top,
                    (0.012, 0.012, 0.016),
                    flower_token,
                    root,
                )
            continue

        if stage == "mature":
            if index % 2 == 0:
                _add_flax_flower(
                    f"flax_flower_{index:02d}",
                    top,
                    flower_token,
                    accent_token,
                    root,
                    radius=0.042,
                    facing_angle=angle,
                )
            else:
                _add_octahedron(
                    f"flax_boll_{index:02d}",
                    top,
                    (0.018, 0.018, 0.022),
                    boll_token,
                    root,
                )
        elif stage == "overripe":
            _add_octahedron(
                f"flax_boll_{index:02d}",
                top,
                (0.022, 0.022, 0.026),
                boll_token,
                root,
            )
            sec_top = (top[0] + rad_x * 0.04, top[1] + rad_y * 0.04, top[2] - 0.04)
            add_beam(f"flax_branch_{index:02d}", top, sec_top, 0.0035, stem_token, root, vertices=3)
            _add_octahedron(
                f"flax_boll_sec_{index:02d}",
                sec_top,
                (0.018, 0.018, 0.020),
                boll_token,
                root,
            )
        elif stage == "withered":
            _add_octahedron(
                f"flax_boll_dry_{index:02d}",
                top,
                (0.014, 0.014, 0.018),
                stem_token,
                root,
            )


def tomato_crop(spec: dict, root) -> None:
    """Author staked fruit-bearing tomato stages whose posture remains distinct without color."""
    rng = seeded_rng(spec["seed"])
    stage = spec["parameters"]["stage"]
    tokens = spec["palette"]
    leaf_token = tokens[0]
    stem_token = tokens[1] if len(tokens) > 1 else leaf_token
    fruit_token = tokens[2] if len(tokens) > 2 else stem_token
    accent_token = tokens[3] if len(tokens) > 3 else fruit_token
    stake_token = tokens[4] if len(tokens) > 4 else (tokens[1] if len(tokens) > 1 else leaf_token)

    if stage == "seeded":
        seed_token = tokens[0]
        shoot_token = tokens[1] if len(tokens) > 1 else seed_token
        for index in range(3):
            angle = index * GOLDEN_ANGLE + rng.uniform(-0.14, 0.14)
            radius = 0.05 + 0.09 * ((index + 1) / 3.0)
            center = (math.cos(angle) * radius, math.sin(angle) * radius, 0.0)
            _add_micro_seedling(
                f"tomato_seedling_{index:02d}",
                center,
                0.038 + 0.010 * (index % 2),
                seed_token,
                shoot_token,
                root,
                angle=angle,
                cotyledon=True,
            )
        return

    if stage == "sprout":
        for index, angle in enumerate((0.32, 2.42, 4.55)):
            base = (math.cos(angle) * 0.08, math.sin(angle) * 0.08, 0.012)
            tip = (
                base[0] + math.cos(angle) * 0.03,
                base[1] + math.sin(angle) * 0.03,
                0.22 + index * 0.018,
            )
            _add_culm(f"tomato_sprout_{index}", base, tip, 0.014, 0.007, stem_token, root, knee=0.02)
            _add_compound_leaf(
                f"tomato_sprout_{index}",
                tip,
                angle + 0.4,
                0.16,
                leaf_token,
                stem_token,
                root,
                leaflet_count=2,
            )
        return

    # Growing, mature, overripe, and withered feature an authentic wooden garden stake
    stake_height = {"growing": 0.88, "mature": 1.16, "overripe": 1.08, "withered": 0.82}[stage]
    _add_garden_stake(
        "tomato_stake",
        (0.0, 0.0, -0.04),
        stake_height,
        0.036 if stage != "withered" else 0.032,
        stake_token,
        root,
    )

    if stage in ("growing", "mature"):
        _add_twine_tie("tomato_tie_0", (0.0, 0.0, 0.32), 0.032, 0.016, stem_token, root)
        if stage == "mature":
            _add_twine_tie("tomato_tie_1", (0.0, 0.0, 0.68), 0.028, 0.016, stem_token, root)

    plant_count = spec["parameters"]["plants"]
    stage_height = {"growing": 0.72, "mature": 1.04, "overripe": 0.82, "withered": 0.52}[stage]
    for index in range(plant_count):
        angle = index * GOLDEN_ANGLE + 0.28
        radial = 0.05 + 0.08 * math.sqrt((index + 0.4) / max(1, plant_count))
        base = (math.cos(angle) * radial, math.sin(angle) * radial, 0.016)
        lean = 0.03 if stage == "growing" else 0.05
        if stage == "overripe":
            lean = 0.22 + 0.04 * (index % 2)
        elif stage == "withered":
            lean = 0.30 + 0.04 * (index % 2)
        direction = angle + (0.34 if index % 2 else -0.22)
        tip = (
            base[0] + math.cos(direction) * lean,
            base[1] + math.sin(direction) * lean,
            stage_height * rng.uniform(0.93, 1.03),
        )
        _add_culm(
            f"tomato_stem_{index:02d}",
            base,
            tip,
            0.020,
            0.008,
            stem_token,
            root,
            knee=0.06 if stage in ("overripe", "withered") else 0.03,
        )

        droop = 0.0 if stage in ("growing", "mature") else 0.45 if stage == "overripe" else 0.80
        leaf_count = 3 if stage == "growing" else 4 if stage == "mature" else 3 if stage == "overripe" else 2
        for leaf_index in range(leaf_count):
            t = 0.30 + leaf_index * (0.54 / max(1, leaf_count - 1))
            attach = (
                base[0] + (tip[0] - base[0]) * t,
                base[1] + (tip[1] - base[1]) * t,
                base[2] + (tip[2] - base[2]) * t,
            )
            leaf_angle = angle + leaf_index * GOLDEN_ANGLE * 0.55 + (0.4 if index % 2 else -0.25)
            _add_compound_leaf(
                f"tomato_leaf_{index:02d}_{leaf_index:02d}",
                attach,
                leaf_angle,
                0.20 if stage == "growing" else 0.24 if stage == "mature" else 0.22,
                leaf_token,
                stem_token,
                root,
                leaflet_count=2,
                droop=droop,
            )

        if stage == "growing":
            _add_star_flower(
                f"tomato_blossom_{index:02d}",
                (tip[0] + math.cos(angle) * 0.05, tip[1] + math.sin(angle) * 0.05, tip[2] + 0.02),
                0.038,
                fruit_token,
                accent_token,
                root,
                petals=5,
                rotation=angle,
            )
        elif stage == "withered":
            _add_octahedron(
                f"tomato_dried_{index:02d}",
                (
                    base[0] + (tip[0] - base[0]) * 0.48,
                    base[1] + (tip[1] - base[1]) * 0.48,
                    base[2] + (tip[2] - base[2]) * 0.42,
                ),
                (0.024, 0.024, 0.018),
                accent_token,
                root,
            )
        elif stage in ("mature", "overripe"):
            fruit_center = (
                base[0] + (tip[0] - base[0]) * 0.52 - math.cos(direction) * 0.06,
                base[1] + (tip[1] - base[1]) * 0.52 - math.sin(direction) * 0.06,
                base[2] + (tip[2] - base[2]) * (0.58 if stage == "mature" else 0.40),
            )
            _add_tomato_fruit_cluster(
                f"tomato_cluster_{index:02d}",
                fruit_center,
                fruit_token,
                accent_token,
                stem_token,
                root,
                fruit_count=3 if index < 2 else 2,
                radius=0.18 if stage == "mature" else 0.20,
                droop=0.0 if stage == "mature" else 0.65,
            )

    if stage == "overripe":
        _add_tomato_fruit(
            "tomato_fallen_00",
            (0.14, -0.10, 0.028),
            0.065,
            fruit_token,
            stem_token,
            root,
            rotation=0.45,
            flatten=0.68,
        )


def _add_potato_crown(
    prefix: str,
    base: tuple[float, float, float],
    leaf_token: str,
    stem_token: str,
    root,
    *,
    height: float,
    spread: float,
    stems: int,
    droop: float,
    leaflets: int,
) -> list[tuple[float, float, float]]:
    tips: list[tuple[float, float, float]] = []
    for index in range(stems):
        angle = index * GOLDEN_ANGLE + 0.18
        lean = spread * (0.22 + 0.52 * droop) * (0.78 + 0.14 * (index % 3))
        tip = (
            base[0] + math.cos(angle) * lean,
            base[1] + math.sin(angle) * lean,
            base[2] + height * (0.88 + 0.08 * (index % 3)) * (1.0 - droop * 0.32),
        )
        _add_culm(
            f"{prefix}_stem_{index:02d}",
            base,
            tip,
            0.016,
            0.007,
            stem_token,
            root,
            knee=0.04 + droop * 0.05,
        )
        for tier in range(3):
            along = 0.42 + 0.28 * tier
            node = (
                base[0] + (tip[0] - base[0]) * along,
                base[1] + (tip[1] - base[1]) * along,
                base[2] + (tip[2] - base[2]) * along,
            )
            for leaflet_index in range(leaflets):
                fan = (leaflet_index - (leaflets - 1) * 0.5) * 0.70 + tier * 0.44
                _add_folded_leaf(
                    f"{prefix}_leaf_{index:02d}_{tier}{leaflet_index:02d}",
                    node,
                    spread * (0.25 + 0.03 * (index % 2)) * (1.0 - 0.14 * tier),
                    spread * 0.15,
                    angle + fan,
                    leaf_token,
                    root,
                    pitch=0.28 - droop * 0.16,
                    droop=droop,
                    cup=0.16,
                )
        tips.append(tip)
    return tips


def potato_crop(spec: dict, root) -> None:
    """Author compact potato foliage with flowering maturity and collapsing senescence."""
    rng = seeded_rng(spec["seed"])
    stage = spec["parameters"]["stage"]
    tokens = spec["palette"]
    leaf_token = tokens[0]
    stem_token = tokens[1] if len(tokens) > 1 else leaf_token
    flower_token = tokens[2] if len(tokens) > 2 else leaf_token
    center_token = tokens[3] if len(tokens) > 3 else flower_token
    tuber_token = tokens[4] if len(tokens) > 4 else (tokens[2] if len(tokens) > 2 else leaf_token)

    if stage == "seeded":
        tuber_color = tokens[0]
        sprout_color = tokens[1] if len(tokens) > 1 else tokens[0]
        for index in range(3):
            angle = index * GOLDEN_ANGLE + 0.25
            radius = 0.08
            cx = math.cos(angle) * radius
            cy = math.sin(angle) * radius
            _add_octahedron(f"potato_seed_tuber_{index}", (cx, cy, 0.024), (0.052, 0.040, 0.026), tuber_color, root, rotation=angle)
            for i, chit_angle in enumerate((0.35, 2.3)):
                sx = cx + math.cos(chit_angle) * 0.016
                sy = cy + math.sin(chit_angle) * 0.016
                add_tapered_beam(
                    f"potato_chit_{index}_{i}",
                    (sx, sy, 0.026),
                    (sx + math.cos(chit_angle) * 0.012, sy + math.sin(chit_angle) * 0.012, 0.065 + i * 0.01),
                    0.008,
                    0.003,
                    sprout_color,
                    root,
                    vertices=4,
                )
        return

    if stage == "sprout":
        _add_potato_crown(
            "potato_sprout",
            (0, 0, 0.016),
            leaf_token,
            stem_token,
            root,
            height=0.24,
            spread=0.20,
            stems=4,
            droop=0.0,
            leaflets=2,
        )
        return

    settings = {
        "growing": (0.50, 0.46, 5, 0.04, 3),
        "mature": (0.66, 0.56, 6, 0.08, 3),
        "overripe": (0.42, 0.68, 6, 0.58, 2),
        "withered": (0.24, 0.68, 5, 0.88, 2),
    }
    height, spread, stems, droop, leaflets = settings[stage]
    tips = _add_potato_crown(
        f"potato_{stage}",
        (0, 0, 0.016),
        leaf_token,
        stem_token,
        root,
        height=height,
        spread=spread,
        stems=stems,
        droop=droop,
        leaflets=leaflets,
    )
    if stage == "growing":
        for index, tip in enumerate(tips[:3]):
            _add_octahedron(
                f"potato_bud_{index:02d}",
                (tip[0], tip[1], tip[2] + 0.018),
                (0.016, 0.016, 0.022),
                flower_token,
                root,
            )
    elif stage == "mature":
        for index, tip in enumerate(tips[:4]):
            _add_star_flower(
                f"potato_flower_{index:02d}",
                (tip[0], tip[1], tip[2] + 0.012),
                0.072,
                flower_token,
                center_token,
                root,
                petals=5,
                rotation=index * 0.31,
            )
        for index in range(4):
            angle = index * GOLDEN_ANGLE + 0.9
            radius = 0.14 + 0.04 * (index % 2)
            _add_octahedron(
                f"potato_tuber_{index:02d}",
                (math.cos(angle) * radius, math.sin(angle) * radius * 0.86, 0.024),
                (0.065, 0.048, 0.030),
                tuber_token,
                root,
                rotation=angle,
            )
    elif stage == "overripe":
        tuber_color = tokens[2] if len(tokens) > 2 else stem_token
        for index in range(5):
            angle = index * GOLDEN_ANGLE + 0.4
            radius = 0.09 + 0.06 * (index % 2)
            _add_octahedron(
                f"potato_tuber_overripe_{index:02d}",
                (math.cos(angle) * radius, math.sin(angle) * radius * 0.9, 0.026),
                (0.072, 0.052, 0.034),
                tuber_color,
                root,
                rotation=angle,
            )
    elif stage == "withered":
        tuber_color = tokens[1] if len(tokens) > 1 else tokens[0]
        for index in range(3):
            angle = index * 2.1 + 0.5
            radius = 0.12
            _add_octahedron(
                f"potato_tuber_withered_{index:02d}",
                (math.cos(angle) * radius, math.sin(angle) * radius, 0.018),
                (0.045, 0.035, 0.020),
                tuber_color,
                root,
                rotation=angle,
            )


def carrot_crop(spec: dict, root) -> None:
    """Author feathery fronded carrot stages with exposed orange root crowns."""
    rng = seeded_rng(spec["seed"])
    stage = spec["parameters"]["stage"]
    tokens = spec["palette"]
    leaf_token = tokens[0]
    stem_token = tokens[1] if len(tokens) > 1 else leaf_token
    orange_token = tokens[2] if len(tokens) > 2 else leaf_token
    accent_token = tokens[3] if len(tokens) > 3 else orange_token
    center_token = tokens[4] if len(tokens) > 4 else accent_token

    if stage == "seeded":
        seed_token = tokens[0]
        shoot_token = tokens[1] if len(tokens) > 1 else seed_token
        for index in range(3):
            angle = index * GOLDEN_ANGLE + rng.uniform(-0.14, 0.14)
            radius = 0.04 + 0.08 * ((index + 1) / 3.0)
            center = (math.cos(angle) * radius, math.sin(angle) * radius, 0.0)
            _add_micro_seedling(
                f"carrot_seedling_{index:02d}",
                center,
                0.034 + 0.008 * (index % 2),
                seed_token,
                shoot_token,
                root,
                angle=angle,
                cotyledon=True,
            )
        return

    if stage == "sprout":
        plant_count = spec["parameters"].get("plants", 3)
        for index in range(plant_count):
            angle = index * (math.tau / max(1, plant_count)) + 0.2
            _add_carrot_frond(
                f"carrot_sprout_{index:02d}",
                (math.cos(angle) * 0.02, math.sin(angle) * 0.02, 0.012),
                angle,
                0.20 + 0.02 * (index % 2),
                0.85,
                leaf_token,
                stem_token,
                root,
                pinnae_pairs=2,
                droop=0.06,
            )
        return

    if stage == "growing":
        frond_count = 6
        for index in range(frond_count):
            angle = index * GOLDEN_ANGLE + 0.15
            radius = 0.022 * ((index % 3) + 1)
            base = (math.cos(angle) * radius, math.sin(angle) * radius, 0.015)
            tier = index % 3
            frond_len = 0.32 - tier * 0.04
            pitch = 0.65 + tier * 0.15
            _add_carrot_frond(
                f"carrot_frond_{index:02d}",
                base,
                angle,
                frond_len,
                pitch,
                leaf_token,
                stem_token,
                root,
                pinnae_pairs=2,
                droop=0.10 + tier * 0.05,
            )
        return

    if stage == "mature":
        _add_carrot_crown(
            "carrot_crown",
            (0.0, 0.0, 0.0),
            0.052,
            0.046,
            orange_token,
            accent_token,
            root,
        )
        frond_count = 8
        for index in range(frond_count):
            angle = index * GOLDEN_ANGLE + 0.18
            tier = index % 3
            pitch = 0.45 + tier * 0.22
            length = 0.40 - tier * 0.05
            _add_carrot_frond(
                f"carrot_frond_{index:02d}",
                (math.cos(angle) * 0.022, math.sin(angle) * 0.022, 0.040),
                angle,
                length,
                pitch,
                leaf_token,
                stem_token,
                root,
                pinnae_pairs=2 if tier == 0 else 3,
                droop=0.12 + tier * 0.08,
            )
        return

    if stage == "overripe":
        flower_token = tokens[3] if len(tokens) > 3 else tokens[0]
        _add_carrot_crown(
            "carrot_crown_overripe",
            (0.0, 0.0, 0.0),
            0.062,
            0.050,
            orange_token,
            leaf_token,
            root,
        )
        _add_carrot_umbel(
            "carrot_umbel",
            (0.0, 0.0, 0.045),
            0.54,
            0.14,
            flower_token,
            center_token,
            stem_token,
            root,
        )
        frond_count = 8
        for index in range(frond_count):
            angle = index * GOLDEN_ANGLE + 0.3
            _add_carrot_frond(
                f"carrot_frond_overripe_{index:02d}",
                (math.cos(angle) * 0.03, math.sin(angle) * 0.03, 0.035),
                angle,
                0.32,
                0.35,
                leaf_token,
                stem_token,
                root,
                pinnae_pairs=2,
                droop=0.35,
            )
        return

    if stage == "withered":
        _add_carrot_crown(
            "carrot_crown_withered",
            (0.0, 0.0, 0.0),
            0.040,
            0.032,
            orange_token,
            stem_token,
            root,
        )
        for index in range(5):
            angle = index * 1.25 + 0.2
            _add_carrot_frond(
                f"carrot_frond_withered_{index:02d}",
                (0.0, 0.0, 0.015),
                angle,
                0.28,
                0.12,
                leaf_token,
                stem_token,
                root,
                pinnae_pairs=2,
                droop=0.65,
            )
        return


def turnip_crop(spec: dict, root) -> None:
    """Purple-shouldered white bulb with upright greens; no farm-tiling soil disc."""
    rng = seeded_rng(spec["seed"])
    tokens = spec["palette"]
    leaf_token = tokens[0]
    purple_token = tokens[1] if len(tokens) > 1 else leaf_token
    white_token = tokens[2] if len(tokens) > 2 else purple_token
    soil_token = tokens[3] if len(tokens) > 3 else white_token
    leaf_count = spec["parameters"]["leafCount"]

    bulb = add_lofted_form("turnip_body", [((0, 0, .015), .035, .035), ((0, 0, .10), .15, .16),
                ((0, .01, .20), .13, .13), ((0, .02, .26), .035, .035)], white_token, root, sides=8)
    bulb.data.materials.append(get_or_create_material(purple_token))
    for face in bulb.data.polygons:
        if face.index >= 16:
            face.material_index = 1
    add_tapered_beam("turnip_taproot", (0.0, 0.0, 0.04), (0.02, -0.03, -0.02), 0.028, 0.008, white_token, root, vertices=5)
    add_tapered_beam("turnip_crown", (0.0, 0.0, 0.24), (0.0, 0.0, 0.30), 0.018, 0.010, leaf_token, root, vertices=5)

    for index in range(leaf_count):
        angle = index * GOLDEN_ANGLE + 0.22
        attach = (math.cos(angle) * 0.04, math.sin(angle) * 0.04, 0.28)
        _add_folded_leaf(
            f"turnip_leaf_{index:02d}",
            attach,
            0.28 + 0.04 * (index % 3),
            0.11 + 0.02 * (index % 2),
            angle,
            leaf_token,
            root,
            pitch=1.05,
            droop=0.12 * (index % 3),
            cup=0.14,
        )

    for index in range(4):
        angle = index * GOLDEN_ANGLE + rng.uniform(-0.2, 0.2)
        radius = 0.16 + 0.06 * (index % 3)
        _add_octahedron(
            f"turnip_crumb_{index:02d}",
            (math.cos(angle) * radius, math.sin(angle) * radius, 0.012),
            (0.022, 0.016, 0.010),
            soil_token,
            root,
            rotation=angle,
        )


def pumpkin_crop(spec: dict, root) -> None:
    """Chunky lobed pumpkin with broad leaves and a short vine."""
    rng = seeded_rng(spec["seed"])
    tokens = spec["palette"]
    leaf_token = tokens[0]
    fruit_token = tokens[1] if len(tokens) > 1 else leaf_token
    vine_token = tokens[2] if len(tokens) > 2 else leaf_token
    soil_token = tokens[3] if len(tokens) > 3 else vine_token
    lobes = spec["parameters"]["lobes"]
    leaf_count = spec["parameters"]["leafCount"]
    fruit_radius = 0.21

    pumpkin = add_lofted_form("pumpkin_body", [((0, 0, .004), .09, .09), ((0, 0, .07), .20, .20),
                ((0, 0, .15), .21, .21), ((0, 0, .23), .12, .12), ((0, 0, .215), .045, .045)], fruit_token, root, sides=lobes * 2)
    for vertex in pumpkin.data.vertices:
        angle = math.atan2(vertex.co.y, vertex.co.x)
        factor = .95 + .05 * math.cos(lobes * angle)
        vertex.co.x *= factor
        vertex.co.y *= factor
    pumpkin.data.update()
    add_tapered_beam("pumpkin_stem", (0.02, 0.0, 0.205), (0.05, 0.03, 0.295), 0.024, 0.013, vine_token, root, vertices=5)

    vine_points = (
        (0.08, 0.04, 0.06),
        (0.22, 0.10, 0.08),
        (0.34, -0.02, 0.07),
        (0.42, -0.14, 0.06),
    )
    add_limb_tube("pumpkin_vine", vine_points, [.016, .012, .012, .008], vine_token, root, sides=5)

    for index in range(leaf_count):
        angle = 0.8 + index * 1.15
        radius = 0.22 + 0.06 * (index % 2)
        attach = (math.cos(angle) * radius, math.sin(angle) * radius * 0.72, 0.05)
        _add_folded_leaf(
            f"pumpkin_leaf_{index:02d}",
            attach,
            0.22 + 0.03 * (index % 2),
            0.18,
            angle + 0.35,
            leaf_token,
            root,
            pitch=0.18,
            droop=0.22,
            cup=0.18,
        )

    for index in range(3):
        angle = index * GOLDEN_ANGLE + rng.uniform(-0.15, 0.15)
        _add_octahedron(
            f"pumpkin_crumb_{index:02d}",
            (math.cos(angle) * 0.28, math.sin(angle) * 0.22, 0.010),
            (0.024, 0.018, 0.009),
            soil_token,
            root,
            rotation=angle,
        )


def sunflower_crop(spec: dict, root) -> None:
    """Warm-dry terrace sunflower with a readable radial head at maturity."""
    rng = seeded_rng(spec["seed"])
    stage = spec["parameters"]["stage"]
    tokens = spec["palette"]
    leaf_token = tokens[0]
    stem_token = tokens[1] if len(tokens) > 1 else leaf_token
    petal_token = tokens[2] if len(tokens) > 2 else stem_token
    center_token = tokens[3] if len(tokens) > 3 else stem_token

    if stage == "seeded":
        seed_token = tokens[3] if len(tokens) > 3 else tokens[1]
        shoot_token = tokens[0]
        for index in range(3):
            angle = index * GOLDEN_ANGLE + rng.uniform(-0.14, 0.14)
            radius = 0.05 + 0.08 * ((index + 1) / 3.0)
            center = (math.cos(angle) * radius, math.sin(angle) * radius, 0.0)
            _add_micro_seedling(
                f"sunflower_seedling_{index:02d}",
                center,
                0.045 + 0.010 * (index % 2),
                seed_token,
                shoot_token,
                root,
                angle=angle,
                cotyledon=True,
            )
        return

    settings = {
        "sprout": (0.28, 7, 0.0),
        "growing": (0.82, 10, 0.02),
        "mature": (1.34, 9, 0.04),
        "overripe": (1.12, 8, 0.34),
        "withered": (0.70, 7, 0.72),
    }
    height, leaf_count, droop = settings[stage]
    plant_count = 3 if stage in ("sprout", "withered") else 5
    for index in range(plant_count):
        angle = index * GOLDEN_ANGLE + 0.32
        base_radius = 0.08 + 0.09 * index
        base = (math.cos(angle) * base_radius, math.sin(angle) * base_radius, 0.016)
        lean = (0.03 + droop * 0.20) * (1 if index % 2 == 0 else -1)
        tip = (
            base[0] + math.cos(angle) * lean,
            base[1] + math.sin(angle) * lean,
            height * rng.uniform(0.92, 1.04) * (1.0 - droop * 0.18),
        )
        _add_culm(
            f"sunflower_stem_{index:02d}", base, tip,
            0.026 if stage in ("mature", "overripe") else 0.018,
            0.012, stem_token, root, knee=0.03 + droop * 0.08,
        )
        for leaf_index in range(leaf_count):
            t = 0.22 + leaf_index * (0.58 / max(1, leaf_count - 1))
            attach = (
                base[0] + (tip[0] - base[0]) * t,
                base[1] + (tip[1] - base[1]) * t,
                base[2] + (tip[2] - base[2]) * t,
            )
            _add_folded_leaf(
                f"sunflower_leaf_{index:02d}_{leaf_index:02d}",
                attach,
                0.20 if stage == "sprout" else 0.30,
                0.11 if stage == "sprout" else 0.18,
                angle + leaf_index * GOLDEN_ANGLE,
                leaf_token,
                root,
                pitch=0.22,
                droop=droop,
                cup=0.18,
            )
        if stage == "growing":
            _add_octahedron(f"sunflower_bud_{index:02d}", tip, (0.07, 0.07, 0.06), leaf_token, root)
        elif stage in ("mature", "overripe", "withered"):
            head_center = (
                tip[0] + math.cos(angle) * (0.04 + droop * 0.12),
                tip[1] + math.sin(angle) * (0.04 + droop * 0.12),
                tip[2] + 0.03 - droop * 0.08,
            )
            # A flat star of petals lying face-up is hidden by its own centre
            # disc from any game camera, which is why the mature crop had no
            # flower at all. Use the nodding head the sunflower stand already
            # gets right.
            head_radius = 0.15 if stage == "mature" else 0.13 if stage == "overripe" else 0.10
            add_flower_head(
                f"sunflower_head_{index:02d}",
                head_center,
                head_radius,
                center_token,
                leaf_token,
                petal_token if stage != "withered" else stem_token,
                root,
                petals=14 if stage == "mature" else 12,
                nod=math.radians(46 + droop * 34),
                yaw=angle,
                petal_reach=1.34 if stage != "withered" else 1.10,
            )


def olive_crop(spec: dict, root) -> None:
    """Compact orchard crop stages distinct from the full environmental olive."""
    stage = spec["parameters"]["stage"]
    tokens = spec["palette"]
    leaf_token = tokens[0]
    wood_token = tokens[1] if len(tokens) > 1 else leaf_token
    fruit_token = tokens[2] if len(tokens) > 2 else leaf_token
    dry_token = tokens[3] if len(tokens) > 3 else wood_token

    if stage == "seeded":
        add_tapered_beam("olive_cutting", (0.0, 0.0, 0.0), (0.012, 0.008, 0.14), 0.012, 0.006, wood_token, root, vertices=4)
        for i, z in enumerate((0.08, 0.13)):
            a = i * 1.57 + 0.2
            _add_folded_leaf(f"olive_cut_leaf_{i}_a", (0.008, 0.005, z), 0.09, 0.038, a, leaf_token, root, pitch=0.32, droop=0.04)
            _add_folded_leaf(f"olive_cut_leaf_{i}_b", (0.008, 0.005, z), 0.09, 0.038, a + math.pi, leaf_token, root, pitch=0.32, droop=0.04)
        return

    settings = {
        "sprout": (0.34, 6, 0.10, 0.0),
        "growing": (0.82, 13, 0.28, 0.0),
        "mature": (1.42, 11, 0.54, 0.0),
        "overripe": (1.30, 10, 0.58, 0.24),
        "withered": (0.92, 11, 0.48, 0.72),
    }
    height, branches, spread, droop = settings[stage]
    trunk_top = (0.04 * droop, -0.02, height * 0.58)
    _add_culm("olive_crop_trunk", (0, 0, 0.016), trunk_top, 0.07, 0.035, wood_token, root, knee=0.06)
    for index in range(branches):
        angle = index * GOLDEN_ANGLE + 0.22
        attach_t = 0.46 + 0.44 * ((index % 3) / 2.0)
        attach = (trunk_top[0] * attach_t, trunk_top[1] * attach_t, trunk_top[2] * attach_t)
        tip = (
            attach[0] + math.cos(angle) * spread * (0.64 + 0.12 * (index % 2)),
            attach[1] + math.sin(angle) * spread * (0.64 + 0.12 * (index % 2)),
            attach[2] + height * (0.22 + 0.04 * (index % 3)) * (1.0 - droop * 0.5),
        )
        add_tapered_beam(f"olive_crop_branch_{index:02d}", attach, tip, 0.025, 0.010, wood_token, root, vertices=5)
        leaf_total = 7 if stage in ("mature", "overripe") else 3 if stage != "withered" else 3
        for leaf_index in range(leaf_total):
            along = 0.42 + 0.52 * (leaf_index / max(1, leaf_total - 1))
            attach_point = (
                attach[0] + (tip[0] - attach[0]) * along,
                attach[1] + (tip[1] - attach[1]) * along,
                attach[2] + (tip[2] - attach[2]) * along,
            )
            _add_folded_leaf(
                f"olive_crop_leaf_{index:02d}_{leaf_index:02d}",
                attach_point,
                0.19,
                0.068,
                angle + (leaf_index - (leaf_total - 1) * 0.5) * 0.58,
                leaf_token if stage != "withered" else dry_token,
                root,
                pitch=0.16,
                droop=droop,
                cup=0.10,
            )
        if stage in ("mature", "overripe"):
            for fruit_index in range(3):
                along = 0.58 + 0.16 * fruit_index
                _add_octahedron(
                    f"olive_crop_fruit_{index:02d}_{fruit_index:02d}",
                    (
                        attach[0] + (tip[0] - attach[0]) * along + math.cos(angle + fruit_index) * 0.028,
                        attach[1] + (tip[1] - attach[1]) * along + math.sin(angle + fruit_index) * 0.028,
                        attach[2] + (tip[2] - attach[2]) * along - 0.038 - 0.012 * fruit_index,
                    ),
                    (0.026, 0.020, 0.032),
                    fruit_token,
                    root,
                    rotation=angle + fruit_index,
                )

    if stage == "overripe":
        for index in range(4):
            angle = index * GOLDEN_ANGLE + 0.5
            radius = 0.25 + 0.10 * (index % 2)
            _add_octahedron(
                f"olive_windfall_{index:02d}",
                (math.cos(angle) * radius, math.sin(angle) * radius, 0.015),
                (0.024, 0.016, 0.018),
                fruit_token,
                root,
                rotation=angle,
            )


def apple_tree_crop(spec: dict, root) -> None:
    """Author cultivated orchard apple tree lifecycle from sapling to fruiting canopy."""
    stage = spec["parameters"]["stage"]
    tokens = spec["palette"]
    leaf_token = tokens[0]
    wood_token = tokens[1] if len(tokens) > 1 else leaf_token
    fruit_token = tokens[2] if len(tokens) > 2 else leaf_token
    accent_token = tokens[3] if len(tokens) > 3 else fruit_token

    if stage == "seeded":
        _add_garden_stake("apple_whip_stake", (0.02, 0.0, 0.0), 0.38, 0.018, wood_token, root)
        add_tapered_beam("apple_whip_stem", (0.0, 0.0, 0.0), (0.015, 0.0, 0.32), 0.012, 0.005, wood_token, root, vertices=4)
        _add_twine_tie("apple_whip_tie", (0.01, 0.0, 0.18), 0.022, 0.010, accent_token, root)
        for i, z in enumerate((0.14, 0.24, 0.32)):
            a = i * 2.1 + 0.3
            _add_folded_leaf(f"apple_whip_leaf_{i}", (0.015, 0.0, z), 0.09, 0.045, a, leaf_token, root, pitch=0.35, droop=0.05, cup=0.08)
        return

    if stage == "sprout":
        _add_garden_stake("apple_sapling_stake", (0.04, 0.0, 0.0), 0.78, 0.024, wood_token, root)
        add_tapered_beam("apple_sapling_trunk", (0.0, 0.0, 0.0), (0.02, 0.0, 0.70), 0.024, 0.012, wood_token, root, vertices=5)
        _add_twine_tie("apple_sapling_tie", (0.025, 0.0, 0.42), 0.032, 0.014, accent_token, root)
        for i in range(4):
            a = i * (math.tau / 4.0) + 0.3
            bx = 0.02 + math.cos(a) * 0.01
            by = math.sin(a) * 0.01
            bz = 0.35 + i * 0.08
            tip = (bx + math.cos(a) * 0.22, by + math.sin(a) * 0.22, bz + 0.18)
            add_tapered_beam(f"apple_sapling_b_{i}", (bx, by, bz), tip, 0.012, 0.005, wood_token, root, vertices=4)
            for li in range(3):
                t = 0.4 + li * 0.28
                node = (bx + (tip[0] - bx) * t, by + (tip[1] - by) * t, bz + (tip[2] - bz) * t)
                _add_folded_leaf(f"apple_sapling_l_{i}_{li}", node, 0.14, 0.065, a + (li - 1) * 0.45, leaf_token, root, pitch=0.25, droop=0.08)
        return

    settings = {
        "growing": (1.45, 0.55, 6, 0.04),
        "mature": (2.15, 0.95, 8, 0.06),
        "overripe": (2.05, 1.00, 8, 0.22),
        "withered": (1.80, 0.85, 7, 0.50),
    }
    height, spread, branches, droop = settings[stage]
    trunk_top = (0.03 * droop, -0.02, height * 0.45)
    _add_culm("apple_tree_trunk", (0, 0, 0.016), trunk_top, 0.09, 0.055, wood_token, root, knee=0.05)

    for index in range(branches):
        angle = index * GOLDEN_ANGLE + 0.2
        attach_t = 0.55 + 0.35 * ((index % 3) / 2.0)
        attach = (trunk_top[0] * attach_t, trunk_top[1] * attach_t, trunk_top[2] * attach_t)
        tip = (
            attach[0] + math.cos(angle) * spread * (0.80 + 0.15 * (index % 2)),
            attach[1] + math.sin(angle) * spread * (0.80 + 0.15 * (index % 2)),
            attach[2] + height * (0.30 + 0.08 * (index % 3)) * (1.0 - droop * 0.4),
        )
        add_tapered_beam(f"apple_branch_{index:02d}", attach, tip, 0.038, 0.014, wood_token, root, vertices=5)

        leaf_count = 5 if stage in ("mature", "overripe") else 4 if stage == "growing" else 2
        for leaf_index in range(leaf_count):
            along = 0.35 + 0.60 * (leaf_index / max(1, leaf_count - 1))
            node = (
                attach[0] + (tip[0] - attach[0]) * along,
                attach[1] + (tip[1] - attach[1]) * along,
                attach[2] + (tip[2] - attach[2]) * along,
            )
            _add_folded_leaf(
                f"apple_leaf_{index:02d}_{leaf_index:02d}",
                node,
                0.22 if stage != "withered" else 0.16,
                0.11 if stage != "withered" else 0.07,
                angle + (leaf_index - (leaf_count - 1) * 0.5) * 0.52,
                leaf_token if stage != "withered" else accent_token,
                root,
                pitch=0.20,
                droop=droop,
                cup=0.12,
            )

        if stage == "growing":
            for blossom_i in range(2):
                along = 0.55 + blossom_i * 0.32
                bnode = (
                    attach[0] + (tip[0] - attach[0]) * along,
                    attach[1] + (tip[1] - attach[1]) * along,
                    attach[2] + (tip[2] - attach[2]) * along + 0.02,
                )
                _add_star_flower(f"apple_blossom_{index:02d}_{blossom_i}", bnode, 0.045, accent_token, fruit_token, root, petals=5, rotation=angle + blossom_i)
        elif stage in ("mature", "overripe"):
            fruit_count = 3 if stage == "mature" else 2
            for fi in range(fruit_count):
                along = 0.48 + fi * 0.22
                fcenter = (
                    attach[0] + (tip[0] - attach[0]) * along + math.cos(angle + fi) * 0.05,
                    attach[1] + (tip[1] - attach[1]) * along + math.sin(angle + fi) * 0.05,
                    attach[2] + (tip[2] - attach[2]) * along - 0.04 - droop * 0.04,
                )
                _add_octahedron(f"apple_fruit_{index:02d}_{fi}", fcenter, (0.044, 0.044, 0.048), fruit_token, root, rotation=angle)

    if stage == "overripe":
        for wi in range(5):
            wa = wi * GOLDEN_ANGLE + 0.4
            wr = 0.42 + 0.35 * (wi % 3)
            wcenter = (math.cos(wa) * wr, math.sin(wa) * wr, 0.026)
            _add_octahedron(f"apple_windfall_{wi:02d}", wcenter, (0.042, 0.042, 0.045), fruit_token, root, rotation=wa)
    elif stage == "withered":
        for wi in range(2):
            wa = wi * 2.4 + 0.3
            _add_octahedron(f"apple_shriveled_{wi:02d}", (math.cos(wa) * 0.45, math.sin(wa) * 0.45, height * 0.55), (0.028, 0.028, 0.032), fruit_token, root)
