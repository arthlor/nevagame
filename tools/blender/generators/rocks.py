"""Faceted rock family."""

from __future__ import annotations

import math

import bpy

from common.geometry import add_box, add_collision_primitives, add_cylinder, add_ico, add_tri_prism, apply_vertex_values, seeded_rng
from common.lod import consolidate_lod_level, create_lod_roots


def _shape_rock(rock, seed) -> None:
    rng = seeded_rng(seed)
    lean = rng.uniform(.04, .09)
    for vertex in rock.data.vertices:
        radial = 1.0 + 0.10 * math.sin(vertex.co.x * 2.7 + vertex.co.y * 3.1 + seed)
        vertex.co.x *= radial
        vertex.co.y *= 1.0 + 0.09 * math.cos(vertex.co.z * 2.2 + seed)
        vertex.co.z *= 1.0 + 0.08 * math.sin(vertex.co.x * 1.8 + seed)
        vertex.co.x += vertex.co.z * lean
    world_min_z = min((rock.matrix_world @ vertex.co).z for vertex in rock.data.vertices)
    rock.location.z -= world_min_z
    bpy.context.view_layer.update()
    rock.data.update()
    apply_vertex_values(rock)


def _decimate_facets(rock, ratio: float) -> None:
    modifier = rock.modifiers.new(name="NEVA_FacetReduction", type="DECIMATE")
    modifier.decimate_type = "COLLAPSE"
    modifier.ratio = ratio
    bpy.context.view_layer.objects.active = rock
    rock.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    world_min_z = min((rock.matrix_world @ vertex.co).z for vertex in rock.data.vertices)
    rock.location.z -= world_min_z
    bpy.context.view_layer.update()
    rock.data.update()
    apply_vertex_values(rock)


def _faceted_rock(spec: dict, root) -> None:
    rng = seeded_rng(spec["seed"])
    params = spec["parameters"]
    scale = params["scale"]
    profile = params["profile"]
    silhouette = params["silhouette"]
    lod_index = spec.get("_lodIndex", 0)
    base_token = spec["palette"][0]
    top_token = spec["palette"][1] if len(spec["palette"]) > 1 else base_token
    cluster_count = params["clusterCount"]
    profile_offsets = {
        "inland": [(0, 0, 1.0), (-0.42, 0.26, 0.50), (0.48, -0.20, 0.42)],
        "field": [(0, 0, 0.74), (-0.44, 0.24, 0.52), (0.46, -0.18, 0.46)],
    }
    coastal_offsets = {
        "spine": [(0.0, 0.0, 1.0), (-0.32, 0.18, 0.42), (0.36, -0.16, 0.36)],
        "shelf": [(0.0, 0.0, 0.72), (-0.54, 0.12, 0.46), (0.42, -0.12, 0.34)],
        "stack": [(0.0, 0.0, 0.70), (-0.20, 0.10, 1.18), (0.38, -0.16, 0.42)],
        "cleft": [(-0.28, 0.0, 0.86), (0.30, 0.08, 0.96), (0.0, -0.24, 0.34)],
        "cluster": [(0.0, 0.0, 0.82), (-0.42, 0.22, 0.48), (0.44, -0.18, 0.40)],
    }
    offsets = coastal_offsets[silhouette] if profile == "coastal" else profile_offsets[profile]
    scale_factors = {
        "spine": (1.0, 0.42, 0.34),
        "shelf": (1.0, 0.54, 0.38),
        "stack": (0.78, 0.58, 0.38),
        "cleft": (0.64, 0.68, 0.34),
        "cluster": (1.0, 0.48, 0.40),
    }[silhouette]
    for index in range(cluster_count):
        ox, oy, height_factor = offsets[index]
        factor = scale_factors[index]
        is_single_coastal_mass = profile == "coastal" and cluster_count == 1
        coastal_depth = 0.76 if silhouette == "spine" else 0.90 if silhouette == "shelf" else 0.84
        coastal_height = 1.18 if silhouette == "spine" else 0.72 if silhouette == "shelf" else 1.0
        rock = add_ico(
            f"rock_mass_{index:02d}",
            (ox * scale[0], oy * scale[1], scale[2] * height_factor),
            (
                scale[0] * factor,
                scale[1] * factor * (coastal_depth if profile == "coastal" else 1.0),
                scale[2] * factor * (coastal_height if profile == "coastal" else 1.0),
            ),
            base_token, root, subdivisions=4 if is_single_coastal_mass else 3,
            rotation=(
                params["tilt"] + rng.uniform(-0.12, 0.12),
                rng.uniform(-0.18, 0.18),
                rng.uniform(-0.52, 0.52),
            ),
        )
        _shape_rock(rock, spec["seed"] + index * 17)
        if lod_index > 0:
            _decimate_facets(rock, 0.13 if is_single_coastal_mass else 0.20)
        elif is_single_coastal_mass:
            _decimate_facets(rock, 0.60)
    fracture_count = 0 if lod_index > 0 else params["fractureCount"]
    for index in range(fracture_count):
        angle = index * math.tau / params["fractureCount"] + rng.uniform(-0.18, 0.18)
        if profile == "coastal":
            add_box(
                f"rock_fracture_slab_{index:02d}",
                (
                    math.cos(angle) * scale[0] * 0.42,
                    math.sin(angle) * scale[1] * 0.40,
                    scale[2] * (0.24 + (index % 2) * 0.10),
                ),
                (
                    scale[0] * 0.30,
                    scale[1] * 0.20,
                    scale[2] * 0.13,
                ),
                base_token,
                root,
                rotation=(rng.uniform(-0.10, 0.10), rng.uniform(-0.12, 0.12), angle), bevel=0.035,
            )
        else:
            add_tri_prism(
                f"rock_fracture_chip_{index:02d}",
                (math.cos(angle) * scale[0] * 0.62, math.sin(angle) * scale[1] * 0.52, 0.18 + index * 0.035),
                (scale[0] * 0.28, scale[1] * 0.24, scale[2] * 0.24), top_token, root,
                rotation=(rng.uniform(-0.16, 0.16), angle, angle),
            )
