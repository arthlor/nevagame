"""Faceted rock family."""

from __future__ import annotations

import math

import bpy

from common.geometry import add_box, add_collision_box, add_ico, add_tri_prism, apply_vertex_values, seeded_rng
from common.materials import get_or_create_material


def _shape_rock(rock, scale, seed, base_token, top_token) -> None:
    rng = seeded_rng(seed)
    for vertex in rock.data.vertices:
        radial = 1.0 + 0.10 * math.sin(vertex.co.x * 2.7 + vertex.co.y * 3.1 + seed)
        vertex.co.x *= radial
        vertex.co.y *= 1.0 + 0.09 * math.cos(vertex.co.z * 2.2 + seed)
        vertex.co.z *= 1.0 + 0.08 * math.sin(vertex.co.x * 1.8 + seed)
        vertex.co.x += vertex.co.z * rng.uniform(0.04, 0.09)
    world_min_z = min((rock.matrix_world @ vertex.co).z for vertex in rock.data.vertices)
    rock.location.z -= world_min_z
    bpy.context.view_layer.update()
    rock.data.materials.append(get_or_create_material(top_token))
    rock.data.update()
    for polygon in rock.data.polygons:
        polygon.material_index = 1 if polygon.center.z > scale[2] * 0.18 and polygon.normal.z > 0.35 else 0
    apply_vertex_values(rock)


def faceted_rock(spec: dict, root) -> None:
    rng = seeded_rng(spec["seed"])
    params = spec["parameters"]
    scale = params["scale"]
    profile = params["profile"]
    base_token = spec["palette"][0]
    top_token = spec["palette"][1] if len(spec["palette"]) > 1 else base_token
    cluster_count = params["clusterCount"]
    offsets = {
        "inland": [(0, 0, 1.0), (-0.42, 0.26, 0.50), (0.48, -0.20, 0.42)],
        "coastal": [(0, 0, 1.0), (-0.48, 0.14, 0.46), (0.52, -0.08, 0.38)],
        "field": [(0, 0, 0.74), (-0.44, 0.24, 0.52), (0.46, -0.18, 0.46)],
    }[profile]
    scale_factors = (1.0, 0.48, 0.40)
    for index in range(cluster_count):
        ox, oy, height_factor = offsets[index]
        factor = scale_factors[index]
        rock = add_ico(
            f"rock_mass_{index:02d}",
            (ox * scale[0], oy * scale[1], scale[2] * height_factor),
            (scale[0] * factor, scale[1] * factor * (0.86 if profile == "coastal" else 1.0), scale[2] * factor),
            base_token, root, subdivisions=3,
            rotation=(rng.uniform(-0.18, 0.18), rng.uniform(-0.18, 0.18), rng.uniform(-0.65, 0.65)),
        )
        _shape_rock(rock, [value * factor for value in scale], spec["seed"] + index * 17, base_token, top_token)
    for index in range(params["fractureCount"]):
        angle = index * math.tau / params["fractureCount"] + rng.uniform(-0.18, 0.18)
        if profile == "coastal":
            add_box(
                f"rock_fracture_slab_{index:02d}",
                (math.cos(angle) * scale[0] * 0.55, math.sin(angle) * scale[1] * 0.48, 0.18 + index * 0.05),
                (scale[0] * 0.36, scale[1] * 0.24, scale[2] * 0.16), top_token, root,
                rotation=(rng.uniform(-0.10, 0.10), rng.uniform(-0.12, 0.12), angle), bevel=0.035,
            )
        else:
            add_tri_prism(
                f"rock_fracture_chip_{index:02d}",
                (math.cos(angle) * scale[0] * 0.62, math.sin(angle) * scale[1] * 0.52, 0.18 + index * 0.035),
                (scale[0] * 0.28, scale[1] * 0.24, scale[2] * 0.24), top_token, root,
                rotation=(rng.uniform(-0.16, 0.16), angle, angle),
            )
    if spec["collision"] != "none":
        add_collision_box(
            f"COL_{spec['id']}", (0, 0, scale[2] * 0.65),
            (scale[0] * 1.65, scale[1] * 1.65, scale[2] * 1.3), root,
        )
