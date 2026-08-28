"""Vegetation family generators."""

from __future__ import annotations

import math

import bpy

from common.geometry import (
    add_beam,
    add_box,
    add_cone,
    add_cylinder,
    add_ico,
    add_tapered_beam,
    add_tri_prism,
    apply_vertex_values,
    seeded_rng,
)
from common.authored import add_root_flare
from common.lod import consolidate_lod_level, create_lod_roots
from common.materials import get_or_create_material


def _build_tree_lods(spec: dict, root, builder, reduce_parameters) -> None:
    for lod_index, lod_root in create_lod_roots(spec, root):
        lod_spec = {**spec, "parameters": dict(spec["parameters"]), "_lodIndex": lod_index}
        if lod_index > 0:
            reduce_parameters(lod_spec["parameters"])
        builder(lod_spec, lod_root)
        prefix = f"{spec['id']}_LOD{lod_index}"
        for child in list(lod_root.children):
            child.name = f"{prefix}_{child.name.split('.')[0]}"
            if child.type == "MESH":
                child.data.name = f"{child.name}_mesh"
        if spec.get("lodLevels"):
            consolidate_lod_level(lod_root, prefix)


def _add_secondary_root_spokes(prefix: str, radius: float, height: float, token: str, parent, *, count: int, seed: int) -> None:
    """Add a few low, tapered root spokes beneath the faceted root flare."""
    rng = seeded_rng(seed)
    for index in range(count):
        angle = index * math.tau / count + rng.uniform(-0.14, 0.14)
        root_length = radius * rng.uniform(0.76, 1.02)
        start = (
            math.cos(angle) * radius * 0.12,
            math.sin(angle) * radius * 0.12,
            height * 0.16,
        )
        end = (
            math.cos(angle) * root_length,
            math.sin(angle) * root_length,
            height * 0.035,
        )
        add_tapered_beam(
            f"{prefix}_{index:02d}",
            start,
            end,
            radius * 0.095,
            radius * 0.022,
            token,
            parent,
            vertices=6,
        )


