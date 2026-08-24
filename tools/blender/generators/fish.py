"""Species-readable faceted fish generators."""

from __future__ import annotations

import math

from common.geometry import add_beam, add_ico, add_ring, add_tri_prism
from common.materials import get_or_create_material


def stylized_fish(spec: dict, root) -> None:
    params = spec["parameters"]
    species = params["species"]
    dorsal, belly, accent = spec["palette"]
    length, girth = params["length"], params["girth"]
    height = girth * (1.45 if species == "tuna" else 1.15)
    body = add_ico(
        f"{species}_body", (0, 0, 0),
        (girth, length * 0.5, height), dorsal, root,
        subdivisions=3, rotation=(0.04, 0.0, 0.0),
    )
    body.data.materials.append(get_or_create_material(belly))
    body.data.materials.append(get_or_create_material(accent))
    for polygon in body.data.polygons:
        if polygon.center.z < -height * 0.06:
            polygon.material_index = 1
        elif species == "trout" and polygon.index % 13 == 0:
            polygon.material_index = 2

    head_scale = 0.54 if species == "trout" else 0.62
    head = add_ico(
        f"{species}_head", (0, -length * 0.36, height * 0.03),
        (girth * head_scale, length * 0.20, height * 0.68), dorsal, root,
        subdivisions=3, rotation=(0.02, 0, 0),
    )
    head.data.materials.append(get_or_create_material(belly))
    for polygon in head.data.polygons:
        if polygon.center.z < -height * 0.08:
            polygon.material_index = 1
    add_ico(
        f"{species}_jaw", (0, -length * 0.50, -height * 0.20),
        (girth * 0.36, length * 0.10, height * 0.20), belly, root,
        subdivisions=2, rotation=(math.radians(-4), 0, 0),
    )
    add_ico(
        f"{species}_tail_stock", (0, length * 0.39, 0),
        (girth * 0.46, length * 0.18, height * 0.42), dorsal, root,
        subdivisions=2,
    )

    tail_y = length * 0.54
    add_tri_prism(f"{species}_tail_upper", (0, tail_y, height * 0.25), (girth * 0.16, length * 0.30, height * 1.25), accent, root, rotation=(0, 0, math.radians(8)))
    add_tri_prism(f"{species}_tail_lower", (0, tail_y, -height * 0.25), (girth * 0.16, length * 0.30, height * 1.25), accent, root, rotation=(math.pi, 0, math.radians(-8)))
    add_tri_prism(f"{species}_dorsal_fin", (0, -length * 0.05, height * 0.92), (girth * 0.18, length * 0.42, height * params["finScale"]), dorsal, root, rotation=(math.pi / 2, 0, 0))
    for side, x in (("left", -girth * 0.95), ("right", girth * 0.95)):
        add_tri_prism(f"{species}_pectoral_{side}", (x, -length * 0.10, -height * 0.05), (girth * 0.12, length * 0.46, height * 0.55), accent, root, rotation=(0, math.pi / 2, 0))
        add_ico(f"{species}_eye_{side}", (x * 0.78, -length * 0.38, height * 0.32), (0.045, 0.035, 0.045), dorsal, root, subdivisions=1)
        add_ring(
            f"{species}_eye_rim_{side}", (x * 0.80, -length * 0.38, height * 0.32),
            0.058, 0.012, accent, root, major_segments=8, minor_segments=4,
            rotation=(0, math.pi / 2, 0),
        )
        add_ico(
            f"{species}_gill_plate_{side}", (x * 0.62, -length * 0.28, height * 0.02),
            (girth * 0.12, length * 0.10, height * 0.48), accent, root,
            subdivisions=2,
        )
        add_tri_prism(
            f"{species}_pelvic_{side}", (x * 0.55, length * 0.05, -height * 0.65),
            (girth * 0.10, length * 0.22, height * 0.34), accent, root,
            rotation=(0, math.pi / 2, 0),
        )
    add_tri_prism(
        f"{species}_anal_fin", (0, length * 0.22, -height * 0.70),
        (girth * 0.16, length * 0.28, height * 0.38), accent, root,
        rotation=(-math.pi / 2, 0, 0),
    )
    if species == "trout":
        add_tri_prism(
            "trout_adipose_fin", (0, length * 0.26, height * 0.68),
            (girth * 0.12, length * 0.14, height * 0.22), accent, root,
            rotation=(math.pi / 2, 0, 0),
        )
        for index in range(6):
            angle = index * 2.39996
            add_ico(
                f"trout_spot_{index:02d}",
                (math.cos(angle) * girth * 0.78, -length * 0.12 + index * length * 0.055, height * (0.08 + 0.10 * (index % 2))),
                (0.045, 0.030, 0.045), accent, root, subdivisions=1,
            )
    if species == "tuna":
        for index in range(4):
            y = length * (0.18 + index * 0.07)
            add_tri_prism(f"tuna_finlet_{index:02d}", (0, y, height * 0.77), (girth * 0.10, length * 0.10, height * 0.24), accent, root, rotation=(math.pi / 2, 0, 0))
            add_tri_prism(f"tuna_finlet_lower_{index:02d}", (0, y, -height * 0.77), (girth * 0.10, length * 0.10, height * 0.24), accent, root, rotation=(-math.pi / 2, 0, 0))
