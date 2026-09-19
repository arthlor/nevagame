"""Authored cumulus silhouettes: broad banks and asymmetric billowing towers."""

from __future__ import annotations

import math
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
    phase = seeded_rng(seed).uniform(-math.pi, math.pi)
    for vertex in obj.data.vertices:
        # Broad coherent lobes preserve authored massing; no per-vertex chatter.
        x, y, z = vertex.co
        vertex.co.x *= 1 + .045 * math.sin(y * 1.3 + phase)
        vertex.co.y *= 1 + .04 * math.cos(x * 1.1 + phase)
        vertex.co.z *= 1 + .035 * math.sin(x + y + phase)
        if z > 0:
            vertex.co.z *= 1 + loft
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
    obj = add_ico(name, location, scale, token, root, subdivisions=subdivisions, rotation=rotation, normal_mode="rounded")
    _shape_cloud_lobe(obj, seed, loft=loft)


def _center_children(root) -> None:
    """Keep the catalog pivot at the local-space bounds centre, even under a transformed root."""
    meshes = [child for child in root.children if child.type == "MESH"]
    if not meshes:
        return
    bpy.context.view_layer.update()
    xs: list[float] = []
    ys: list[float] = []
    zs: list[float] = []
    for mesh in meshes:
        for vertex in mesh.data.vertices:
            world = root.matrix_world.inverted() @ mesh.matrix_world @ vertex.co
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



def _build_cloud_recipe(spec, root, kind):
    params = spec["parameters"]
    width, depth, height = (float(_required(params, key)) for key in ("width", "depth", "height"))
    requested = _required(params, "clusters")
    clusters = int(requested)
    if any(not math.isfinite(v) or v <= 0 for v in (width, depth, height)) or clusters < 1 or clusters != requested:
        raise ValueError("Cloud dimensions must be positive and clusters a positive integer")
    # Ordered anchors: the mass remains recognisable even with a small count.
    # Extra scallops stay on existing shoulders instead of increasing the footprint.
    bank = (
        ((0, 0, -.06), (.47, .40, .32)),
        ((-.32, .02, -.11), (.35, .31, .27)),
        ((.33, .03, -.11), (.31, .28, .26)),
        ((-.10, .02, .23), (.34, .32, .35)),
        ((.22, -.04, .14), (.27, .28, .28)),
        ((-.10, -.25, -.06), (.31, .24, .25)),
        ((.07, .25, -.08), (.30, .23, .24)),
        ((-.42, -.02, .06), (.20, .22, .22)),
    )
    tower = (
        ((-.04, 0, .00), (.38, .37, .40)),
        ((-.16, .02, .27), (.32, .32, .34)),
        ((.28, .02, -.16), (.33, .31, .29)),
        ((-.34, .04, -.16), (.31, .28, .28)),
        ((.20, -.05, .17), (.27, .26, .29)),
        ((-.04, -.25, -.13), (.31, .26, .29)),
        ((-.10, .23, -.09), (.31, .25, .27)),
        ((-.39, .03, .12), (.21, .22, .25)),
        ((.43, -.01, -.03), (.20, .21, .22)),
        ((-.09, -.19, .30), (.20, .21, .22)),
        ((.19, .22, .02), (.23, .22, .25)),
        ((-.26, -.19, .03), (.23, .24, .27)),
    )
    anchors = bank if kind == "bank" else tower
    for index in range(clusters):
        rng = seeded_rng(spec["seed"] + index*53 + 11)
        if index < len(anchors):
            location, scale = anchors[index]
            detail = 2
        else:
            # Per-index seeded selection is prefix-stable when count changes.
            j = index-len(anchors)
            angle = j*2.39996323+.35
            center, _ = anchors[j % len(anchors)]
            location = (max(-.49,min(.49,center[0]+.09*math.cos(angle))),
                        max(-.31,min(.31,center[1]+.09*math.sin(angle))),
                        max(-.16,min(.34,center[2]+.025*math.sin(angle))))
            r = rng.uniform(.12,.17)
            scale, detail = (r,r*.94,r*.88), 1
        _add_lobe(
            f"cloud_{kind}_{index:02d}", _scaled(location,width,depth,height),
            _scaled(scale,width,depth,height), _token(spec), root,
            spec["seed"]+11+index, loft=.035 if kind == "bank" else .055,
            rotation=(rng.uniform(-.04,.04),rng.uniform(-.04,.04),rng.uniform(-.06,.06)),
            subdivisions=detail,
        )


def _build_bank(spec: dict, root) -> None:
    """Build the bank recipe using the catalog's exact cluster count."""
    _build_cloud_recipe(spec, root, "bank")


def _build_tower(spec: dict, root) -> None:
    """Build the tower recipe using the catalog's exact cluster count."""
    _build_cloud_recipe(spec, root, "tower")


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


