"""Working rowboat and fishing-skiff generators."""

from __future__ import annotations

import math

import bmesh
import bpy

from common.geometry import add_beam, add_box, add_collision_primitives, add_cylinder, add_grip_marker, add_ico, add_marker, add_ring, add_tri_prism, apply_vertex_values, join_meshes, set_surface_normals
from common.materials import get_or_create_material
from common.authored import add_catenary_rope, add_lattice, add_plank_field, add_rope_line
from common.lod import consolidate_lod_level

from collections import defaultdict


def _join_direct_meshes(parent, prefix: str, preserve_names=()) -> None:
    """Join same-material direct children, keeping named gameplay hooks intact."""
    preserve = set(preserve_names)
    groups = defaultdict(list)
    for obj in list(parent.children):
        if obj.type != "MESH" or obj.name in preserve:
            continue
        material_key = tuple(material.name for material in obj.data.materials if material is not None)
        groups[material_key].append(obj)
    for group_index, objects in enumerate(groups.values()):
        joined_name = f"{prefix}_material_{group_index:02d}"
        if len(objects) == 1:
            joined = objects[0]
            joined.name = joined_name
            joined.data.name = f"{joined_name}_mesh"
        else:
            joined = join_meshes(objects, joined_name)
        if joined is None:
            continue
        joined.parent = parent
        apply_vertex_values(joined)



def _hull_half_width(y: float, half_length: float, beam: float, fullness: float = 0.72) -> float:
    normalized = min(1.0, abs(y) / half_length)
    return beam * 0.5 * max(0.12, (1.0 - normalized**1.8) ** fullness)


def _planked_hull(prefix: str, length: float, beam: float, segments: int, levels: int, tokens: tuple[str, str], root) -> None:
    half_length = length * 0.5
    segment_length = length / segments
    _add_continuous_skiff_shell(length, beam, segments, tokens[0], tokens[1], tokens[1], root,
                                rowboat=True)
    add_beam(f"{prefix}_keel", (0, -half_length, -0.46), (0, half_length, -0.42), 0.11, tokens[1], root, vertices=7)
    for index in range(segments + 1):
        y = -half_length + index * segment_length
        width = _hull_half_width(y, half_length, beam) * 0.82
        add_beam(f"{prefix}_rib_{index:02d}", (-width, y, -0.28), (width, y, -0.28), 0.06, tokens[1], root, vertices=6)


def _finish_authored_mesh(name: str, vertices, faces, material_indices, tokens, root):
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.clear()
    for token in tokens:
        mesh.materials.append(get_or_create_material(token))
    mesh.validate(clean_customdata=False)
    mesh.update(calc_edges=True)
    edit_mesh = bmesh.new()
    edit_mesh.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(edit_mesh, faces=edit_mesh.faces)
    edit_mesh.to_mesh(mesh)
    edit_mesh.free()
    for polygon, material_index in zip(mesh.polygons, material_indices, strict=True):
        polygon.material_index = material_index
        polygon.use_smooth = False
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = root
    apply_vertex_values(obj)
    return obj


def _skiff_station(length: float, beam: float, index: int, segments: int):
    progress = index / max(1, segments)
    y = -length * 0.5 + length * progress
    end_factor = abs(progress * 2.0 - 1.0)
    bow_bias = 1.0 + (0.20 if progress < 0.5 else -0.08)
    rise = end_factor**2.7 * 0.48 * bow_bias
    half_width = _hull_half_width(y, length * 0.5, beam, fullness=0.64)
    sheer = 0.49 + rise
    chine = -0.17 + rise * 0.48
    keel = -0.53 + rise * 0.30
    return y, half_width, sheer, chine, keel


