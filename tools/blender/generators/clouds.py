"""Faceted sky clouds: cute, plump, bubbly spherical cotton-puff cumulus clouds."""

from __future__ import annotations

import bpy

from common.geometry import add_ico, apply_vertex_values, seeded_rng
from common.lod import consolidate_lod_level


def _required(params: dict, key: str):
    value = params.get(key)
    if value is None:
        raise ValueError(f"faceted_cloud requires explicit geometry parameter: {key}")
    return value


def _token(spec: dict) -> str:
    palette = spec["palette"]
    return palette[0]


def _shape_cloud_lobe(obj, seed: int, *, loft: float = 0.0) -> None:
    """Softly perturb vertices to give clean low-poly planar facets while keeping full bulbous roundness."""
    rng = seeded_rng(seed)
    for vertex in obj.data.vertices:
        vertex.co.x *= 1.0 + rng.uniform(-0.05, 0.06)
        vertex.co.y *= 1.0 + rng.uniform(-0.05, 0.06)
        vertex.co.z *= 1.0 + rng.uniform(-0.04, 0.06)
        if loft > 0.0 and vertex.co.z > 0.0:
            vertex.co.z *= 1.0 + loft
        vertex.co.x += rng.uniform(-0.004, 0.004)
        vertex.co.y += rng.uniform(-0.004, 0.004)
        vertex.co.z += rng.uniform(-0.004, 0.004)
    obj.data.update()
    apply_vertex_values(obj)


def _add_lobe(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    token: str,
    root,
    seed: int,
    *,
    loft: float,
    rotation: tuple[float, float, float],
    subdivisions: int,
) -> None:
    obj = add_ico(name, location, scale, token, root, subdivisions=subdivisions, rotation=rotation)
    _shape_cloud_lobe(obj, seed, loft=loft)


def _center_children(root) -> None:
    """Keep catalog pivot=center at the visual mass centroid."""
    meshes = [child for child in root.children if child.type == "MESH"]
    if not meshes:
        return
    bpy.context.view_layer.update()
    xs: list[float] = []
    ys: list[float] = []
    zs: list[float] = []
    for mesh in meshes:
        for vertex in mesh.data.vertices:
            world = mesh.matrix_world @ vertex.co
            xs.append(world.x)
            ys.append(world.y)
            zs.append(world.z)
    center = ((min(xs) + max(xs)) * 0.5, (min(ys) + max(ys)) * 0.5, (min(zs) + max(zs)) * 0.5)
    for mesh in meshes:
        mesh.location.x -= center[0]
        mesh.location.y -= center[1]
        mesh.location.z -= center[2]
    bpy.context.view_layer.update()


def _scaled(unit: tuple[float, ...], width: float, depth: float, height: float) -> tuple[float, float, float]:
    return (unit[0] * width, unit[1] * depth, unit[2] * height)


def _build_bank(spec: dict, root) -> None:
    """Cute, chubby, bubbly cotton puff: plump spherical marshmallow balls clustered naturally."""
    params = spec["parameters"]
    rng = seeded_rng(spec["seed"])
    width = float(_required(params, "width"))
    depth = float(_required(params, "depth"))
    height = float(_required(params, "height"))
    clusters = int(_required(params, "clusters"))
    token = _token(spec)

    # (unit_loc, unit_scale, loft, subdivisions)
    # Plump spherical lobes with balanced X/Y/Z dimensions
    lobes = (
        # Central large chubby core ball
        ((0.00, 0.00, 0.00), (0.46, 0.44, 0.44), 0.04, 2),
        # Round side cheeks
        ((-0.32, -0.02, -0.02), (0.38, 0.36, 0.36), 0.03, 2),
        ((0.32, 0.02, -0.02), (0.36, 0.34, 0.34), 0.03, 2),
        # Front & back rounded bellies
        ((0.00, -0.28, -0.02), (0.34, 0.34, 0.32), 0.02, 2),
        ((0.04, 0.26, 0.02), (0.32, 0.32, 0.30), 0.02, 2),
        # Top bubbly domes
        ((0.02, 0.02, 0.30), (0.34, 0.32, 0.32), 0.06, 2),
        ((-0.20, 0.04, 0.24), (0.28, 0.26, 0.26), 0.05, 2),
        ((0.20, -0.04, 0.22), (0.26, 0.24, 0.24), 0.05, 2),
    )
    for index, (unit_loc, unit_scale, loft, subdiv) in enumerate(lobes):
        _add_lobe(
            f"cloud_bank_{index:02d}",
            _scaled(unit_loc, width, depth, height),
            _scaled(unit_scale, width, depth, height),
            token,
            root,
            spec["seed"] + 11 + index,
            loft=loft,
            rotation=(rng.uniform(-0.06, 0.06), rng.uniform(-0.06, 0.06), rng.uniform(-0.08, 0.08)),
            subdivisions=subdiv,
        )
    extra = max(0, clusters - len(lobes))
    for index in range(extra):
        side = -1.0 if index % 2 else 1.0
        _add_lobe(
            f"cloud_bank_puff_{index:02d}",
            (side * width * (0.36 + index * 0.05), rng.uniform(-0.06, 0.06) * depth, height * (0.04 + index * 0.04)),
            (width * 0.18, depth * 0.18, height * 0.18),
            token,
            root,
            spec["seed"] + 41 + index,
            loft=0.03,
            rotation=(rng.uniform(-0.08, 0.08), rng.uniform(-0.08, 0.08), rng.uniform(-0.10, 0.10)),
            subdivisions=1,
        )


