"""Faceted cloud generator."""

from __future__ import annotations

import math

from common.geometry import add_ico, seeded_rng


def faceted_cloud(spec: dict, root) -> None:
    rng = seeded_rng(spec["seed"])
    count = spec["parameters"]["clusters"]
    width = spec["parameters"]["width"]
    for index in range(count):
        progress = index / max(1, count - 1)
        x = (progress - 0.5) * width + rng.uniform(-0.25, 0.25)
        y = rng.uniform(-0.45, 0.45)
        z = math.sin(progress * math.pi) * 0.7 + rng.uniform(-0.12, 0.18)
        scale = 0.85 + math.sin(progress * math.pi) * 0.65
        token = spec["palette"][1] if index in (2, 4) else spec["palette"][0]
        add_ico(
            f"cloud_cluster_{index:02d}", (x, y, z),
            (scale * 1.35, scale * 0.7, scale * 0.65), token, root,
            subdivisions=2, rotation=(rng.uniform(-0.15, 0.15), rng.uniform(-0.2, 0.2), rng.uniform(-0.3, 0.3)),
        )
    for index, x in enumerate((-width * 0.22, width * 0.22)):
        add_ico(
            f"cloud_base_{index:02d}", (x, 0.08 * (-1 if index else 1), -0.28),
            (width * 0.28, 0.68, 0.34), spec["palette"][1], root,
            subdivisions=2, rotation=(0, 0, rng.uniform(-0.12, 0.12)),
        )
