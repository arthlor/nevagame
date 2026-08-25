"""Working rowboat and fishing-skiff generators."""

from __future__ import annotations

import math

import bmesh
import bpy

from common.geometry import add_beam, add_box, add_collision_primitives, add_cylinder, add_ico, add_marker, add_ring, apply_vertex_values, join_meshes
from common.materials import get_or_create_material
from common.authored import add_catenary_rope, add_lattice, add_plank_field, add_rope_line


def _hull_half_width(y: float, half_length: float, beam: float, fullness: float = 0.72) -> float:
    normalized = min(1.0, abs(y) / half_length)
    return beam * 0.5 * max(0.12, (1.0 - normalized**1.8) ** fullness)


def _planked_hull(prefix: str, length: float, beam: float, segments: int, levels: int, tokens: tuple[str, str], root) -> None:
    half_length = length * 0.5
    segment_length = length / segments
    for segment in range(segments):
        y = -half_length + segment_length * (segment + 0.5)
        width = _hull_half_width(y, half_length, beam)
        next_width = _hull_half_width(y + segment_length * 0.5, half_length, beam)
        yaw = math.atan2(next_width - width, segment_length * 0.5)
        for side in (-1, 1):
            for level in range(levels):
                z = -0.22 + level * 0.28
                x = side * width * (0.72 + level * 0.12)
                roll = side * math.radians(10 + level * 5)
                add_box(
                    f"{prefix}_plank_{segment:02d}_{'l' if side < 0 else 'r'}_{level}",
                    (x, y, z), (0.16, segment_length + 0.08, 0.34),
                    tokens[(segment + level) % len(tokens)], root,
                    rotation=(roll, 0, -side * yaw), bevel=0.035,
                )
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
) -> None:
    """Create one closed outer/inner working hull instead of box fragments."""
    vertices = []
    outer_rings = []
    inner_rings = []
    shell_thickness = max(0.09, beam * 0.043)
    for index in range(segments + 1):
        y, half_width, sheer, chine, keel = _skiff_station(length, beam, index, segments)
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
            # Darker keel/chine bands make the longitudinal planes legible.
            materials.append(1 if band in (1, 2) else 0)
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
    _finish_authored_mesh("skiff_hull_shell", vertices, faces, materials, (honey, dark, red), root)


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
        outward = side * 0.045
        rings.append(tuple(range(len(vertices), len(vertices) + 4)))
        vertices.extend(
            (
                (x, y, z - 0.045),
                (x, y, z + 0.045),
                (x + outward, y, z + 0.032),
                (x + outward, y, z - 0.032),
            )
        )
    faces = []
    for station in range(segments):
        current, following = rings[station], rings[station + 1]
        for edge in range(4):
            faces.append((current[edge], following[edge], following[(edge + 1) % 4], current[(edge + 1) % 4]))
    faces.extend((rings[0], tuple(reversed(rings[-1]))))
    _finish_authored_mesh(name, vertices, faces, [0] * len(faces), (token,), root)