def faceted_rock(spec: dict, root) -> None:
    for lod_index, lod_root in create_lod_roots(spec, root):
        lod_spec = {**spec, "parameters": dict(spec["parameters"]), "_lodIndex": lod_index}
        _faceted_rock(lod_spec, lod_root)
        if spec.get("lodLevels"):
            prefix = f"{spec['id']}_LOD{lod_index}"
            for child in list(lod_root.children):
                child.name = f"{prefix}_{child.name.split('.')[0]}"
                if child.type == "MESH":
                    child.data.name = f"{child.name}_mesh"
            consolidate_lod_level(lod_root, prefix)
    # Collision belongs to the asset root, never to a switchable render level.
    add_collision_primitives(spec, root)


def pebble_cluster(spec: dict, root) -> None:
    params = spec["parameters"]
    rng = seeded_rng(spec["seed"])
    tokens = spec["palette"]
    count = params["count"]
    for index in range(count):
        angle = index * 2.39996 + rng.uniform(-0.22, 0.22)
        radius = params["spread"] * (0.18 + 0.74 * ((index * 5) % count) / max(1, count - 1))
        size = params["size"] * rng.uniform(0.62, 1.12)
        pebble = add_ico(
            f"pebble_{index:02d}",
            (math.cos(angle) * radius, math.sin(angle) * radius * 0.72, size * 0.28),
            (size, size * rng.uniform(0.62, 0.88), size * rng.uniform(0.38, 0.58)),
            tokens[index % len(tokens)], root, subdivisions=1,
            rotation=(rng.uniform(-0.28, 0.28), rng.uniform(-0.28, 0.28), angle),
        )
        _shape_rock(pebble, spec["seed"] + index * 23)
    consolidate_lod_level(root, f"{spec['id']}_cluster")


def path_slab(spec: dict, root) -> None:
    """Flat faceted stepping stone for packed dirt paths."""
    params = spec["parameters"]
    rng = seeded_rng(spec["seed"])
    token = spec["palette"][0]
    accent = spec["palette"][1] if len(spec["palette"]) > 1 else token
    radius = params["radius"]
    height = params["height"]
    sides = params["sides"]
    slab = add_cylinder(
        "path_slab_body",
        (0.0, 0.0, height * 0.5),
        radius,
        height,
        token,
        root,
        vertices=sides,
        rotation=(0.0, 0.0, rng.uniform(-0.18, 0.18)),
    )
    _shape_rock(slab, spec["seed"])
    chip_count = params["chipCount"]
    for index in range(chip_count):
        angle = index * 2.39996 + rng.uniform(-0.2, 0.2)
        chip_radius = radius * rng.uniform(0.42, 0.78)
        chip = add_ico(
            f"path_slab_chip_{index:02d}",
            (math.cos(angle) * chip_radius, math.sin(angle) * chip_radius * 0.82, height * 0.72),
            (radius * 0.22, radius * 0.18, height * 0.55),
            accent,
            root,
            subdivisions=1,
            rotation=(rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2), angle),
        )
        _shape_rock(chip, spec["seed"] + 17 * (index + 1))
    consolidate_lod_level(root, f"{spec['id']}_cluster")
