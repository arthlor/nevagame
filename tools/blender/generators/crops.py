"""Distinct deterministic wheat-stage generators."""

from __future__ import annotations

import math

from common.geometry import add_beam, add_box, add_cone, add_cylinder, add_ico, add_tri_prism, seeded_rng


def wheat_crop(spec: dict, root) -> None:
    rng = seeded_rng(spec["seed"])
    stage = spec["parameters"]["stage"]
    tokens = spec["palette"]
    soil = tokens[0]
    plant = tokens[1]
    accent = tokens[2] if len(tokens) > 2 else plant
    add_cylinder("wheat_soil_mound", (0, 0, 0.04), 0.39, 0.08, soil, root, vertices=10, bevel=0.012)

    if stage == "seeded":
        for index in range(3):
            add_box(
                f"wheat_seeded_furrow_{index:02d}",
                (-0.22 + index * 0.22, 0, 0.085), (0.08, 0.62, 0.045), soil, root,
                rotation=(0, 0, math.radians(-3 + index * 3)), bevel=0.006,
            )

    if stage == "seeded":
        for index in range(5):
            angle = index * 2.39996
            add_ico(
                f"wheat_seed_{index:02d}",
                (math.cos(angle) * 0.16, math.sin(angle) * 0.16, 0.105),
                (0.055, 0.035, 0.025), plant, root, subdivisions=1,
                rotation=(0.2, angle, 0.1),
            )
        return

    stalk_count = spec["parameters"]["stalks"]
    stage_height = {
        "sprout": 0.27,
        "growing": 0.66,
        "mature": 1.02,
        "overripe": 0.92,
        "withered": 0.57,
    }[stage]
    for index in range(stalk_count):
        angle = index * 2.39996
        radius = 0.06 + 0.27 * ((index * 5) % max(2, stalk_count)) / max(1, stalk_count - 1)
        x, y = math.cos(angle) * radius, math.sin(angle) * radius
        height = stage_height * rng.uniform(0.82, 1.0)
        lean = 0.0
        if stage == "overripe":
            lean = 0.10 + 0.08 * (index % 3)
        elif stage == "withered":
            lean = 0.18 + 0.10 * (index % 2)
        end = (x + math.cos(angle) * lean, y + math.sin(angle) * lean, 0.09 + height)
        add_beam(f"wheat_stalk_{index:02d}", (x, y, 0.08), end, 0.018 if stage == "sprout" else 0.024, plant, root, vertices=5)
        leaf_count = {
            "sprout": 2,
            "growing": 1,
            "mature": 1 if index < 6 else 0,
            "overripe": 1 if index < 5 else 0,
            "withered": 1,
        }[stage]
        for leaf in range(leaf_count):
            leaf_angle = angle + (-0.55 if leaf == 0 else 0.55)
            add_tri_prism(
                f"wheat_leaf_{index:02d}_{leaf}",
                (x + math.cos(leaf_angle) * 0.07, y + math.sin(leaf_angle) * 0.07, 0.14 + height * (0.30 + leaf * 0.18)),
                (0.045, 0.018, height * 0.34), plant, root,
                rotation=(0.24 + lean, 0, leaf_angle),
            )
        if stage in ("growing", "mature", "overripe", "withered"):
            head_token = accent if stage != "withered" else plant
            add_cone(
                f"wheat_head_{index:02d}",
                (end[0], end[1], end[2] + 0.10),
                0.055 if stage == "growing" else 0.075,
                0.025, 0.22 if stage != "growing" else 0.14,
                head_token, root, vertices=6,
                rotation=(lean, 0, angle),
            )
