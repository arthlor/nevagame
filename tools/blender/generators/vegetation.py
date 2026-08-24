"""Vegetation family generators."""

from __future__ import annotations

import math

from common.geometry import add_beam, add_cone, add_cylinder, add_ico, add_tri_prism, seeded_rng
from common.authored import add_root_flare


def oak_tree(spec: dict, root) -> None:
    params = spec["parameters"]
    rng = seeded_rng(spec["seed"])
    height = params["height"]
    spread = params["spread"]
    lean = params["lean"]
    wood, leaves, shadow = spec["palette"]

    add_cone(
        "oak_trunk", (lean * height * 0.25, 0, height * 0.34),
        0.48, 0.26, height * 0.68, wood, root, vertices=8,
        rotation=(0, lean * 0.16, lean * 0.09),
    )
    add_root_flare(
        "oak_root", (lean * height * 0.04, 0, 0), 0.92, 0.52, wood, root,
        count=params["rootCount"], seed=spec["seed"] + 1,
    )
    crown_center = (lean * height * 0.55, 0.0, height * 0.72)
    branch_count = params["branchCount"]
    for index in range(branch_count):
        angle = index * math.tau / branch_count + rng.uniform(-0.22, 0.22)
        start = (crown_center[0] * 0.55, 0, height * (0.46 + index * 0.025))
        end = (
            crown_center[0] + math.cos(angle) * spread * 0.62,
            math.sin(angle) * spread * 0.62,
            height * (0.67 + rng.uniform(-0.02, 0.08)),
        )
        add_beam(f"oak_branch_{index:02d}", start, end, 0.13 + rng.uniform(0.0, 0.035), wood, root, vertices=7)
        twig_end = (
            end[0] + math.cos(angle + 0.55) * spread * 0.28,
            end[1] + math.sin(angle + 0.55) * spread * 0.24,
            end[2] + height * rng.uniform(0.04, 0.10),
        )
        add_beam(f"oak_twig_{index:02d}", end, twig_end, 0.065, wood, root, vertices=6)

    cluster_count = params["canopyClusters"]
    for index in range(cluster_count):
        angle = index * 2.39996 + rng.uniform(-0.18, 0.18)
        radial = spread * (0.22 + 0.52 * ((index % 4) / 3))
        x = crown_center[0] + math.cos(angle) * radial
        y = math.sin(angle) * radial * 0.82
        z = height * (0.69 + 0.22 * ((index * 3) % 5) / 4) + rng.uniform(-0.12, 0.12)
        size = spread * rng.uniform(0.48, 0.68)
        token = shadow if index % 3 == 0 else leaves
        add_ico(
            f"oak_canopy_{index:02d}", (x, y, z),
            (size, size * rng.uniform(0.76, 0.94), size * rng.uniform(0.68, 0.86)),
            token, root, subdivisions=2,
            rotation=(rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2), angle * 0.3),
        )


def pine_tree(spec: dict, root) -> None:
    params = spec["parameters"]
    rng = seeded_rng(spec["seed"])
    height = params["height"]
    spread = params["spread"]
    lean = params["lean"]
    wood, pine, highlight = spec["palette"]
    add_cone("pine_trunk", (lean, 0, height * 0.43), 0.35, 0.16, height * 0.86, wood, root, vertices=8)
    add_root_flare("pine_root", (0, 0, 0), 0.72, 0.42, wood, root, count=params["rootCount"], seed=spec["seed"] + 1)
    tiers = params["tiers"]
    for index in range(tiers):
        progress = index / max(1, tiers - 1)
        radius = spread * (1.0 - progress * 0.68)
        tier_height = 1.25 - progress * 0.28
        z = 1.45 + index * (height - 1.75) / tiers
        token = highlight if index >= tiers - 2 else pine
        add_cone(
            f"pine_crown_{index:02d}", (lean * z / height, 0, z),
            radius, radius * 0.08, tier_height, token, root, vertices=10,
            rotation=(rng.uniform(-0.03, 0.03), rng.uniform(-0.03, 0.03), rng.uniform(-0.18, 0.18)),
        )
        if index < tiers - 1:
            for side in range(params["branchesPerTier"]):
                angle = index * 0.8 + side * math.tau / params["branchesPerTier"]
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


