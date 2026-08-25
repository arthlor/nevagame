"""Distinct deterministic starter-crop stage generators for the farming gold slice."""

from __future__ import annotations

import math

import bpy
from mathutils import Vector

from common.geometry import (
    add_beam,
    add_ico,
    add_tapered_beam,
    add_tri_prism,
    apply_vertex_values,
    seeded_rng,
)
from common.materials import get_or_create_material


GOLDEN_ANGLE = math.pi * (3.0 - math.sqrt(5.0))


def _add_wheat_head(
    name: str,
    base: tuple[float, float, float],
    tip: tuple[float, float, float],
    head_token: str,
    root,
    *,
    radius: float,
    kernel_count: int,
    add_awns: bool,
) -> None:
    """Build a serrated ear from a few broad grain facets, not one toy wedge."""
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
    for kernel_index in range(kernel_count):
        normalized = (kernel_index + 0.62) / (kernel_count + 0.22)
        alternating_side = -1.0 if kernel_index % 2 == 0 else 1.0
        taper = 1.0 - abs(normalized - 0.47) * 0.50
        center = (
            base_vec
            + direction * normalized
            + side_axis * alternating_side * radius * (0.27 + normalized * 0.13)
        )
        kernel_centers.append(center)
        half_length = length / kernel_count * 0.50
        half_width = radius * taper
        half_depth = radius * taper * 0.64
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

    mesh = bpy.data.meshes.new(f"{name}_grain_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    ear = bpy.data.objects.new(f"{name}_grain", mesh)
    bpy.context.collection.objects.link(ear)
    ear.data.materials.append(get_or_create_material(head_token))
    ear.parent = root
    apply_vertex_values(ear)

    add_tapered_beam(
        f"{name}_rachis",
        base,
        tip,
        radius * 0.16,
        radius * 0.08,
        head_token,
        root,
        vertices=4,
    )

    if not add_awns:
        return
    for awn_index in range(2):
        grain_index = min(kernel_count - 1, kernel_count - 2 + awn_index)
        anchor = kernel_centers[grain_index]
        alternating_side = -1.0 if awn_index == 0 else 1.0
        awn_tip = (
            anchor
            + axis * (length * 0.44)
            + side_axis * alternating_side * radius * 0.95
            + Vector((0.0, 0.0, max(0.015, length * 0.08)))
        )
        add_beam(
            f"{name}_awn_{awn_index}",
            tuple(anchor),
            tuple(awn_tip),
            0.0042,
            head_token,
            root,
            vertices=3,
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
        for index in range(6):
            angle = index * GOLDEN_ANGLE + rng.uniform(-0.12, 0.12)
            radius = 0.07 + 0.15 * ((index + 1) / 6.0)
            add_ico(
                f"wheat_seed_{index:02d}",
                (math.cos(angle) * radius, math.sin(angle) * radius, 0.035 + (index % 2) * 0.008),
                (0.052, 0.027, 0.022),
                stalk_token,
                root,
                subdivisions=1,
                rotation=(0.18 + index * 0.03, angle, 0.08),
            )
        return

    stalk_count = spec["parameters"]["stalks"]
    stage_height = {
        "sprout": 0.32,
        "growing": 0.76,
        "mature": 1.00,
        "overripe": 0.78,
        "withered": 0.43,
    }[stage]
    stage_spread = {
        "sprout": 0.23,
        "growing": 0.34,
        "mature": 0.38,
        "overripe": 0.40,
        "withered": 0.38,
    }[stage]

    for index in range(stalk_count):
        angle = index * GOLDEN_ANGLE + rng.uniform(-0.10, 0.10)
        normalized_radius = math.sqrt((index + 0.55) / max(1, stalk_count))
        radius = stage_spread * normalized_radius
        base = (math.cos(angle) * radius, math.sin(angle) * radius, 0.022)
        height = stage_height * rng.uniform(0.86, 1.04)

        if stage == "overripe":
            lean = 0.09 + 0.08 * ((index % 4) / 3.0)
        elif stage == "withered":
            lean = 0.14 + 0.11 * ((index % 3) / 2.0)
        else:
            lean = 0.018 + 0.036 * ((index % 5) / 4.0)
        radial_x, radial_y = math.cos(angle), math.sin(angle)
        end = (base[0] + radial_x * lean, base[1] + radial_y * lean, base[2] + height)

        stalk_radius = 0.018 if stage == "sprout" else 0.024 if stage == "growing" else 0.027
        if stage in ("overripe", "withered"):
            middle = (
                base[0] + radial_x * lean * 0.20,
                base[1] + radial_y * lean * 0.20,
                base[2] + height * 0.58,
            )
            add_tapered_beam(
                f"wheat_stalk_{index:02d}_lower",
                base,
                middle,
                stalk_radius,
                stalk_radius * 0.86,
                stalk_token,
                root,
                vertices=4,
            )
            add_tapered_beam(
                f"wheat_stalk_{index:02d}_upper",
                middle,
                end,
                stalk_radius * 0.86,
                stalk_radius * 0.64,
                stalk_token,
                root,
                vertices=4,
            )
        else:
            add_tapered_beam(
                f"wheat_stalk_{index:02d}",
                base,
                end,
                stalk_radius,
                stalk_radius * 0.62,
                stalk_token,
                root,
                vertices=4,
            )

        leaf_count = {
            "sprout": 2,
            "growing": 2 if index < 10 else 1,
            "mature": 1 if index < 9 else 0,
            "overripe": 1 if index < 7 else 0,
            "withered": 1 if index < 5 else 0,
        }[stage]
        for leaf_index in range(leaf_count):
            side = -1.0 if leaf_index == 0 else 1.0
            leaf_angle = angle + side * (0.62 + 0.08 * (index % 2))
            leaf_height = 0.12 + height * (0.26 + leaf_index * 0.18)
            leaf_length = height * (0.34 if stage in ("sprout", "growing") else 0.25)
            add_tri_prism(
                f"wheat_leaf_{index:02d}_{leaf_index}",
                (
                    base[0] + math.cos(leaf_angle) * leaf_length * 0.38,
                    base[1] + math.sin(leaf_angle) * leaf_length * 0.38,
                    leaf_height,
                ),
                (0.052 if stage == "sprout" else 0.060, 0.016, leaf_length),
                leaf_token,
                root,
                rotation=(0.24 + lean * 0.45, 0, leaf_angle),
            )

        if stage == "sprout":
            continue

        if stage == "growing":
            if index >= max(6, stalk_count // 2):
                continue
            head_tip = (
                end[0] + radial_x * 0.025,
                end[1] + radial_y * 0.025,
                end[2] + 0.16,
            )
            _add_wheat_head(
                f"wheat_head_{index:02d}",
                end,
                head_tip,
                head_token,
                root,
                radius=0.052,
                kernel_count=3,
                add_awns=False,
            )
            continue

        if stage == "mature":
            head_tip = (
                end[0] + radial_x * 0.035,
                end[1] + radial_y * 0.035,
                end[2] + 0.29,
            )
            head_radius = 0.073
            kernels = 4
            awns = index < 2
        elif stage == "overripe":
            head_tip = (
                end[0] + radial_x * (0.22 + 0.025 * (index % 2)),
                end[1] + radial_y * (0.22 + 0.025 * (index % 2)),
                end[2] + 0.09 - 0.025 * (index % 3),
            )
            head_radius = 0.078
            kernels = 4
            awns = index < 2
        else:
            head_tip = (
                end[0] + radial_x * (0.20 + 0.03 * (index % 2)),
                end[1] + radial_y * (0.20 + 0.03 * (index % 2)),
                end[2] - 0.02 - 0.04 * (index % 3),
            )
            head_radius = 0.064
            kernels = 3
            awns = index < 2

        _add_wheat_head(
            f"wheat_head_{index:02d}",
            end,
            head_tip,
            head_token,
            root,
            radius=head_radius,
            kernel_count=kernels,
            add_awns=awns,
        )


def _add_leaf_cluster(
    prefix: str,
    center: tuple[float, float, float],
    token: str,
    root,
    *,
    radius: float,
    count: int,
    droop: float = 0.0,
    angle_offset: float = 0.0,
) -> None:
    """Build a broad readable leaf crown from asymmetric low-poly blades."""
    for index in range(count):
        angle = angle_offset + index * GOLDEN_ANGLE
        length = radius * (0.78 + 0.16 * ((index * 5) % 4))
        add_tri_prism(
            f"{prefix}_leaf_{index:02d}",
            (
                center[0] + math.cos(angle) * length * 0.40,
                center[1] + math.sin(angle) * length * 0.40,
                center[2] - droop * length * 0.42 + (index % 2) * radius * 0.035,
            ),
            (length * 0.42, max(0.020, length * 0.08), length),
            token,
            root,
            rotation=(0.34 + droop, 0, angle),
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
    cluster_top = (center[0], center[1], center[2] + radius * 0.9)
    add_tapered_beam(
        f"{prefix}_peduncle",
        cluster_top,
        center,
        max(0.010, radius * 0.10),
        max(0.006, radius * 0.06),
        stem_token,
        root,
        vertices=4,
    )
    for index in range(fruit_count):
        angle = index * GOLDEN_ANGLE + 0.38
        spread = radius * (0.44 + 0.12 * (index % 2))
        fruit_center = (
            center[0] + math.cos(angle) * spread,
            center[1] + math.sin(angle) * spread,
            center[2] - droop * radius * (0.28 + 0.12 * index) - (index % 2) * radius * 0.18,
        )
        token = accent_token if (index % 2 == 1) else fruit_token
        add_ico(
            f"{prefix}_fruit_{index:02d}",
            fruit_center,
            (radius * 0.46, radius * 0.44, radius * 0.50),
            token,
            root,
            subdivisions=1,
            rotation=(0.04 * index, -0.05 * index, angle),
        )
        add_tri_prism(
            f"{prefix}_calyx_{index:02d}",
            (fruit_center[0], fruit_center[1], fruit_center[2] + radius * 0.48),
            (radius * 0.30, radius * 0.08, radius * 0.28),
            stem_token,
            root,
            rotation=(math.pi * 0.5, 0, angle),
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
        for index in range(5):
            angle = index * GOLDEN_ANGLE + rng.uniform(-0.16, 0.16)
            radius = 0.06 + index * 0.036
            add_ico(
                f"tomato_seed_{index:02d}",
                (math.cos(angle) * radius, math.sin(angle) * radius, 0.032 + (index % 2) * 0.006),
                (0.038, 0.022, 0.016),
                leaf_token,
                root,
                subdivisions=1,
                rotation=(0.12, angle, 0.06),
            )
        return

    if stage == "sprout":
        for index, angle in enumerate((0.32, 2.42, 4.55)):
            base = (math.cos(angle) * 0.12, math.sin(angle) * 0.12, 0.018)
            tip = (base[0] + math.cos(angle) * 0.025, base[1] + math.sin(angle) * 0.025, 0.25 + index * 0.018)
            add_tapered_beam(f"tomato_sprout_{index}", base, tip, 0.025, 0.014, stem_token, root, vertices=5)
            _add_leaf_cluster(f"tomato_sprout_{index}", tip, leaf_token, root, radius=0.13, count=3, angle_offset=angle)
        return

    plant_count = spec["parameters"]["plants"]
    stage_height = {"growing": 0.72, "mature": 1.08, "overripe": 0.82, "withered": 0.48}[stage]
    crown_radius = {"growing": 0.27, "mature": 0.34, "overripe": 0.36, "withered": 0.31}[stage]
    for index in range(plant_count):
        angle = index * GOLDEN_ANGLE + 0.28
        radial = 0.12 + 0.12 * math.sqrt((index + 0.4) / max(1, plant_count))
        base = (math.cos(angle) * radial, math.sin(angle) * radial, 0.018)
        lean = 0.035 if stage == "growing" else 0.06
        if stage == "overripe":
            lean = 0.24 + 0.04 * (index % 2)
        elif stage == "withered":
            lean = 0.34 + 0.05 * (index % 2)
        direction = angle + (0.34 if index % 2 else -0.22)
        shoulder = (
            base[0] + math.cos(direction) * lean * 0.25,
            base[1] + math.sin(direction) * lean * 0.25,
            stage_height * 0.52,
        )
        tip = (
            base[0] + math.cos(direction) * lean,
            base[1] + math.sin(direction) * lean,
            stage_height * rng.uniform(0.92, 1.04),
        )
        add_tapered_beam(f"tomato_stem_{index:02d}_lower", base, shoulder, 0.035, 0.026, stem_token, root, vertices=5)
        add_tapered_beam(f"tomato_stem_{index:02d}_upper", shoulder, tip, 0.026, 0.014, stem_token, root, vertices=5)

        droop = 0.0 if stage in ("growing", "mature") else 0.46 if stage == "overripe" else 0.78
        leaf_count = 5 if stage == "growing" else 6 if stage == "mature" else 4 if stage == "overripe" else 3
        _add_leaf_cluster(
            f"tomato_crown_{index:02d}",
            (tip[0], tip[1], tip[2] - crown_radius * 0.14),
            leaf_token,
            root,
            radius=crown_radius,
            count=leaf_count,
            droop=droop,
            angle_offset=angle,
        )
        if stage == "growing":
            add_ico(
                f"tomato_blossom_{index:02d}",
                (tip[0] + math.cos(angle) * 0.08, tip[1] + math.sin(angle) * 0.08, tip[2] + 0.025),
                (0.055, 0.055, 0.026),
                fruit_token,
                root,
                subdivisions=1,
            )
        elif stage == "withered":
            add_ico(
                f"tomato_dried_{index:02d}",
                (shoulder[0], shoulder[1], shoulder[2] - 0.04),
                (0.045, 0.045, 0.032),
                accent_token,
                root,
                subdivisions=1,
            )
        elif stage in ("mature", "overripe"):
            fruit_center = (
                shoulder[0] - math.cos(direction) * 0.08,
                shoulder[1] - math.sin(direction) * 0.08,
                shoulder[2] + (0.10 if stage == "mature" else -0.03),
            )
            _add_tomato_fruit_cluster(
                f"tomato_cluster_{index:02d}",
                fruit_center,
                fruit_token,
                accent_token,
                stem_token,
                root,
                fruit_count=3 if index < 3 else 2,
                radius=0.22 if stage == "mature" else 0.24,
                droop=0.0 if stage == "mature" else 0.68,
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
) -> list[tuple[float, float, float]]:
    tips: list[tuple[float, float, float]] = []
    for index in range(stems):
        angle = index * GOLDEN_ANGLE + 0.18
        lean = spread * (0.20 + 0.55 * droop) * (0.78 + 0.14 * (index % 3))
        tip = (
            base[0] + math.cos(angle) * lean,
            base[1] + math.sin(angle) * lean,
            base[2] + height * (0.88 + 0.08 * (index % 3)) * (1.0 - droop * 0.30),
        )
        add_tapered_beam(f"{prefix}_stem_{index:02d}", base, tip, 0.026, 0.013, stem_token, root, vertices=5)
        _add_leaf_cluster(
            f"{prefix}_crown_{index:02d}",
            tip,
            leaf_token,
            root,
            radius=spread * (0.46 + 0.04 * (index % 2)),
            count=4,
            droop=droop,
            angle_offset=angle,
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
            radius = 0.07 + index * 0.045
            add_ico(
                f"potato_seed_piece_{index:02d}",
                (math.cos(angle) * radius, math.sin(angle) * radius, 0.042 + (index % 2) * 0.008),
                (0.075, 0.055, 0.040),
                leaf_token,
                root,
                subdivisions=1,
                rotation=(0.12 * index, angle, -0.08 * index),
            )
            add_ico(
                f"potato_seed_eye_{index:02d}",
                (math.cos(angle) * radius + 0.018, math.sin(angle) * radius - 0.012, 0.078),
                (0.014, 0.014, 0.012),
                stem_token,
                root,
                subdivisions=1,
            )
        return

    if stage == "sprout":
        _add_potato_crown(
            "potato_sprout",
            (0, 0, 0.018),
            leaf_token,
            stem_token,
            root,
            height=0.25,
            spread=0.22,
            stems=4,
            droop=0.0,
        )
        return

    settings = {
        "growing": (0.52, 0.48, 6, 0.04),
        "mature": (0.68, 0.58, 7, 0.08),
        "overripe": (0.56, 0.66, 7, 0.48),
        "withered": (0.34, 0.70, 6, 0.82),
    }
    height, spread, stems, droop = settings[stage]
    tips = _add_potato_crown(
        f"potato_{stage}",
        (0, 0, 0.018),
        leaf_token,
        stem_token,
        root,
        height=height,
        spread=spread,
        stems=stems,
        droop=droop,
    )
    if stage == "growing":
        for index, tip in enumerate(tips[:3]):
            add_ico(
                f"potato_bud_{index:02d}",
                (tip[0], tip[1], tip[2] + 0.035),
                (0.035, 0.035, 0.045),
                flower_token,
                root,
                subdivisions=1,
            )
    elif stage == "mature":
        for index, tip in enumerate(tips[:5]):
            for petal in range(4):
                angle = petal * math.pi * 0.5 + index * 0.31
                add_ico(
                    f"potato_flower_{index:02d}_petal_{petal}",
                    (tip[0] + math.cos(angle) * 0.045, tip[1] + math.sin(angle) * 0.045, tip[2] + 0.035),
                    (0.052, 0.034, 0.022),
                    flower_token,
                    root,
                    subdivisions=1,
                    rotation=(0, 0, angle),
                )
            add_ico(
                f"potato_flower_{index:02d}_center",
                (tip[0], tip[1], tip[2] + 0.052),
                (0.024, 0.024, 0.022),
                center_token,
                root,
                subdivisions=1,
            )
    elif stage == "overripe":
        for index, tip in enumerate(tips[:4]):
            add_ico(
                f"potato_seed_pod_{index:02d}",
                (tip[0], tip[1], tip[2] + 0.018),
                (0.032, 0.032, 0.038),
                flower_token,
                root,
                subdivisions=1,
            )