def _add_continuous_skiff_shell(
    length: float,
    beam: float,
    segments: int,
    honey: str,
    dark: str,
    red: str,
    root,
    *, rowboat=False,
) -> None:
    """Create one closed outer/inner working hull instead of box fragments."""
    vertices = []
    outer_rings = []
    inner_rings = []
    shell_thickness = max(0.11, beam * 0.05)
    for index in range(segments + 1):
        y, half_width, sheer, chine, keel = _skiff_station(length, beam, index, segments)
        if rowboat:
            # Retain the rowboat's seat, gunwale and waterline envelope.
            half_width = _hull_half_width(y, length * .5, beam)
            sheer, chine, keel = .52, -.22, -.43
        outer = (
            (-half_width, y, sheer),
            (-half_width * 0.72, y, chine),
            (0.0, y, keel),
            (half_width * 0.72, y, chine),
            (half_width, y, sheer),
        )
        inner_width = max(0.03, half_width - shell_thickness)
        inner = (
            (-inner_width, y, sheer - 0.055),
            (-inner_width * 0.66, y, chine + shell_thickness),
            (0.0, y, keel + shell_thickness * 1.15),
            (inner_width * 0.66, y, chine + shell_thickness),
            (inner_width, y, sheer - 0.055),
        )
        outer_rings.append(tuple(range(len(vertices), len(vertices) + len(outer))))
        vertices.extend(outer)
        inner_rings.append(tuple(range(len(vertices), len(vertices) + len(inner))))
        vertices.extend(inner)

    faces = []
    materials = []
    for station in range(segments):
        outer_current, outer_next = outer_rings[station], outer_rings[station + 1]
        inner_current, inner_next = inner_rings[station], inner_rings[station + 1]
        for band in range(4):
            faces.append((outer_current[band], outer_next[band], outer_next[band + 1], outer_current[band + 1]))
            # Isolated sheet: red lower hull, honey upper strakes.
            materials.append(2 if band in (1, 2) else 0)
            faces.append((inner_current[band + 1], inner_next[band + 1], inner_next[band], inner_current[band]))
            materials.append(0 if band in (0, 3) else 1)
        faces.append((outer_current[0], inner_current[0], inner_next[0], outer_next[0]))
        materials.append(2)
        faces.append((outer_current[4], outer_next[4], inner_next[4], inner_current[4]))
        materials.append(2)

    for ring_index in (0, segments):
        outer, inner = outer_rings[ring_index], inner_rings[ring_index]
        for band in range(4):
            faces.append((outer[band], outer[band + 1], inner[band + 1], inner[band]))
            materials.append(1)
    hull = _finish_authored_mesh("rowboat_hull_shell" if rowboat else "skiff_hull_shell",
                                vertices, faces, materials, (honey, dark, red), root)
    set_surface_normals(hull, "rounded", faces=range(segments * 10))
    # Smoothing follows each strake length; the longitudinal chines and rim
    # remain structural edges regardless of their palette region.
    for edge in hull.data.edges:
        a, b = edge.vertices
        if abs(a - b) == 10:
            edge.use_edge_sharp = True


def _add_skiff_keel(length: float, beam: float, segments: int, token: str, root) -> None:
    vertices = []
    rings = []
    for index in range(segments + 1):
        y, _, _, _, keel = _skiff_station(length, beam, index, segments)
        end_factor = abs(index / max(1, segments) * 2.0 - 1.0)
        half_width = beam * (0.030 + end_factor * 0.008)
        top = keel + 0.025
        bottom = keel - (0.19 - end_factor * 0.055)
        rings.append(tuple(range(len(vertices), len(vertices) + 4)))
        vertices.extend(((-half_width, y, top), (half_width, y, top), (half_width, y, bottom), (-half_width, y, bottom)))
    faces = []
    for station in range(segments):
        current, following = rings[station], rings[station + 1]
        for side in range(4):
            faces.append((current[side], following[side], following[(side + 1) % 4], current[(side + 1) % 4]))
    faces.extend((rings[0], tuple(reversed(rings[-1]))))
    _finish_authored_mesh("skiff_keel", vertices, faces, [0] * len(faces), (token,), root)


