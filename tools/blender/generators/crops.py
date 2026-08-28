"""Distinct deterministic starter-crop stage generators for the farming gold slice."""

from __future__ import annotations

import math

import bpy
from mathutils import Vector

from common.geometry import add_beam, add_tapered_beam, apply_vertex_values, seeded_rng
from common.materials import get_or_create_material


GOLDEN_ANGLE = math.pi * (3.0 - math.sqrt(5.0))


def _add_custom_mesh(
    name: str,
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    token: str,
    root,
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(get_or_create_material(token))
    obj.parent = root
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
    _add_custom_mesh(name, vertices, faces, token, root)


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
    add_tapered_beam(
        f"{name}_lower",
        base,
        middle,
        radius_start,
        (radius_start + radius_end) * 0.52,
        token,
        root,
        vertices=5,
    )
    add_tapered_beam(
        f"{name}_upper",
        middle,
        tip,
        (radius_start + radius_end) * 0.52,
        radius_end,
        token,
        root,
        vertices=5,
    )
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
    equator_z = cz - radius * 0.06
    vertices = [(cx, cy, cz + radius * flatten * 0.90)]
    for index in range(6):
        angle = rotation + index * math.tau / 6
        ring_radius = radius * (0.94 if index % 2 == 0 else 1.04)
        vertices.append(
            (
                cx + math.cos(angle) * ring_radius,
                cy + math.sin(angle) * ring_radius,
                equator_z,
            )
        )
    vertices.append((cx, cy, cz - radius * flatten * 0.76))
    faces = []
    for index in range(6):
        nxt = 1 + (index + 1) % 6
        faces.append((0, 1 + index, nxt))
        faces.append((7, nxt, 1 + index))
    _add_custom_mesh(f"{name}_body", vertices, faces, fruit_token, root)

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
    for petal in range(petals):
        angle = rotation + petal * math.tau / petals
        direction = (math.cos(angle), math.sin(angle))
        side = (-direction[1], direction[0])
        start = len(vertices)
        vertices.extend(
            (
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
        )
        faces.extend(
            (
                (start, start + 1, start + 2),
                (start, start + 2, start + 3),
                (start, start + 2, start + 1),
                (start, start + 3, start + 2),
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
        for index in range(7):
            angle = index * GOLDEN_ANGLE + rng.uniform(-0.12, 0.12)
            radius = 0.06 + 0.16 * ((index + 1) / 7.0)
            grain_dir = angle + 0.18
            center = (
                math.cos(angle) * radius,
                math.sin(angle) * radius,
                0.028 + (index % 3) * 0.008,
            )
            axis = Vector((math.cos(grain_dir) * 0.034, math.sin(grain_dir) * 0.034, 0.008))
            _add_octahedron(
                f"wheat_seed_{index:02d}",
                (center[0] + axis.x, center[1] + axis.y, center[2] + axis.z),
                (0.036, 0.016, 0.022),
                stalk_token,
                root,
                rotation=grain_dir,
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


def tomato_crop(spec: dict, root) -> None:
    """Author fruit-bearing tomato stages whose posture remains distinct without color."""
    rng = seeded_rng(spec["seed"])
    stage = spec["parameters"]["stage"]
    tokens = spec["palette"]
    leaf_token = tokens[0]
    stem_token = tokens[1] if len(tokens) > 1 else leaf_token
    fruit_token = tokens[2] if len(tokens) > 2 else stem_token
    accent_token = tokens[3] if len(tokens) > 3 else fruit_token

    if stage == "seeded":
        for index in range(6):
            angle = index * GOLDEN_ANGLE + rng.uniform(-0.14, 0.14)
            radius = 0.05 + index * 0.032
            _add_octahedron(
                f"tomato_seed_{index:02d}",
                (math.cos(angle) * radius, math.sin(angle) * radius, 0.032 + (index % 2) * 0.008),
                (0.028, 0.018, 0.022),
                leaf_token,
                root,
                rotation=angle,
            )
        return

    if stage == "sprout":
        for index, angle in enumerate((0.32, 2.42, 4.55)):
            base = (math.cos(angle) * 0.11, math.sin(angle) * 0.11, 0.016)
            tip = (
                base[0] + math.cos(angle) * 0.03,
                base[1] + math.sin(angle) * 0.03,
                0.22 + index * 0.016,
            )
            _add_culm(f"tomato_sprout_{index}", base, tip, 0.016, 0.008, stem_token, root, knee=0.02)
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

    plant_count = spec["parameters"]["plants"]
    stage_height = {"growing": 0.70, "mature": 1.04, "overripe": 0.80, "withered": 0.46}[stage]
    for index in range(plant_count):
        angle = index * GOLDEN_ANGLE + 0.28
        radial = 0.11 + 0.11 * math.sqrt((index + 0.4) / max(1, plant_count))
        base = (math.cos(angle) * radial, math.sin(angle) * radial, 0.016)
        lean = 0.04 if stage == "growing" else 0.07
        if stage == "overripe":
            lean = 0.26 + 0.04 * (index % 2)
        elif stage == "withered":
            lean = 0.36 + 0.05 * (index % 2)
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
            0.022,
            0.009,
            stem_token,
            root,
            knee=0.06 if stage in ("overripe", "withered") else 0.03,
        )

        droop = 0.0 if stage in ("growing", "mature") else 0.48 if stage == "overripe" else 0.82
        leaf_count = 3 if stage == "growing" else 4 if stage == "mature" else 3 if stage == "overripe" else 2
        for leaf_index in range(leaf_count):
            t = 0.32 + leaf_index * (0.52 / max(1, leaf_count - 1))
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
                (0.028, 0.028, 0.022),
                accent_token,
                root,
            )
        elif stage in ("mature", "overripe"):
            fruit_center = (
                base[0] + (tip[0] - base[0]) * 0.52 - math.cos(direction) * 0.06,
                base[1] + (tip[1] - base[1]) * 0.52 - math.sin(direction) * 0.06,
                base[2] + (tip[2] - base[2]) * (0.58 if stage == "mature" else 0.42),
            )
            _add_tomato_fruit_cluster(
                f"tomato_cluster_{index:02d}",
                fruit_center,
                fruit_token,
                accent_token,
                stem_token,
                root,
                fruit_count=3 if index < 3 else 2,
                radius=0.20 if stage == "mature" else 0.22,
                droop=0.0 if stage == "mature" else 0.70,
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
        for leaflet_index in range(leaflets):
            fan = (leaflet_index - (leaflets - 1) * 0.5) * 0.62
            _add_folded_leaf(
                f"{prefix}_leaf_{index:02d}_{leaflet_index:02d}",
                tip,
                spread * (0.42 + 0.04 * (index % 2)),
                spread * 0.22,
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

    if stage == "seeded":
        for index in range(4):
            angle = index * GOLDEN_ANGLE + rng.uniform(-0.10, 0.10)
            radius = 0.07 + index * 0.042
            center = (
                math.cos(angle) * radius,
                math.sin(angle) * radius,
                0.036 + (index % 2) * 0.010,
            )
            _add_octahedron(
                f"potato_seed_piece_{index:02d}",
                center,
                (0.062, 0.044, 0.032),
                leaf_token,
                root,
                rotation=angle,
            )
            _add_octahedron(
                f"potato_seed_eye_{index:02d}",
                (center[0] + 0.018, center[1] - 0.012, center[2] + 0.028),
                (0.010, 0.010, 0.008),
                stem_token,
                root,
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
        "overripe": (0.54, 0.64, 6, 0.50, 2),
        "withered": (0.32, 0.68, 5, 0.84, 2),
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
                0.048,
                flower_token,
                center_token,
                root,
                petals=5,
                rotation=index * 0.31,
            )
    elif stage == "overripe":
        for index, tip in enumerate(tips[:4]):
            _add_octahedron(
                f"potato_seed_pod_{index:02d}",
                (tip[0], tip[1], tip[2] + 0.010),
                (0.018, 0.018, 0.022),
                flower_token,
                root,
            )


def turnip_crop(spec: dict, root) -> None:
    """Purple-shouldered white bulb with upright greens; no farm-tiling soil disc."""
    rng = seeded_rng(spec["seed"])
    tokens = spec["palette"]
    leaf_token = tokens[0]
    purple_token = tokens[1] if len(tokens) > 1 else leaf_token
    white_token = tokens[2] if len(tokens) > 2 else purple_token
    soil_token = tokens[3] if len(tokens) > 3 else white_token
    leaf_count = spec["parameters"]["leafCount"]

    _add_octahedron("turnip_body", (0.0, 0.0, 0.11), (0.15, 0.16, 0.12), white_token, root)
    _add_octahedron("turnip_shoulder", (0.0, 0.02, 0.20), (0.13, 0.13, 0.08), purple_token, root, rotation=0.35)
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
    fruit_radius = 0.16

    for lobe in range(lobes):
        angle = lobe * math.tau / lobes + 0.12
        _add_octahedron(
            f"pumpkin_lobe_{lobe:02d}",
            (math.cos(angle) * fruit_radius * 0.34, math.sin(angle) * fruit_radius * 0.34, 0.13),
            (fruit_radius * 0.58, fruit_radius * 0.54, fruit_radius * 0.78),
            fruit_token,
            root,
            rotation=angle,
        )
    add_tapered_beam("pumpkin_stem", (0.02, 0.0, 0.24), (0.05, 0.03, 0.34), 0.022, 0.012, vine_token, root, vertices=5)

    vine_points = (
        (0.08, 0.04, 0.06),
        (0.22, 0.10, 0.08),
        (0.34, -0.02, 0.07),
        (0.42, -0.14, 0.06),
    )
    for index in range(len(vine_points) - 1):
        add_tapered_beam(
            f"pumpkin_vine_{index:02d}",
            vine_points[index],
            vine_points[index + 1],
            0.016 if index == 0 else 0.012,
            0.012 if index < 2 else 0.008,
            vine_token,
            root,
            vertices=5,
        )

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