def _oak_tree(spec: dict, root) -> None:
    params = spec["parameters"]
    rng = seeded_rng(spec["seed"])
    height = params["height"]
    spread = params["spread"]
    lean = params["lean"]
    lod_index = spec.get("_lodIndex", 0)
    wood, leaves, shadow = spec["palette"]

    gesture = lean * height
    base = (0.0, 0.0, 0.08)
    lower_joint = (gesture * 0.25, -0.04, height * 0.38)
    fork = (gesture * 0.58, 0.05, height * 0.57)
    upper_joint = (gesture * 0.94, 0.02, height * 0.74)
    side_fork = (gesture * 0.48 - spread * 0.34, 0.10, height * 0.70)
    add_tapered_beam("oak_trunk_lower", base, lower_joint, 0.58, 0.42, wood, root, vertices=8)
    add_tapered_beam("oak_trunk_mid", lower_joint, fork, 0.44, 0.32, wood, root, vertices=8)
    add_tapered_beam("oak_trunk_upper", fork, upper_joint, 0.30, 0.18, wood, root, vertices=8)
    add_tapered_beam("oak_trunk_fork", fork, side_fork, 0.23, 0.11, wood, root, vertices=7)
    add_root_flare(
        "oak_root", (0, 0, 0), 1.08, 0.62, wood, root,
        count=params["rootCount"], seed=spec["seed"] + 1,
    )
    _add_secondary_root_spokes(
        "oak_root_spoke", 1.08, 0.62, wood, root,
        count=max(3, min(5, params["rootCount"] // 2)), seed=spec["seed"] + 11,
    )
    crown_center = (gesture * 0.82, 0.0, height * 0.78)
    branch_count = params["branchCount"]
    for index in range(branch_count):
        angle = index * math.tau / branch_count + 0.34 + rng.uniform(-0.16, 0.16)
        start_height = height * (0.44 + (index % 3) * 0.055)
        start_progress = start_height / height
        start = (gesture * start_progress * 0.92, rng.uniform(-0.035, 0.035), start_height)
        end = (
            crown_center[0] + math.cos(angle) * spread * 0.62,
            math.sin(angle) * spread * 0.50,
            height * (0.68 + 0.055 * (index % 3) + rng.uniform(-0.025, 0.025)),
        )
        add_tapered_beam(
            f"oak_branch_{index:02d}", start, end,
            0.17 + rng.uniform(0.0, 0.025), 0.075, wood, root, vertices=7,
        )
        twig_end = (
            end[0] + math.cos(angle + 0.48) * spread * 0.24,
            end[1] + math.sin(angle + 0.48) * spread * 0.20,
            end[2] + height * rng.uniform(0.055, 0.095),
        )
        if lod_index == 0:
            add_tapered_beam(f"oak_twig_{index:02d}", end, twig_end, 0.078, 0.035, wood, root, vertices=6)
        if lod_index == 0 and index % 2 == 0:
            split_end = (
                end[0] + math.cos(angle - 0.58) * spread * 0.18,
                end[1] + math.sin(angle - 0.58) * spread * 0.16,
                end[2] + height * rng.uniform(0.035, 0.075),
            )
            add_tapered_beam(
                f"oak_branch_split_{index:02d}", end, split_end,
                0.066, 0.030, wood, root, vertices=6,
            )

    cluster_count = params["canopyClusters"]
    lobe_layout = (
        (-0.56, -0.12, 0.74, 0.52, 0.42, 0.12),
        (-0.04, -0.10, 0.90, 0.54, 0.44, 0.12),
        (0.57, 0.05, 0.76, 0.50, 0.40, 0.11),
        (0.05, 0.42, 0.83, 0.48, 0.42, 0.12),
    )
    major_centers = []
    major_count = min(4, cluster_count)
    for index in range(major_count):
        offset_x, offset_y, z_factor, scale_x, scale_y, scale_z = lobe_layout[index]
        offset_x += rng.uniform(-0.11, 0.11)
        offset_y += rng.uniform(-0.08, 0.08)
        z_factor += rng.uniform(-0.026, 0.026)
        center = (
            crown_center[0] + offset_x * spread,
            offset_y * spread,
            height * max(0.68, min(0.96, z_factor)),
        )
        major_centers.append(center)
        add_ico(
            f"oak_canopy_major_{index:02d}", center,
            (spread * scale_x * rng.uniform(0.95, 1.05), spread * scale_y * rng.uniform(0.94, 1.04), height * scale_z * rng.uniform(0.95, 1.04)),
            shadow if index == 0 else leaves, root, subdivisions=1 if lod_index else 2,
            rotation=(rng.uniform(-0.16, 0.16), rng.uniform(-0.16, 0.16), rng.uniform(-0.28, 0.28)),
        )
    for index in range(cluster_count - major_count):
        lobe_index = index % major_count
        lobe = major_centers[lobe_index]
        angle = index * 2.39996 + lobe_index * 0.47 + rng.uniform(-0.18, 0.18)
        radial = spread * (0.26 + 0.07 * (index % 3)) * rng.uniform(0.90, 1.10)
        center = (
            lobe[0] + math.cos(angle) * radial,
            lobe[1] + math.sin(angle) * radial * 0.82,
            lobe[2] + height * (0.055 * ((index % 3) - 1)) + rng.uniform(-0.06, 0.06),
        )
        size = spread * rng.uniform(0.25, 0.34)
        add_ico(
            f"oak_canopy_minor_{index:02d}", center,
            (size, size * rng.uniform(0.76, 0.90), size * rng.uniform(0.66, 0.82)),
            shadow if index % 4 == 0 else leaves, root, subdivisions=1 if lod_index else 2,
            rotation=(rng.uniform(-0.22, 0.22), rng.uniform(-0.22, 0.22), angle * 0.22),
        )
    if lod_index == 0:
        for index, lobe in enumerate(major_centers):
            for chip in range(3):
                angle = index * 1.7 + chip * 2.1
                radial = spread * (0.18 + 0.06 * chip)
                add_ico(
                    f"oak_canopy_chip_{index:02d}_{chip}",
                    (
                        lobe[0] + math.cos(angle) * radial,
                        lobe[1] + math.sin(angle) * radial * 0.78,
                        lobe[2] + height * (0.04 * (chip - 1)),
                    ),
                    (spread * 0.18, spread * 0.16, height * 0.055),
                    shadow if chip == 0 else leaves, root, subdivisions=2,
                    rotation=(0.12 * chip, -0.08 * index, angle),
                )


def oak_tree(spec: dict, root) -> None:
    def reduce(parameters: dict) -> None:
        parameters["canopyClusters"] = max(6, round(parameters["canopyClusters"] * 0.45))
        parameters["branchCount"] = max(4, round(parameters["branchCount"] * 0.60))
        parameters["rootCount"] = max(4, round(parameters["rootCount"] * 0.70))

    _build_tree_lods(spec, root, _oak_tree, reduce)


def _pine_tree(spec: dict, root) -> None:
    params = spec["parameters"]
    rng = seeded_rng(spec["seed"])
    height = params["height"]
    spread = params["spread"]
    lean = params["lean"]
    lod_index = spec.get("_lodIndex", 0)
    wood, pine, highlight = spec["palette"]
    add_cone("pine_trunk", (lean, 0, height * 0.43), 0.38, 0.16, height * 0.86, wood, root, vertices=8)
    add_root_flare("pine_root", (0, 0, 0), 0.72, 0.42, wood, root, count=params["rootCount"], seed=spec["seed"] + 1)
    _add_secondary_root_spokes(
        "pine_root_spoke", 0.72, 0.42, wood, root,
        count=max(3, min(5, params["rootCount"] // 2)), seed=spec["seed"] + 11,
    )
    tiers = params["tiers"]
    tier_phase = rng.uniform(-0.20, 0.20)
    for index in range(tiers):
        progress = index / max(1, tiers - 1)
        radius = spread * (1.0 - progress * 0.68) * rng.uniform(0.92, 1.06)
        tier_height = 1.25 - progress * 0.28
        z = 1.45 + index * (height - 1.75) / tiers + rng.uniform(-0.035, 0.035)
        token = highlight if index >= tiers - 2 else pine
        add_cone(
            f"pine_crown_{index:02d}", (lean * z / height, 0, z),
            radius, radius * 0.08, tier_height, token, root, vertices=10,
            rotation=(rng.uniform(-0.03, 0.03), rng.uniform(-0.03, 0.03), rng.uniform(-0.18, 0.18)),
        )
        if index < tiers - 1 and lod_index == 0:
            for side in range(params["branchesPerTier"]):
                angle = tier_phase + index * 0.8 + side * math.tau / params["branchesPerTier"] + rng.uniform(-0.12, 0.12)
                branch_end = (math.cos(angle) * radius * 0.92, math.sin(angle) * radius * 0.92, z - 0.1)
                add_beam(
                    f"pine_branch_{index:02d}_{side}",
                    (lean * z / height, 0, z - 0.22),
                    branch_end,
                    0.055, wood, root, vertices=5,
                )
                for cluster in range(2):
                    distance = 0.52 + cluster * 0.26
                    add_cone(
                        f"pine_bough_{index:02d}_{side}_{cluster}",
                        (math.cos(angle) * radius * distance, math.sin(angle) * radius * distance, z - 0.05 + cluster * 0.04),
                        radius * 0.26, radius * 0.035, 0.58, pine if cluster == 0 else highlight, root,
                        vertices=7, rotation=(math.radians(76), 0, angle),
                    )


def pine_tree(spec: dict, root) -> None:
    def reduce(parameters: dict) -> None:
        parameters["tiers"] = max(5, round(parameters["tiers"] * 0.62))
        parameters["branchesPerTier"] = max(3, parameters["branchesPerTier"] - 1)
        parameters["rootCount"] = max(3, round(parameters["rootCount"] * 0.70))

    _build_tree_lods(spec, root, _pine_tree, reduce)


def _apple_tree(spec: dict, root) -> None:
    params = spec["parameters"]
    rng = seeded_rng(spec["seed"])
    height = params["height"]
    spread = params["spread"]
    lod_index = spec.get("_lodIndex", 0)
    wood, leaves, fruit = spec["palette"][:3]
    blossom = spec["palette"][3] if len(spec["palette"]) > 3 else leaves
    add_cone("apple_trunk", (0, 0, height * 0.34), 0.42, 0.20, height * 0.68, wood, root, vertices=8)
    add_root_flare("apple_root", (0, 0, 0), 0.82, 0.48, wood, root, count=params["rootCount"], seed=spec["seed"] + 1)
    _add_secondary_root_spokes(
        "apple_root_spoke", 0.82, 0.48, wood, root,
        count=max(3, min(5, params["rootCount"] // 2)), seed=spec["seed"] + 11,
    )
    crown_phase = rng.uniform(-0.28, 0.28)
    for index in range(params["branchCount"]):
        angle = index * math.tau / params["branchCount"] + 0.4 + crown_phase + rng.uniform(-0.12, 0.12)
        branch_radius = spread * 0.55 * rng.uniform(0.92, 1.06)
        end = (math.cos(angle) * branch_radius, math.sin(angle) * branch_radius, height * (0.68 + 0.06 * (index % 2) + rng.uniform(-0.018, 0.018)))
        add_beam(
            f"apple_branch_{index:02d}", (0, 0, height * 0.47),
            end,
            0.11, wood, root, vertices=6,
        )
        if lod_index == 0:
            add_beam(
                f"apple_twig_{index:02d}", end,
                (end[0] + math.cos(angle + 0.6) * spread * 0.26, end[1] + math.sin(angle + 0.6) * spread * 0.26, end[2] + height * 0.10),
                0.052, wood, root, vertices=6,
            )
    clusters = params["canopyClusters"]
    for index in range(clusters):
        angle = index * 2.39996 + crown_phase + rng.uniform(-0.20, 0.20)
        radial = spread * (0.28 + 0.35 * (index % 3) / 2) * rng.uniform(0.90, 1.10)
        size = spread * rng.uniform(0.48, 0.62)
        center_z = height * (0.70 + 0.12 * (index % 2) + rng.uniform(-0.025, 0.025))
        add_ico(
            f"apple_canopy_{index:02d}",
            (math.cos(angle) * radial, math.sin(angle) * radial * 0.8, center_z),
            (size, size * 0.86, size * 0.74), leaves, root, subdivisions=1 if lod_index else 2,
            rotation=(0.1 * math.sin(index), 0.08 * math.cos(index), angle * 0.2),
        )
    for index in range(params["fruitCount"]):
        angle = index * 2.39996
        # Keep fruit inside the overlapping crown masses. The previous lower
        # band dropped apples onto the visible trunk, weakening the orchard
        # read from the gameplay camera.
        radius = spread * (0.50 + 0.18 * ((index * 5) % 7) / 6)
        face_offset = spread * (-0.46 if index % 4 in (0, 1) else 0.38)
        fruit_z = height * (0.72 + 0.16 * ((index * 3) % 5) / 4)
        add_ico(
            f"apple_fruit_{index:02d}",
            (math.cos(angle) * radius, math.sin(angle) * radius * 0.72 + face_offset, fruit_z),
            (0.16, 0.15, 0.16), fruit, root, subdivisions=1,
        )
        add_cone(
            f"apple_stem_{index:02d}",
            (math.cos(angle) * radius, math.sin(angle) * radius * 0.72 + face_offset, fruit_z + 0.12),
            0.018, 0.010, 0.08, wood, root, vertices=5,
        )
    if lod_index == 0:
        for fallen in range(3):
            f_angle = fallen * 2.1 + 0.5
            f_rad = 0.55 + 0.35 * (fallen % 2)
            add_ico(
                f"apple_fallen_{fallen:02d}",
                (math.cos(f_angle) * f_rad, math.sin(f_angle) * f_rad, 0.07),
                (0.14, 0.14, 0.12), fruit, root, subdivisions=1,
            )
        for bloom in range(max(4, params["fruitCount"] // 3)):
            angle = bloom * 2.39996 + 0.7
            radius = spread * (0.30 + 0.28 * ((bloom * 3) % 5) / 4)
            face_offset = spread * (-0.18 if bloom % 3 == 0 else 0.10)
            add_ico(
                f"apple_blossom_{bloom:02d}",
                (math.cos(angle) * radius, math.sin(angle) * radius * 0.78 + face_offset, height * (0.66 + 0.14 * (bloom % 3) / 2)),
                (0.07, 0.07, 0.05), blossom, root, subdivisions=1,
            )
        for index in range(min(4, params["canopyClusters"])):
            angle = index * math.tau / 4 + 0.3
            add_ico(
                f"apple_canopy_chip_{index:02d}",
                (math.cos(angle) * spread * 0.62, math.sin(angle) * spread * 0.50, height * 0.72),
                (spread * 0.22, spread * 0.20, spread * 0.16), leaves, root, subdivisions=2,
                rotation=(0.1, 0.08, angle),
            )


def apple_tree(spec: dict, root) -> None:
    def reduce(parameters: dict) -> None:
        parameters["canopyClusters"] = max(6, round(parameters["canopyClusters"] * 0.55))
        parameters["fruitCount"] = max(6, round(parameters["fruitCount"] * 0.38))
        parameters["branchCount"] = max(3, round(parameters["branchCount"] * 0.65))
        parameters["rootCount"] = max(3, round(parameters["rootCount"] * 0.70))

    _build_tree_lods(spec, root, _apple_tree, reduce)


def bush(spec: dict, root) -> None:
    params = spec["parameters"]
    rng = seeded_rng(spec["seed"])
    leaves, shadow, flower = spec["palette"]
    crown_phase = rng.uniform(-0.24, 0.24)
    for index in range(params["clusters"]):
        angle = index * 2.39996 + crown_phase + rng.uniform(-0.18, 0.18)
        radius = (0.16 + 0.36 * (index % 3) / 2) * rng.uniform(0.90, 1.10)
        add_ico(
            f"bush_cluster_{index:02d}",
            (math.cos(angle) * radius, math.sin(angle) * radius * 0.75, 0.43 + 0.11 * (index % 2) + rng.uniform(-0.025, 0.025)),
            (0.62 + rng.uniform(-0.08, 0.08), 0.52 * rng.uniform(0.94, 1.06), 0.47 * rng.uniform(0.94, 1.05)),
            shadow if index == 0 else leaves, root, subdivisions=2,
            rotation=(rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2), angle),
        )
    for index in range(params["flowerCount"]):
        cluster_angle = crown_phase + (index % 2) * math.pi + rng.uniform(-0.26, 0.26)
        angle = cluster_angle + rng.uniform(-0.30, 0.30)
        radius = (0.26 + 0.30 * ((index * 3) % 5) / 4) * rng.uniform(0.90, 1.08)
        add_ico(
            f"bush_flower_{index:02d}",
            (math.cos(angle) * radius, math.sin(angle) * radius * 0.72, 0.68 + 0.12 * (index % 3)),
            (0.07, 0.07, 0.055), flower, root, subdivisions=1,
        )
    for index in range(params["leafTips"]):
        angle = index * 2.39996 + 0.4
        add_tri_prism(
            f"bush_leaf_tip_{index:02d}",
            (math.cos(angle) * 0.68, math.sin(angle) * 0.52, 0.42 + 0.12 * (index % 3)),
            (0.16, 0.08, 0.26), leaves, root, rotation=(math.pi / 2, 0, angle),
        )


def reeds(spec: dict, root) -> None:
    params = spec["parameters"]
    rng = seeded_rng(spec["seed"])
    stalk_token, tip_token = spec["palette"]
    count = params["stalks"]
    clump_phase = rng.uniform(-0.24, 0.24)
    for index in range(count):
        angle = index * 2.39996 + clump_phase + rng.uniform(-0.14, 0.14)
        radius = (0.08 + 0.34 * ((index * 5) % count) / max(1, count - 1)) * rng.uniform(0.92, 1.08)
        x, y = math.cos(angle) * radius, math.sin(angle) * radius * 0.72
        height = params["height"] * rng.uniform(0.72, 1.0)
        lean = rng.uniform(0.035, 0.105)
        lean_angle = angle + rng.uniform(-0.46, 0.46)
        lean_x, lean_y = math.cos(lean_angle) * lean, math.sin(lean_angle) * lean
        add_beam(f"reed_stalk_{index:02d}", (x, y, 0), (x + lean_x, y + lean_y, height), 0.018, stalk_token, root, vertices=5)
        add_cylinder(
            f"reed_tip_{index:02d}", (x + lean_x, y + lean_y, height - 0.09),
            0.035, 0.22, tip_token, root, vertices=6,
        )
    for index in range(params["bladeCount"]):
        angle = index * math.tau / params["bladeCount"] + rng.uniform(-0.18, 0.18)
        radius = 0.18 + 0.12 * (index % 2)
        add_tri_prism(
            f"reed_blade_{index:02d}",
            (math.cos(angle) * radius, math.sin(angle) * radius * 0.72, params["height"] * 0.30),
            (0.09, 0.04, params["height"] * (0.48 + 0.06 * (index % 3))),
            stalk_token, root, rotation=(rng.uniform(-0.24, 0.24), 0, angle),
        )


def kelp_clump(spec: dict, root) -> None:
    """Build a low-tide kelp clump with connected, faceted fronds."""
    params = spec["parameters"]
    rng = seeded_rng(spec["seed"])
    stalk_token, blade_token, shadow_token = spec["palette"]
    fronds = params["fronds"]
    for index in range(fronds):
        angle = index * math.tau / fronds + rng.uniform(-0.16, 0.16)
        radius = params["spread"] * (0.28 + 0.58 * ((index * 3) % fronds) / max(1, fronds - 1))
        base = (math.cos(angle) * radius, math.sin(angle) * radius * 0.72, 0.035)
        height = params["height"] * rng.uniform(0.74, 1.0)
        lean = rng.uniform(0.12, 0.28)
        lean_x, lean_y = math.cos(angle) * lean, math.sin(angle) * lean
        mid = (base[0] + lean_x * 0.42, base[1] + lean_y * 0.42, height * 0.48)
        tip = (base[0] + lean_x, base[1] + lean_y, height)
        add_tapered_beam(
            f"kelp_stalk_{index:02d}", base, mid, params["stalkRadius"], params["stalkRadius"] * 0.68,
            stalk_token, root, vertices=5,
        )
        add_tapered_beam(
            f"kelp_stalk_tip_{index:02d}", mid, tip, params["stalkRadius"] * 0.68, params["stalkRadius"] * 0.20,
            shadow_token if index % 3 == 0 else stalk_token, root, vertices=5,
        )
        add_tri_prism(
            f"kelp_blade_lower_{index:02d}",
            (mid[0] + lean_x * 0.18, mid[1] + lean_y * 0.18, mid[2] + height * 0.06),
            (params["bladeWidth"] * 0.76, 0.045, height * 0.34),
            blade_token, root, rotation=(rng.uniform(-0.16, 0.16), 0.12, angle + math.pi * 0.5),
        )
        add_tri_prism(
            f"kelp_blade_upper_{index:02d}",
            (tip[0] - lean_x * 0.06, tip[1] - lean_y * 0.06, tip[2] - height * 0.12),
            (params["bladeWidth"], 0.05, height * 0.40),
            shadow_token if index % 2 else blade_token, root,
            rotation=(rng.uniform(-0.20, 0.20), 0.16, angle + math.pi * 0.5),
        )


def _add_bent_grass_blade(
    name: str,
    base: tuple[float, float, float],
    height: float,
    width: float,
    facing_angle: float,
    lean_angle: float,
    lean_amount: float,
    token: str,
    root,
) -> None:
    """Build one connected, tapered blade with a thin mid facet and authored bend."""
    width_axis = (-math.sin(facing_angle), math.cos(facing_angle), 0.0)
    normal_axis = (math.cos(facing_angle), math.sin(facing_angle), 0.0)
    lean_axis = (math.cos(lean_angle), math.sin(lean_angle), 0.0)
    centers = (
        base,
        (
            base[0] + lean_axis[0] * lean_amount * 0.36,
            base[1] + lean_axis[1] * lean_amount * 0.36,
            base[2] + height * 0.52,
        ),
        (
            base[0] + lean_axis[0] * lean_amount,
            base[1] + lean_axis[1] * lean_amount,
            base[2] + height,
        ),
    )
    half_widths = (width * 0.16, width * 0.36, width * 0.028)
    half_thickness = min(0.0036, width * 0.038)
    vertices: list[tuple[float, float, float]] = []
    for face_sign in (-1.0, 1.0):
        for center, half_width in zip(centers, half_widths):
            for side_sign in (-1.0, 1.0):
                vertices.append((
                    center[0] + width_axis[0] * half_width * side_sign + normal_axis[0] * half_thickness * face_sign,
                    center[1] + width_axis[1] * half_width * side_sign + normal_axis[1] * half_thickness * face_sign,
                    center[2],
                ))
    faces = [
        (0, 2, 3), (0, 3, 1), (2, 4, 5), (2, 5, 3),
        (6, 9, 8), (6, 7, 9), (8, 11, 10), (8, 9, 11),
        (0, 6, 8, 2), (2, 8, 10, 4),
        (1, 3, 9, 7), (3, 5, 11, 9),
        (0, 1, 7, 6), (4, 10, 11, 5),
    ]
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    blade = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(blade)
    blade.data.materials.append(get_or_create_material(token))
    blade.parent = root
    apply_vertex_values(blade)


def grass_clump(spec: dict, root) -> None:
    params = spec["parameters"]
    rng = seeded_rng(spec["seed"])
    primary, shadow = spec["palette"]
    blade_count = params["bladeCount"]
    gesture_angle = rng.uniform(-math.pi, math.pi)
    group_offsets = (-0.82, 0.0, 0.68)
    height_tiers = (0.62, 0.80, 1.0)
    for index in range(blade_count):
        group = index % 3
        angle = gesture_angle + group_offsets[group] + rng.uniform(-0.34, 0.34)
        radius = params["spread"] * rng.uniform(0.10, 0.76)
        height = params["height"] * height_tiers[group] * rng.uniform(0.92, 1.04)
        _add_bent_grass_blade(
            f"grass_blade_{index:02d}",
            (math.cos(angle) * radius, math.sin(angle) * radius * 0.82, 0.006),
            height,
            params["bladeWidth"] * rng.uniform(0.86, 1.08),
            angle,
            gesture_angle + rng.uniform(-0.46, 0.46),
            height * rng.uniform(0.18, 0.38),
            shadow if index % 5 == 0 else primary,
            root,
        )
    consolidate_lod_level(root, f"{spec['id']}_cluster")


def wildflower_clump(spec: dict, root) -> None:
    params = spec["parameters"]
    rng = seeded_rng(spec["seed"])
    foliage, flower, center = spec["palette"]
    gesture_angle = rng.uniform(-math.pi, math.pi)
    for index in range(params["stemCount"]):
        angle = index * 2.39996 + rng.uniform(-0.16, 0.16)
        radius = params["spread"] * (0.18 + 0.68 * ((index * 5) % params["stemCount"]) / max(1, params["stemCount"] - 1))
        height = params["height"] * rng.uniform(0.62, 1.0)
        x = math.cos(angle) * radius
        y = math.sin(angle) * radius * 0.82
        lean_angle = gesture_angle + rng.uniform(-0.62, 0.62)
        joint = (
            x + math.cos(lean_angle) * height * 0.055,
            y + math.sin(lean_angle) * height * 0.055,
            height * 0.50,
        )
        tip = (
            x + math.cos(lean_angle) * height * rng.uniform(0.10, 0.17),
            y + math.sin(lean_angle) * height * rng.uniform(0.10, 0.17),
            height,
        )
        add_tapered_beam(f"flower_stem_{index:02d}_lower", (x, y, 0.01), joint, 0.016, 0.011, foliage, root, vertices=4)
        add_tapered_beam(f"flower_stem_{index:02d}_upper", joint, tip, 0.011, 0.006, foliage, root, vertices=4)
        x, y = tip[0], tip[1]
        petal_count = params["petals"]
        for petal in range(petal_count):
            petal_angle = petal * math.tau / petal_count + angle * 0.12
            add_ico(
                f"flower_{index:02d}_petal_{petal:02d}",
                (x + math.cos(petal_angle) * 0.055, y + math.sin(petal_angle) * 0.055, height),
                (0.058, 0.034, 0.025), flower, root, subdivisions=1,
                rotation=(rng.uniform(-0.18, 0.18), rng.uniform(-0.18, 0.18), petal_angle),
            )
        add_ico(
            f"flower_{index:02d}_center", (x, y, height + 0.012),
            (0.034, 0.034, 0.028), center, root, subdivisions=1,
        )
    for leaf_index in range(3):
        leaf_angle = gesture_angle + (-1.05, 0.22, 1.18)[leaf_index] + rng.uniform(-0.16, 0.16)
        leaf_height = params["height"] * rng.uniform(0.30, 0.42)
        leaf_radius = params["spread"] * rng.uniform(0.08, 0.24)
        _add_bent_grass_blade(
            f"flower_ground_leaf_{leaf_index:02d}",
            (math.cos(leaf_angle) * leaf_radius, math.sin(leaf_angle) * leaf_radius, 0.004),
            leaf_height,
            params["spread"] * rng.uniform(0.17, 0.23),
            leaf_angle,
            leaf_angle,
            leaf_height * rng.uniform(0.72, 0.90),
            foliage,
            root,
        )
    consolidate_lod_level(root, f"{spec['id']}_cluster")


def _add_daisy_petals(name: str, center, radius: float, token: str, parent, rotation: float) -> None:
    """Build six broad diamond petals as one tiny double-sided faceted mesh."""
    center_x, center_y, center_z = center
    vertices = []
    faces = []
    for petal in range(6):
        angle = rotation + petal * math.tau / 6
        direction = (math.cos(angle), math.sin(angle))
        side = (-direction[1], direction[0])
        inner_radius = radius * 0.16
        shoulder_radius = radius * 0.58
        half_width = radius * 0.30
        base_index = len(vertices)
        vertices.extend([
            (
                center_x + direction[0] * inner_radius,
                center_y + direction[1] * inner_radius,
                center_z,
            ),
            (
                center_x + direction[0] * shoulder_radius + side[0] * half_width,
                center_y + direction[1] * shoulder_radius + side[1] * half_width,
                center_z + radius * 0.035,
            ),
            (
                center_x + direction[0] * radius,
                center_y + direction[1] * radius,
                center_z + radius * 0.015,
            ),
            (
                center_x + direction[0] * shoulder_radius - side[0] * half_width,
                center_y + direction[1] * shoulder_radius - side[1] * half_width,
                center_z + radius * 0.035,
            ),
        ])
        top_a = (base_index, base_index + 2, base_index + 1)
        top_b = (base_index, base_index + 3, base_index + 2)
        faces.extend([top_a, top_b, tuple(reversed(top_a)), tuple(reversed(top_b))])
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    petals = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(petals)
    petals.data.materials.append(get_or_create_material(token))
    petals.parent = parent
    apply_vertex_values(petals)


def flower_drift(spec: dict, root) -> None:
    """Instance-efficient chamomile/daisy mat with broad petals and raised centers."""
    params = spec["parameters"]
    rng = seeded_rng(spec["seed"])
    foliage, flower, center = spec["palette"]
    gesture_angle = rng.uniform(-math.pi, math.pi)
    blossom_count = params["blossomCount"]
    cluster_count = min(3, blossom_count)
    for index in range(blossom_count):
        cluster_index = index % cluster_count
        local_index = index // cluster_count
        cluster_angle = gesture_angle + cluster_index * math.tau / cluster_count + rng.uniform(-0.24, 0.24)
        angle = cluster_angle + rng.uniform(-0.34, 0.34)
        radius = params["spread"] * (0.16 + 0.19 * local_index) * rng.uniform(0.88, 1.12)
        height = params["height"] * rng.uniform(0.55, 1.0)
        x = math.cos(angle) * radius
        y = math.sin(angle) * radius * 0.78
        lean = gesture_angle + rng.uniform(-0.48, 0.48)
        tip = (
            x + math.cos(lean) * height * 0.12,
            y + math.sin(lean) * height * 0.12,
            height,
        )
        add_tapered_beam(
            f"drift_stem_{index:02d}",
            (x, y, 0.008),
            tip,
            0.012,
            0.006,
            foliage,
            root,
            vertices=4,
        )
        size = params["blossomSize"]
        petal_rotation = angle * 0.12 + rng.uniform(-0.18, 0.18)
        _add_daisy_petals(
            f"drift_petals_{index:02d}",
            (tip[0], tip[1], tip[2] + size * 0.05),
            size,
            flower,
            root,
            petal_rotation,
        )
        add_box(
            f"drift_center_{index:02d}",
            (tip[0], tip[1], tip[2] + size * 0.12),
            (size * 0.38, size * 0.38, size * 0.22),
            center,
            root,
            rotation=(0.0, 0.0, petal_rotation),
            bevel=0.0,
        )
    for leaf_index in range(2):
        leaf_angle = gesture_angle + (-0.9, 1.1)[leaf_index]
        _add_bent_grass_blade(
            f"drift_leaf_{leaf_index:02d}",
            (math.cos(leaf_angle) * params["spread"] * 0.18, math.sin(leaf_angle) * params["spread"] * 0.16, 0.004),
            params["height"] * rng.uniform(0.28, 0.4),
            params["spread"] * 0.16,
            leaf_angle,
            leaf_angle,
            params["height"] * 0.22,
            foliage,
            root,
        )
    consolidate_lod_level(root, f"{spec['id']}_cluster")