def _add_skiff_strake(
    name: str,
    length: float,
    beam: float,
    segments: int,
    side: int,
    level: float,
    token: str,
    root,
) -> None:
    vertices = []
    rings = []
    for index in range(segments + 1):
        y, half_width, sheer, chine, _ = _skiff_station(length, beam, index, segments)
        x = side * half_width * (0.72 + 0.28 * level)
        z = chine + (sheer - chine) * level
        outward = side * 0.07
        rings.append(tuple(range(len(vertices), len(vertices) + 4)))
        vertices.extend(
            (
                (x, y, z - 0.06),
                (x, y, z + 0.06),
                (x + outward, y, z + 0.045),
                (x + outward, y, z - 0.045),
            )
        )
    faces = []
    for station in range(segments):
        current, following = rings[station], rings[station + 1]
        for edge in range(4):
            faces.append((current[edge], following[edge], following[(edge + 1) % 4], current[(edge + 1) % 4]))
    faces.extend((rings[0], tuple(reversed(rings[-1]))))
    _finish_authored_mesh(name, vertices, faces, [0] * len(faces), (token,), root)


def _add_working_sail(name: str, mast_height: float, token: str, root, *, rows: int = 8) -> None:
    """Build a thick, billowing mainsail with faceted folds in the boat Y/Z plane."""
    thickness = 0.085
    height_steps = max(4, rows // 2)
    width_steps = 5
    vertices = []
    for side in (-1.0, 1.0):
        for row in range(height_steps + 1):
            v = row / height_steps
            z = mast_height * (0.32 + v * 0.58)
            max_width = 2.72 * (1.0 - v * 0.82)
            for col in range(width_steps + 1):
                u = col / width_steps
                y = 0.10 + max_width * u
                billow = math.sin(u * math.pi) * math.sin(v * math.pi) * 0.34
                fold = math.sin(u * math.pi * 2.0) * 0.06 * (1.0 - v)
                vertices.append((side * thickness + billow + fold, y, z))
    faces = []
    def _idx(side, row, col):
        return side * (height_steps + 1) * (width_steps + 1) + row * (width_steps + 1) + col
    for row in range(height_steps):
        for col in range(width_steps):
            a = _idx(0, row, col)
            b = _idx(0, row, col + 1)
            c = _idx(0, row + 1, col + 1)
            d = _idx(0, row + 1, col)
            faces.append((a, b, c, d))
            a = _idx(1, row, col)
            b = _idx(1, row + 1, col)
            c = _idx(1, row + 1, col + 1)
            d = _idx(1, row, col + 1)
            faces.append((a, b, c, d))
    for row in range(height_steps):
        faces.append((_idx(0, row, 0), _idx(0, row + 1, 0), _idx(1, row + 1, 0), _idx(1, row, 0)))
        faces.append((
            _idx(0, row, width_steps), _idx(1, row, width_steps),
            _idx(1, row + 1, width_steps), _idx(0, row + 1, width_steps),
        ))
    for col in range(width_steps):
        faces.append((_idx(0, 0, col), _idx(1, 0, col), _idx(1, 0, col + 1), _idx(0, 0, col + 1)))
        faces.append((
            _idx(0, height_steps, col), _idx(0, height_steps, col + 1),
            _idx(1, height_steps, col + 1), _idx(1, height_steps, col),
        ))
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(get_or_create_material(token))
    mesh.validate(clean_customdata=False)
    mesh.update(calc_edges=True)
    for polygon in mesh.polygons:
        polygon.use_smooth = False
    sail = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(sail)
    sail.parent = root
    apply_vertex_values(sail)


def _add_topsail(name: str, mast_height: float, token: str, root) -> None:
    """Small rectangular topsail with slight billow, matching the isolated sheet."""
    thickness = 0.06
    z0, z1 = mast_height * 0.78, mast_height * 0.96
    y0, y1 = 0.08, 1.15
    vertices = []
    for side in (-1.0, 1.0):
        for y, z, billow in (
            (y0, z0, 0.02),
            (y1, z0, 0.16),
            (y1, z1, 0.10),
            (y0, z1, 0.01),
        ):
            vertices.append((side * thickness + billow, y, z))
    faces = (
        (0, 1, 2, 3),
        (4, 7, 6, 5),
        (0, 4, 5, 1),
        (1, 5, 6, 2),
        (2, 6, 7, 3),
        (3, 7, 4, 0),
    )
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(get_or_create_material(token))
    for polygon in mesh.polygons:
        polygon.use_smooth = False
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = root
    apply_vertex_values(obj)


def _add_deck_crate(prefix: str, center, size: float, wood: str, dark: str, root) -> None:
    cx, cy, cz = center
    add_box(f"{prefix}_body", (cx, cy, cz + size * 0.5), (size, size, size), wood, root, bevel=0.02)
    add_box(f"{prefix}_frame_l", (cx - size * 0.48, cy, cz + size * 0.5), (0.07, size, size), dark, root, bevel=0.01)
    add_box(f"{prefix}_frame_r", (cx + size * 0.48, cy, cz + size * 0.5), (0.07, size, size), dark, root, bevel=0.01)
    add_beam(
        f"{prefix}_brace_a",
        (cx - size * 0.42, cy - size * 0.50, cz + size * 0.16),
        (cx + size * 0.42, cy - size * 0.50, cz + size * 0.84),
        0.028, dark, root, vertices=6,
    )
    add_beam(
        f"{prefix}_brace_b",
        (cx + size * 0.42, cy - size * 0.50, cz + size * 0.16),
        (cx - size * 0.42, cy - size * 0.50, cz + size * 0.84),
        0.028, dark, root, vertices=6,
    )

def rowboat(spec: dict, root) -> None:
    honey, warm, dark = spec["palette"]
    params = spec["parameters"]
    length, beam = params["length"], params["beam"]
    _planked_hull("rowboat", length, beam, params["ribCount"], 3, (honey, warm), root)
    half_length = length * 0.5
    for segment in range(params["innerPlanks"]):
        y = -half_length * 0.82 + segment * length * 0.82 / max(1, params["innerPlanks"] - 1)
        width = _hull_half_width(y, half_length, beam) * 0.74
        for side in (-1, 1):
            add_box(
                f"rowboat_inner_plank_{segment:02d}_{'left' if side < 0 else 'right'}",
                (side * width, y, 0.02), (0.13, length / params["innerPlanks"] * 0.90, 0.42),
                warm if segment % 3 else dark, root,
                rotation=(side * math.radians(18), 0, 0), bevel=0.022,
            )
    for side in (-1, 1):
        points = []
        for index in range(params["gunwaleSegments"] + 1):
            y = -half_length * 0.92 + index * length * 0.92 / params["gunwaleSegments"]
            points.append((side * _hull_half_width(y, half_length, beam) * 0.98, y, 0.52))
        add_rope_line(f"rowboat_gunwale_{'left' if side < 0 else 'right'}", points, 0.07, dark, root, vertices=7)
    add_beam("rowboat_stem", (0, -half_length * 0.98, -0.35), (0, -half_length * 1.02, 0.62), 0.085, dark, root, vertices=7)
    add_beam("rowboat_stern", (0, half_length * 0.98, -0.35), (0, half_length * 1.02, 0.62), 0.085, dark, root, vertices=7)
    for index, y in enumerate((-0.78, 0.18, 0.92)):
        width = _hull_half_width(y, length * 0.5, beam) * 1.55
        add_box(f"rowboat_bench_{index}", (0, y, 0.36), (width, 0.32, 0.10), dark, root, bevel=0.028)
    add_plank_field(
        "rowboat_floorboard", (0, 0.05, -0.12), beam * 0.54, length * 0.58, 0.07,
        (honey, warm), root, count=10, axis="y", bevel=0.014,
    )
    add_box(
        "rowboat_foot_stretcher", (0, -0.23, 0.03), (0.62, 0.08, 0.20),
        dark, root, rotation=(math.radians(-12), 0, 0), bevel=0.018,
    )
    add_marker("boat_rowboat_rower_seat", (0, 0.18, 0.42), root, marker_type="pelvis_contact")
    for side_name, side in (("left", 1), ("right", -1)):
        support = add_marker(
            f"boat_rowboat_foot_{side_name}_socket",
            (side * 0.16, -0.23 + math.sin(math.radians(12)) * 0.10,
             0.03 + math.cos(math.radians(12)) * 0.10), root, marker_type="foot_support",
        )
        support.rotation_euler = (math.radians(-12), 0, 0)
    for side_name, side in (("left", 1), ("right", -1)):
        grip = (side * 0.24, 0.02, 0.80)
        blade_center = (side * 0.70, 0.44, 0.50)
        blade_end = (side * 0.88, 0.52, 0.47)
        oar_root = add_marker(
            f"boat_rowboat_oar_{side_name}_root", grip, root, marker_type="oar_pivot"
        )
        shaft = add_beam(
            f"rowboat_oar_{side_name}_shaft", grip, blade_end,
            0.045, warm, root, vertices=7,
        )
        dx = blade_end[0] - grip[0]
        dy = blade_end[1] - grip[1]
        blade_rotation = math.atan2(-dx, dy)
        blade = add_box(
            f"rowboat_oar_{side_name}_blade", blade_center, (0.24, 0.64, 0.075), warm, root,
            rotation=(0, 0, blade_rotation), bevel=0.025,
        )
        bpy.context.view_layer.update()
        for part in (shaft, blade):
            world_matrix = part.matrix_world.copy()
            part.parent = oar_root
            part.matrix_world = world_matrix
        join_meshes((shaft, blade), f"rowboat_oar_{side_name}")
        add_grip_marker(
            f"boat_rowboat_oar_{side_name}_grip", (0, 0, 0.022), oar_root,
            fingers=(-side * dy, side * dx, 0), contact_normal=(0, 0, -1),
        )
        add_ring(
            f"boat_rowboat_oarlock_{side_name}", (side * 0.78, 0.04, 0.57),
            0.09, 0.022, dark, root, major_segments=8, minor_segments=4,
            rotation=(math.pi / 2, 0, 0),
        )
    add_box("rowboat_storage", (0, -1.35, 0.30), (beam * 0.62, 0.65, 0.38), dark, root, bevel=0.045)
    add_marker("boat_rowboat_storage_01", (0, -1.35, 0.52), root, marker_type="storage")
    add_rope_line(
        "rowboat_painter", [(0, -half_length, 0.52), (0.08, -half_length - 0.38, 0.34), (-0.12, -half_length - 0.72, 0.18)],
        0.035, warm, root, vertices=7,
    )
    add_box("rowboat_transom_cap", (0, half_length * 0.99, 0.28), (beam * 0.62, 0.10, 0.62), dark, root, bevel=0.02)
    add_box("rowboat_bow_cap", (0, -half_length * 0.99, 0.28), (beam * 0.34, 0.10, 0.62), dark, root, bevel=0.02)
    for index, y in enumerate((-0.40, 0.55)):
        add_box(f"rowboat_knee_{index}", (0, y, 0.22), (beam * 0.70, 0.10, 0.16), dark, root, bevel=0.016)
    add_box("rowboat_keelson", (0, 0.0, -0.22), (0.16, length * 0.62, 0.10), dark, root, bevel=0.012)
    _join_direct_meshes(
        root, spec["id"],
        preserve_names=(
            "boat_rowboat_oarlock_left",
            "boat_rowboat_oarlock_right",
        ),
    )
    add_collision_primitives(spec, root)



def fishing_skiff(spec: dict, root) -> None:
    honey, dark, red, canvas = spec["palette"]
    params = spec["parameters"]
    length, beam = params["length"], params["beam"]
    hull_segments = params["hullSegments"]
    _add_continuous_skiff_shell(length, beam, hull_segments, honey, dark, red, root)
    _add_skiff_keel(length, beam, hull_segments, dark, root)
    strake_count = params["outerStrakes"]
    for side, side_name in ((-1, "left"), (1, "right")):
        for strake in range(strake_count):
            level = 0.18 + strake * 0.70 / max(1, strake_count - 1)
            token = red if strake == 0 else honey if strake == strake_count - 1 else dark
            _add_skiff_strake(
                f"skiff_strake_{side_name}_{strake:02d}", length, beam, hull_segments,
                side, level, token, root,
            )
    half_length = length * 0.5
    for rib in range(1, params["ribCount"]):
        y = -half_length + length * rib / params["ribCount"]
        width = _hull_half_width(y, half_length, beam) * 0.70
        _, _, _, chine, _ = _skiff_station(length, beam, round(rib * hull_segments / params["ribCount"]), hull_segments)
        add_beam(f"skiff_rib_{rib:02d}", (-width, y, chine + 0.12), (width, y, chine + 0.12), 0.055, dark, root, vertices=6)

    deck_count = params["deckBoards"]
    for index in range(deck_count):
        y = -length * 0.43 + index * length * 0.86 / max(1, deck_count - 1)
        width = _hull_half_width(y, length * 0.5, beam) * 1.35
        add_box(f"skiff_deck_{index:02d}", (0, y, 0.58), (width, 0.28, 0.09), honey if index % 4 else dark, root, bevel=0.018)
    for side, side_name in ((-1, "left"), (1, "right")):
        gunwale_points = []
        for index in range(hull_segments + 1):
            y, width, sheer, _, _ = _skiff_station(length, beam, index, hull_segments)
            gunwale_points.append((side * width, y, sheer + 0.015))
        add_rope_line(
            f"skiff_gunwale_{side_name}", gunwale_points, 0.12, honey, root, vertices=7,
        )
        add_plank_field(
            f"skiff_caprail_{side_name}",
            (side * beam * 0.46, 0.05, 0.94),
            0.18,
            length * 0.78,
            0.12,
            (honey, dark),
            root,
            count=max(8, hull_segments // 2),
            axis="y",
            bevel=0.014,
        )

    # Raised stern deck matching the isolated working sailboat
    add_box("skiff_stern_deck", (0, half_length * 0.62, 0.78), (beam * 0.72, 1.15, 0.16), honey, root, bevel=0.03)
    add_box("skiff_bow_deck", (0, -half_length * 0.62, 0.74), (beam * 0.48, 0.95, 0.14), honey, root, bevel=0.03)
    add_marker(
        "boat_skiff_driver_station",
        (0, half_length * 0.56, 0.86),
        root,
        marker_type="standing_station",
    )
    add_marker(
        "boat_skiff_fishing_station",
        (beam * 0.25, -half_length * 0.24, 0.68),
        root,
        marker_type="standing_station",
    )
    add_beam("skiff_bowsprit", (0, -half_length * 0.92, 0.78), (0, -half_length * 1.18, 0.86), 0.07, dark, root, vertices=7)

    _add_deck_crate("skiff_crate_a", (-0.38, 0.18, 0.66), 0.52, honey, dark, root)
    _add_deck_crate("skiff_crate_b", (0.38, 0.42, 0.66), 0.48, honey, dark, root)
    add_cylinder("skiff_barrel", (0.02, 1.05, 0.92), 0.28, 0.52, dark, root, vertices=10, bevel=0.02)
    add_ring("skiff_barrel_band_a", (0.02, 1.05, 0.78), 0.29, 0.025, dark, root, major_segments=10, minor_segments=4)
    add_ring("skiff_barrel_band_b", (0.02, 1.05, 1.06), 0.29, 0.025, dark, root, major_segments=10, minor_segments=4)
    for index, (x, y) in enumerate(((-0.55, 1.45), (-0.28, 1.52), (0.22, 1.48))):
        add_box(f"skiff_weight_{index:02d}", (x, y, 0.72), (0.22, 0.18, 0.14), dark, root, bevel=0.012)
    add_marker("boat_skiff_cargo_01", (-0.38, 0.18, 1.20), root, marker_type="cargo")
    add_marker("boat_skiff_cargo_02", (0.38, 0.42, 1.18), root, marker_type="cargo")

    mast_height = params["mastHeight"]
    add_beam("skiff_mast", (0, 0.0, 0.62), (0, 0.0, mast_height), 0.13, honey, root, vertices=8)
    add_beam("skiff_boom", (0, 0, mast_height * 0.34), (0, 2.86, mast_height * 0.36), 0.085, honey, root, vertices=7)
    add_beam("skiff_yard_main", (0, -0.15, mast_height * 0.90), (0, 0.55, mast_height * 0.90), 0.06, honey, root, vertices=6)
    add_beam("skiff_yard_top", (0, -0.08, mast_height * 0.96), (0, 1.20, mast_height * 0.96), 0.05, honey, root, vertices=6)
    _add_working_sail("skiff_sail", mast_height, canvas, root, rows=params["sailRows"])
    _add_topsail("skiff_topsail", mast_height, canvas, root)
    add_tri_prism(
        "skiff_pennant",
        (0.04, 0.22, mast_height + 0.18),
        (0.04, 0.42, 0.22),
        red,
        root,
        rotation=(math.radians(-12), 0, 0),
    )
    for row in range(params["sailRows"]):
        progress = row / max(1, params["sailRows"] - 1)
        z = mast_height * (0.34 + progress * 0.50)
        width = max(0.40, 2.55 * (1.0 - progress))
        add_box(
            f"skiff_sail_seam_{row:02d}", (0.12, 0.12 + width * 0.5, z),
            (0.045, width, 0.045), red if row % 3 == 0 else canvas, root,
            bevel=0.008,
        )
    for index in range(5):
        side_sign = -1 if index % 2 else 1
        add_catenary_rope(
            f"skiff_rigging_{index:02d}",
            (0, 0, mast_height * (0.42 + index * 0.10)),
            (side_sign * beam * 0.48, -1.6 + index * 0.70, 0.78),
            0.08,
            0.042,
            dark,
            root,
            segments=6,
        )

    for side, x in (("left", -beam * 0.56), ("right", beam * 0.56)):
        add_beam(f"skiff_hook_rail_{side}", (x, 1.5, 0.72), (x, 2.35, 0.72), 0.055, dark, root, vertices=7)
        add_marker(f"boat_skiff_hook_{side}", (x, 2.35, 0.62), root, marker_type="cargo_hook")
        for fender in range(3):
            y = -1.1 + fender * 1.15
            add_ring(
                f"skiff_fender_{side}_{fender}",
                (x, y, 0.42),
                0.14, 0.035, canvas, root,
                major_segments=8, minor_segments=4,
                rotation=(0, math.pi / 2, 0),
            )
            add_catenary_rope(
                f"skiff_fender_rope_{side}_{fender}",
                (x, y, 0.82), (x, y, 0.54), 0.02, 0.018, dark, root, segments=3,
            )
    add_lattice("skiff_net", (beam * 0.42, 1.55, 1.02), 0.72, 0.92, canvas, root, columns=4, rows=4, depth=0.025, rotation=(0, math.radians(12), 0))
    add_box("skiff_rudder_blade", (0, half_length * 0.98, 0.18), (0.08, 0.46, 0.76), dark, root, bevel=0.022)
    # The helmsman stands on the raised stern deck; the handle must be above
    # that deck and within arm reach, rather than underneath the pilot's feet.
    tiller_grip = (-0.28, half_length * 0.60, 2.05)
    add_beam("skiff_tiller_stock", (0, half_length * 0.96, 0.68), (0, half_length * 0.96, 2.05), 0.045, dark, root, vertices=6)
    add_beam("skiff_tiller_arm", (0, half_length * 0.96, 2.05), tiller_grip, 0.045, dark, root, vertices=6)
    add_grip_marker("boat_skiff_helm_grip", (tiller_grip[0], tiller_grip[1], tiller_grip[2] + 0.022), root,
                    fingers=(1, 0, 0), contact_normal=(0, 0, -1))
    consolidate_lod_level(root, spec["id"])
    add_collision_primitives(spec, root)