def _add_working_sail(name: str, mast_height: float, token: str, root) -> None:
    """Build a thin, closed sail in the boat's longitudinal Y/Z plane."""
    thickness = 0.035
    profile = (
        (0.08, mast_height * 0.90),
        (0.10, mast_height * 0.31),
        (2.78, mast_height * 0.38),
    )
    vertices = [
        (side * thickness, y, z)
        for side in (-1, 1)
        for y, z in profile
    ]
    faces = (
        (0, 1, 2),
        (3, 5, 4),
        (0, 3, 4, 1),
        (1, 4, 5, 2),
        (2, 5, 3, 0),
    )
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(get_or_create_material(token))
    for polygon in mesh.polygons:
        polygon.use_smooth = False
    sail = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(sail)
    sail.parent = root
    apply_vertex_values(sail)


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
    add_marker("boat_rowboat_rower_seat", (0, 0.18, 0.08), root, marker_type="seat")
    for side_name, side in (("left", -1), ("right", 1)):
        grip = (side * 0.29, -0.12, 0.72)
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
        add_marker(
            f"boat_rowboat_oar_{side_name}_grip", (0, 0, 0), oar_root, marker_type="grip"
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
            level = 0.24 + strake * 0.56 / max(1, strake_count - 1)
            token = red if strake == strake_count - 1 else dark if strake == 0 else honey
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
            f"skiff_gunwale_{side_name}", gunwale_points, 0.075, red, root, vertices=7,
        )

    add_box("skiff_hold", (0, 0.62, 0.72), (beam * 0.62, 1.55, 0.44), dark, root, bevel=0.055)
    add_box("skiff_hold_lid_left", (-beam * 0.18, 0.62, 0.98), (beam * 0.30, 1.45, 0.12), honey, root, bevel=0.025)
    add_box("skiff_hold_lid_right", (beam * 0.18, 0.62, 0.98), (beam * 0.30, 1.45, 0.12), honey, root, bevel=0.025)
    for divider_index, divider in enumerate((-0.38, 0.0, 0.38)):
        add_box(f"skiff_hold_divider_{divider_index:02d}", (0, 0.62 + divider, 0.86), (beam * 0.58, 0.08, 0.30), dark, root, bevel=0.012)
        add_box(f"skiff_hold_crossrail_{divider_index:02d}", (0, 0.62 + divider, 1.06), (beam * 0.72, 0.10, 0.10), red, root, bevel=0.012)
    for side, x in (("left", -beam * 0.34), ("right", beam * 0.34)):
        for slat in range(6):
            y = -0.08 + slat * 0.28
            add_box(
                f"skiff_hold_coaming_{side}_{slat:02d}", (x, y, 1.04),
                (0.09, 0.24, 0.26), red if slat in (0, 5) else dark, root, bevel=0.012,
            )
    add_marker("boat_skiff_cargo_01", (-beam * 0.2, 0.62, 1.08), root, marker_type="cargo")
    add_marker("boat_skiff_cargo_02", (beam * 0.2, 0.62, 1.08), root, marker_type="cargo")

    add_box("skiff_console", (0, -0.75, 1.28), (0.88, 0.72, 1.18), dark, root, bevel=0.06)
    add_box("skiff_console_face", (0, -1.13, 1.48), (0.68, 0.08, 0.42), red, root, bevel=0.035)
    add_cylinder("skiff_wheel_hub", (0, -1.20, 1.53), 0.08, 0.14, honey, root, vertices=8, rotation=(math.pi / 2, 0, 0), bevel=0.012)
    add_ring("skiff_wheel_rim", (0, -1.26, 1.53), 0.24, 0.025, honey, root, major_segments=10, minor_segments=4, rotation=(math.pi / 2, 0, 0))
    for index in range(5):
        angle = index * math.tau / 5
        add_beam("skiff_wheel_spoke_%02d" % index, (0, -1.27, 1.53), (math.cos(angle) * 0.22, -1.27, 1.53 + math.sin(angle) * 0.22), 0.018, honey, root, vertices=6)
    add_box("skiff_supply_chest", (0, -2.0, 0.86), (beam * 0.62, 0.82, 0.54), honey, root, bevel=0.045)
    for side, x in (("left", -beam * 0.29), ("right", beam * 0.29)):
        for rail in range(4):
            add_box(
                f"skiff_supply_chest_frame_{side}_{rail:02d}",
                (x, -2.0 + (rail - 1.5) * 0.19, 0.88), (0.075, 0.15, 0.58),
                dark, root, bevel=0.010,
            )

    mast_height = params["mastHeight"]
    add_beam("skiff_mast", (0, 0.0, 0.62), (0, 0.0, mast_height), 0.13, honey, root, vertices=8)
    add_beam("skiff_boom", (0, 0, mast_height * 0.38), (0, 2.86, mast_height * 0.38), 0.085, honey, root, vertices=7)
    _add_working_sail("skiff_sail", mast_height, canvas, root)
    add_box(
        "skiff_sail_stripe", (0.08, 1.18, mast_height * 0.44),
        (0.05, 2.20, 0.20), red, root,
        rotation=(math.radians(-12), 0, 0), bevel=0.015,
    )
    for row in range(params["sailRows"]):
        progress = row / max(1, params["sailRows"] - 1)
        z = mast_height * (0.34 + progress * 0.50)
        width = max(0.40, 2.55 * (1.0 - progress))
        add_box(
            f"skiff_sail_seam_{row:02d}", (0.075, 0.12 + width * 0.5, z),
            (0.045, width, 0.045), red if row % 3 == 0 else canvas, root,
            bevel=0.008,
        )
    for index in range(4):
        side_sign = -1 if index % 2 else 1
        add_catenary_rope(
            f"skiff_rigging_{index:02d}",
            (0, 0, mast_height * (0.42 + index * 0.12)),
            (side_sign * beam * 0.48, -1.6 + index * 0.75, 0.72),
            0.045,
            0.022,
            canvas,
            root,
            segments=5,
        )

    for side, x in (("left", -beam * 0.56), ("right", beam * 0.56)):
        add_beam(f"skiff_hook_rail_{side}", (x, 1.5, 0.72), (x, 2.35, 0.72), 0.055, dark, root, vertices=7)
        add_marker(f"boat_skiff_hook_{side}", (x, 2.35, 0.62), root, marker_type="cargo_hook")
        for fender in range(2):
            y = -0.9 + fender * 1.8
            add_ico(f"skiff_fender_{side}_{fender}", (x, y, 0.35), (0.16, 0.12, 0.30), canvas, root, subdivisions=2)
            add_catenary_rope(f"skiff_fender_rope_{side}_{fender}", (x, y, 0.74), (x, y, 0.48), 0.02, 0.018, canvas, root, segments=3)
    add_lattice("skiff_net", (beam * 0.42, 1.55, 1.02), 0.72, 0.92, canvas, root, columns=4, rows=4, depth=0.025, rotation=(0, math.radians(12), 0))
    for index, y in enumerate((-2.10, -1.72, 1.65)):
        add_box(f"skiff_supply_box_{index:02d}", (-0.52 + index * 0.48, y, 0.88), (0.56, 0.52, 0.46), honey if index % 2 else dark, root, bevel=0.028)
    # Stern transom rudder and tiller arm
    add_box("skiff_rudder_blade", (0, half_length * 0.98, 0.18), (0.08, 0.46, 0.76), dark, root, bevel=0.022)
    add_beam("skiff_tiller_arm", (0, half_length * 0.96, 0.68), (0, half_length * 0.72, 0.72), 0.045, dark, root, vertices=6)
    add_collision_primitives(spec, root)