def apple_tree(spec: dict, root) -> None:
    params = spec["parameters"]
    rng = seeded_rng(spec["seed"])
    height = params["height"]
    spread = params["spread"]
    wood, leaves, fruit = spec["palette"]
    add_cone("apple_trunk", (0, 0, height * 0.34), 0.38, 0.22, height * 0.68, wood, root, vertices=8)
    add_root_flare("apple_root", (0, 0, 0), 0.74, 0.42, wood, root, count=params["rootCount"], seed=spec["seed"] + 1)
    for index in range(params["branchCount"]):
        angle = index * math.tau / params["branchCount"] + 0.4
        end = (math.cos(angle) * spread * 0.55, math.sin(angle) * spread * 0.55, height * (0.68 + 0.06 * (index % 2)))
        add_beam(
            f"apple_branch_{index:02d}", (0, 0, height * 0.47),
            end,
            0.11, wood, root, vertices=6,
        )
        add_beam(
            f"apple_twig_{index:02d}", end,
            (end[0] + math.cos(angle + 0.6) * spread * 0.26, end[1] + math.sin(angle + 0.6) * spread * 0.26, end[2] + height * 0.10),
            0.052, wood, root, vertices=6,
        )
    clusters = params["canopyClusters"]
    for index in range(clusters):
        angle = index * 2.39996
        radial = spread * (0.28 + 0.35 * (index % 3) / 2)
        size = spread * rng.uniform(0.48, 0.62)
        add_ico(
            f"apple_canopy_{index:02d}",
            (math.cos(angle) * radial, math.sin(angle) * radial * 0.8, height * (0.70 + 0.12 * (index % 2))),
            (size, size * 0.86, size * 0.74), leaves, root, subdivisions=2,
            rotation=(0.1 * math.sin(index), 0.08 * math.cos(index), angle * 0.2),
        )
    for index in range(params["fruitCount"]):
        angle = index * 2.39996
        radius = spread * (0.35 + 0.34 * ((index * 5) % 7) / 6)
        add_ico(
            f"apple_fruit_{index:02d}",
            (math.cos(angle) * radius, math.sin(angle) * radius * 0.72, height * (0.60 + 0.22 * ((index * 3) % 5) / 4)),
            (0.16, 0.15, 0.16), fruit, root, subdivisions=1,
        )
        add_cone(
            f"apple_stem_{index:02d}",
            (math.cos(angle) * radius, math.sin(angle) * radius * 0.72, height * (0.60 + 0.22 * ((index * 3) % 5) / 4) + 0.12),
            0.018, 0.010, 0.08, wood, root, vertices=5,
        )


def bush(spec: dict, root) -> None:
    params = spec["parameters"]
    rng = seeded_rng(spec["seed"])
    leaves, shadow, flower = spec["palette"]
    for index in range(params["clusters"]):
        angle = index * 2.39996
        radius = 0.16 + 0.36 * (index % 3) / 2
        add_ico(
            f"bush_cluster_{index:02d}",
            (math.cos(angle) * radius, math.sin(angle) * radius * 0.75, 0.43 + 0.11 * (index % 2)),
            (0.62 + rng.uniform(-0.08, 0.08), 0.52, 0.47),
            shadow if index == 0 else leaves, root, subdivisions=2,
            rotation=(rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2), angle),
        )
    for index in range(params["flowerCount"]):
        angle = index * 2.39996
        radius = 0.28 + 0.38 * ((index * 3) % 5) / 4
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
    for index in range(count):
        angle = index * 2.39996
        radius = 0.08 + 0.34 * ((index * 5) % count) / max(1, count - 1)
        x, y = math.cos(angle) * radius, math.sin(angle) * radius * 0.72
        height = params["height"] * rng.uniform(0.72, 1.0)
        lean_x, lean_y = rng.uniform(-0.08, 0.08), rng.uniform(-0.08, 0.08)
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