def _build_tower(spec: dict, root) -> None:
    """Cute grand billowing cloud cluster: expansive, fluffy, rounded cotton mounds."""
    params = spec["parameters"]
    rng = seeded_rng(spec["seed"])
    width = float(_required(params, "width"))
    depth = float(_required(params, "depth"))
    height = float(_required(params, "height"))
    clusters = int(_required(params, "clusters"))
    token = _token(spec)

    # (unit_loc, unit_scale, loft, subdivisions)
    lobes = (
        # Main central chubby ball
        ((0.00, 0.00, 0.02), (0.40, 0.38, 0.38), 0.04, 2),
        # Mid-flank round balls
        ((-0.28, 0.03, 0.00), (0.36, 0.34, 0.34), 0.03, 2),
        ((0.28, -0.03, 0.00), (0.34, 0.32, 0.32), 0.03, 2),
        # Outer flank rounded balls
        ((-0.44, -0.02, -0.02), (0.28, 0.26, 0.26), 0.02, 2),
        ((0.44, 0.02, -0.02), (0.26, 0.24, 0.24), 0.02, 2),
        # Front & back round bellies
        ((-0.12, -0.22, -0.02), (0.28, 0.28, 0.26), 0.02, 2),
        ((0.14, -0.20, -0.02), (0.26, 0.26, 0.24), 0.02, 2),
        ((-0.10, 0.22, 0.02), (0.26, 0.26, 0.24), 0.02, 2),
        ((0.12, 0.20, 0.04), (0.24, 0.24, 0.22), 0.02, 2),
        # Top billow crests
        ((-0.02, 0.04, 0.28), (0.32, 0.30, 0.30), 0.06, 2),
        ((-0.22, -0.02, 0.24), (0.28, 0.26, 0.26), 0.05, 2),
        ((0.20, 0.04, 0.22), (0.26, 0.24, 0.24), 0.05, 2),
    )
    for index, (unit_loc, unit_scale, loft, subdiv) in enumerate(lobes):
        _add_lobe(
            f"cloud_tower_{index:02d}",
            _scaled(unit_loc, width, depth, height),
            _scaled(unit_scale, width, depth, height),
            token,
            root,
            spec["seed"] + 17 + index,
            loft=loft,
            rotation=(rng.uniform(-0.06, 0.06), rng.uniform(-0.06, 0.06), rng.uniform(-0.08, 0.08)),
            subdivisions=subdiv,
        )
    extra = max(0, clusters - len(lobes))
    for index in range(extra):
        side = -1.0 if index % 2 else 1.0
        _add_lobe(
            f"cloud_tower_puff_{index:02d}",
            (side * width * (0.40 + index * 0.04), rng.uniform(-0.06, 0.06) * depth, height * (0.06 + index * 0.03)),
            (width * 0.16, depth * 0.16, height * 0.16),
            token,
            root,
            spec["seed"] + 53 + index,
            loft=0.03,
            rotation=(rng.uniform(-0.06, 0.06), rng.uniform(-0.06, 0.06), rng.uniform(-0.10, 0.10)),
            subdivisions=1,
        )


def faceted_cloud(spec: dict, root) -> None:
    variant = _required(spec["parameters"], "variant")
    if variant == "bank":
        _build_bank(spec, root)
    elif variant == "tower":
        _build_tower(spec, root)
    else:
        raise ValueError(f"Unknown faceted_cloud variant: {variant}")
    consolidate_lod_level(root, spec["id"])
    _center_children(root)


