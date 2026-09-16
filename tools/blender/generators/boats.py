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
    sheer = 0.76 + rise * 0.45
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
        materials.append(0)
        faces.append((outer_current[4], outer_next[4], inner_next[4], inner_current[4]))
        materials.append(0)

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


def _skiff_sail_point(mast_height, u, v, side, foot_rise):
    width = 2.72 * (1.0 - v) + 1.05 * v
    y = 0.10 + width * u
    z = mast_height * (0.354 + v * 0.416) + foot_rise * (y - 0.10)
    billow = math.sin(u * math.pi) * math.sin(v * math.pi) * 0.24
    return (side * 0.025 + billow, y, z)


def _add_working_sail(name: str, mast_height: float, token: str, root, *, rows: int = 8, foot_rise: float = 0.0) -> None:
    """Build a thick, billowing mainsail with faceted folds in the boat Y/Z plane."""
    height_steps = max(4, rows)
    width_steps = 6
    vertices = []
    for side in (-1.0, 1.0):
        for row in range(height_steps + 1):
            v = row / height_steps
            for col in range(width_steps + 1):
                u = col / width_steps
                vertices.append(_skiff_sail_point(mast_height, u, v, side, foot_rise))
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
    # Seams share the actual cloth tessellation, so they cannot disappear into
    # the billow or cut through it like straight decorative bars.
    for side in (-1, 1):
        for row in range(2, height_steps, 2):
            points = []
            for col in range(width_steps + 1):
                x, y, z = _skiff_sail_point(mast_height, col / width_steps, row / height_steps, side, foot_rise)
                points.append((x + side * .006, y, z))
            add_rope_line(f"{name}_stitched_panel_{side}_{row}", points, .007, token, root, vertices=4)
    for edge, coordinates in (
        ("luff", [(0, i / height_steps) for i in range(height_steps + 1)]),
        ("leech", [(1, i / height_steps) for i in range(height_steps + 1)]),
        ("foot", [(i / width_steps, 0) for i in range(width_steps + 1)]),
        ("head", [(i / width_steps, 1) for i in range(width_steps + 1)]),
    ):
        add_rope_line(f"{name}_{edge}_bolt_rope",
                      [_skiff_sail_point(mast_height, u, v, 0, foot_rise) for u, v in coordinates],
                      .028, token, root, vertices=6)


def _add_topsail(name: str, mast_height: float, token: str, root) -> None:
    """Small rectangular topsail with slight billow, matching the isolated sheet."""
    thickness = 0.025
    z0, z1 = mast_height * 0.854, mast_height * 0.952
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
    # Back/side framing and recessed lid joints stay legible when viewed from
    # the helm, instead of revealing three bare sides of a decorated cube.
    for side in (-1, 1):
        for z in (cz + .06, cz + size - .06):
            add_box(f"{prefix}_side_rail_{side}_{int(z * 1000)}",
                    (cx + side * size * .49, cy, z), (.06, size, .07), dark, root, bevel=.01)
        add_beam(f"{prefix}_side_brace_{side}",
                 (cx + side * size * .49, cy - size * .38, cz + size * .16),
                 (cx + side * size * .49, cy + size * .38, cz + size * .84),
                 .022, dark, root, vertices=4)
    for index in (-1, 1):
        add_box(f"{prefix}_lid_joint_{index}", (cx + index * size / 6, cy, cz + size + .001),
                (.009, size * .82, .003), dark, root, bevel=0)
    add_beam(f"{prefix}_back_brace", (cx - size * .40, cy + size * .50, cz + size * .16),
             (cx + size * .40, cy + size * .50, cz + size * .84), .023, dark, root, vertices=4)


def _add_skiff_hold_coaming(length: float, beam: float, honey: str, dark: str, root) -> None:
    """Frame the open working hold so cargo reads as stowed, not floating."""
    front_y = -length * 0.24
    rear_y = length * 0.18
    half_width = beam * 0.39
    rail_z = 0.705
    for side, side_name in ((-1, "left"), (1, "right")):
        add_beam(
            f"skiff_hold_coaming_{side_name}",
            (side * half_width, front_y, rail_z),
            (side * half_width, rear_y, rail_z),
            0.055,
            dark,
            root,
            vertices=6,
        )
    for y, name in ((front_y, "fore"), (rear_y, "aft")):
        add_beam(
            f"skiff_hold_coaming_{name}",
            (-half_width, y, rail_z),
            (half_width, y, rail_z),
            0.06,
            honey,
            root,
            vertices=6,
        )


def _skiff_deck(prefix, length, beam, start_y, end_y, top, count, token, root):
    """Caulked boards fitted to the hull, with one shared level for foot contact."""
    step = (end_y - start_y) / count
    for index in range(count):
        y0 = start_y + index * step + .004
        y1 = start_y + (index + 1) * step - .004
        w0 = _skiff_station(length, beam, y0 / length + .5, 1)[1] - .13
        w1 = _skiff_station(length, beam, y1 / length + .5, 1)[1] - .13
        vertices = [(x, y, z) for z in (top - .075, top)
                    for x, y in ((-w0, y0), (w0, y0), (w1, y1), (-w1, y1))]
        _finish_authored_mesh(f"{prefix}_{index:02d}", vertices,
            [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)],
            [0] * 6, (token,), root)


def _skiff_barrel(honey, dark, root):
    vertices, faces = [], []
    rings = ((.68, .225), (.73, .25), (.94, .285), (1.15, .25), (1.20, .225))
    for z, radius in rings:
        for i in range(12):
            a = math.tau * i / 12
            vertices.append((.02 + radius * math.cos(a), 1.05 + radius * math.sin(a), z))
    for ring in range(len(rings) - 1):
        for i in range(12):
            j = (i + 1) % 12
            faces.append((ring * 12 + i, ring * 12 + j, (ring + 1) * 12 + j, (ring + 1) * 12 + i))
    faces.extend((tuple(reversed(range(12))), tuple(range(48, 60))))
    _finish_authored_mesh("skiff_barrel_staves", vertices, faces, [0] * len(faces), (honey,), root)
    for index, z in enumerate((.75, 1.12)):
        add_ring(f"skiff_barrel_hoop_{index}", (.02, 1.05, z), .259, .022, dark, root,
                 major_segments=12, minor_segments=4)
    for i in (-1, 0, 1):
        add_box(f"skiff_barrel_lid_joint_{i}", (.02 + i * .09, 1.05, 1.201),
                (.008, .39 - abs(i) * .035, .004), dark, root, bevel=0)


def _rowboat_station(y, length, beam):
    progress = min(1.0, max(0.0, y / length + .5))
    width = beam * .5 * (.035 + .965 * math.sin(math.pi * .82 * progress) ** .70)
    bow, stern = max(0, 1 - progress * 2), max(0, progress * 2 - 1)
    return width, .52 + .19 * bow ** 2.5 + .055 * stern ** 2, -.40 + .23 * bow ** 3 + .10 * stern ** 3


def _rowboat_section(y, level, length, beam, *, inset=0):
    width, sheer, keel = _rowboat_station(y, length, beam)
    # A rounded bilge opens into flared topsides; the ends retain a real rocker.
    x = width * math.sin(level * math.pi * .5) - inset * level
    z = keel + (sheer - keel) * level ** 1.50 + inset * (1 - level)
    return x, z


def _rowboat_clinker_hull(spec, root):
    honey, dark, teal, brass = spec["palette"]
    length, beam = spec["parameters"]["length"], spec["parameters"]["beam"]
    segments = spec["parameters"]["ribCount"]
    for side in (-1, 1):
        for band in range(5):
            vertices, faces, materials = [], [], []
            for index in range(segments + 1):
                y = -length * .5 + length * index / segments
                low, high = max(0, band / 5 - .012), (band + 1) / 5
                for level, inset in ((low, 0), (high, 0), (high, .055), (low, .055)):
                    x, z = _rowboat_section(y, level, length, beam, inset=inset)
                    # A small projecting lower arris makes the lap readable without a dark outline.
                    x += .018 * (1 - inset / .055) * (1 if level == low else .25)
                    vertices.append((side * x, y, z))
            for index in range(segments):
                a, b = index * 4, (index + 1) * 4
                for edge in range(4):
                    faces.append((a + edge, b + edge, b + (edge + 1) % 4, a + (edge + 1) % 4))
                    materials.append(1 if band < 2 and edge != 2 else 0)
            faces.extend(((3, 2, 1, 0), tuple(range(segments * 4, segments * 4 + 4))))
            materials.extend((0, 0))
            obj = _finish_authored_mesh(f"rowboat_strake_{side}_{band}", vertices, faces, materials,
                                        (honey, teal), root)
            set_surface_normals(obj, "rounded", faces=[i for i in range(segments * 4) if i % 4 in (0, 2)])
    keel_points = []
    for index in range(segments + 1):
        y = -length * .5 + index * length / segments
        keel_points.append((0, y, _rowboat_station(y, length, beam)[2] - .018))
    add_rope_line("rowboat_rockered_keel", keel_points, .045, dark, root, vertices=5)
    for index in range(spec["parameters"]["innerPlanks"]):
        y = -length * .34 + index * length * .76 / (spec["parameters"]["innerPlanks"] - 1)
        points = []
        for step in range(11):
            side = -1 if step < 5 else 1
            level = abs(step - 5) / 5
            x, z = _rowboat_section(y, level, length, beam, inset=.078)
            points.append((side * x, y, z))
        add_rope_line(f"rowboat_steam_bent_rib_{index}", points, .025, dark, root, vertices=4)
    # The broad, raked transom closes the aft hull instead of a second pointed stem.
    for band in range(5):
        vertices = []
        for depth in (0, -.075):
            for level, side in ((band / 5, -1), (band / 5, 1), ((band + 1) / 5, 1), ((band + 1) / 5, -1)):
                x, z = _rowboat_section(length * .5, level, length, beam)
                vertices.append((side * max(.025, x), length * .5 + depth, z))
        faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
        _finish_authored_mesh(f"rowboat_transom_plank_{band}", vertices, faces,
                              [1 if band < 2 and i == 0 else 0 for i in range(6)], (honey, teal), root)


def _rowboat_oar(side_name, side, honey, dark, teal, brass, root):
    from mathutils import Vector
    grip = Vector((side * .24, .02, .80))
    lock = Vector((side * .78, .04, .66))
    direction = (lock - grip).normalized()
    across = Vector((0, 1, 0))
    across = (across - direction * across.dot(direction)).normalized()
    normal = direction.cross(across).normalized()
    oar_root = add_marker(f"boat_rowboat_oar_{side_name}_root", grip, root, marker_type="oar_pivot")
    shaft = add_beam(f"rowboat_oar_{side_name}_shaft", grip - direction * .10,
                     grip + direction * 1.37, .028, honey, root, vertices=8)
    cuff = add_beam(f"rowboat_oar_{side_name}_leather", lock - direction * .085,
                    lock + direction * .085, .034, dark, root, vertices=8)
    vertices, faces, materials = [], [], []
    for distance, width, thickness in ((1.27, .030, .020), (1.40, .095, .022), (1.79, .115, .016), (1.93, .100, .012), (1.98, .060, .008)):
        center = grip + direction * distance
        for cross, depth in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            vertices.append(tuple(center + across * width * cross + normal * thickness * depth))
    for index in range(4):
        for edge in range(4):
            faces.append((index * 4 + edge, (index + 1) * 4 + edge,
                          (index + 1) * 4 + (edge + 1) % 4, index * 4 + (edge + 1) % 4))
            materials.append(int(index == 3))
    faces.extend(((3, 2, 1, 0), (16, 17, 18, 19)))
    materials.extend((0, 1))
    blade = _finish_authored_mesh(f"rowboat_oar_{side_name}_spoon", vertices, faces, materials, (honey, teal), root)
    bpy.context.view_layer.update()
    for part in (shaft, cuff, blade):
        world_matrix = part.matrix_world.copy()
        part.parent = oar_root
        part.matrix_world = world_matrix
    join_meshes((shaft, cuff, blade), f"rowboat_oar_{side_name}")
    add_grip_marker(f"boat_rowboat_oar_{side_name}_grip", (0, 0, .022), oar_root,
                    fingers=(-side * direction.y, side * direction.x, 0), contact_normal=(0, 0, -1))
    add_ring(f"boat_rowboat_oarlock_{side_name}", lock, .053, .012, brass, root,
             major_segments=10, minor_segments=4,
             rotation=(0, math.pi / 2 + side * math.atan2(.14, .54), 0))
    add_box(f"rowboat_oarlock_mount_{side_name}", (side * .80, .04, .578),
            (.12, .14, .025), brass, root, bevel=.008)
    add_beam(f"rowboat_thole_pin_{side_name}", (side * .78, .04, .582),
             (side * .78, .04, .615), .024, brass, root, vertices=6)


def rowboat(spec: dict, root) -> None:
    honey, dark, teal, brass = spec["palette"]
    params = spec["parameters"]
    length, beam = params["length"], params["beam"]
    _rowboat_clinker_hull(spec, root)
    for side in (-1, 1):
        points = []
        for index in range(params["gunwaleSegments"] + 1):
            y = -length * .5 + index * length / params["gunwaleSegments"]
            width, sheer, _ = _rowboat_station(y, length, beam)
            points.append((side * width, y, sheer + .012))
        add_rope_line(f"rowboat_oiled_caprail_{side}", points, .057, dark, root, vertices=6)
    stern_width, stern_height, _ = _rowboat_station(length * .5, length, beam)
    add_beam("rowboat_transom_crown", (-stern_width, length * .5, stern_height + .012),
             (stern_width, length * .5, stern_height + .012), .057, dark, root, vertices=6)
    add_rope_line("rowboat_swept_stem", [(0, -length * .48, -.21), (0, -length * .51, .05),
                  (0, -length * .516, .40), (0, -length * .502, .74)], .055, dark, root, vertices=6)
    for index, y in enumerate((-.78, .18, .92)):
        width = _rowboat_station(y, length, beam)[0] * 1.72
        for plank in (-1, 1):
            add_box(f"rowboat_thwart_{index}_{plank}", (0, y + plank * .080, .36),
                    (width, .148, .10), honey, root, bevel=.018)
        for side in (-1, 1):
            end = width * .5
            vertices = [(side * x, y + dy, z) for dy in (-.06, .06)
                        for x, z in ((end, .31), (end - .17, .31), (end - .14, .10))]
            _finish_authored_mesh(f"rowboat_thwart_knee_{index}_{side}", vertices,
                [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)], [0] * 5, (dark,), root)
            add_cylinder(f"rowboat_thwart_peg_{index}_{side}", (side * (end - .09), y, .414),
                         .019, .009, dark, root, vertices=6)
    for index in range(7):
        x = (index - 3) * .105
        plank_length = 2.60 - abs(x) * 3.3
        add_box(f"rowboat_longitudinal_sole_{index}", (x, .25, -.13 + .003 * (index % 3)),
                (.093, plank_length, .055), honey, root, bevel=.009)
    add_box("rowboat_foot_stretcher", (0, -.23, .03), (.62, .08, .20),
            dark, root, rotation=(math.radians(-12), 0, 0), bevel=.018)
    add_marker("boat_rowboat_rower_seat", (0, .18, .42), root, marker_type="pelvis_contact")
    for side_name, side in (("left", 1), ("right", -1)):
        support = add_marker(f"boat_rowboat_foot_{side_name}_socket",
            (side * .16, -.23 + math.sin(math.radians(12)) * .10, .03 + math.cos(math.radians(12)) * .10),
            root, marker_type="foot_support")
        support.rotation_euler = (math.radians(-12), 0, 0)
        _rowboat_oar(side_name, side, honey, dark, teal, brass, root)
    # A fitted locker follows the narrowing bow; it does not intersect the hull.
    vertices = [(side * width, y, z) for z in (.18, .485)
                for y, width, side in ((-1.60, .25, -1), (-1.60, .25, 1), (-1.08, .40, 1), (-1.08, .40, -1))]
    _finish_authored_mesh("rowboat_fitted_bow_locker", vertices,
        [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], [0] * 6, (dark,), root)
    for index in range(5):
        vertices = []
        for z in (.485, .515):
            for y, width, t in ((-1.60, .25, index / 5 + .01), (-1.60, .25, (index + 1) / 5 - .01),
                                (-1.08, .40, (index + 1) / 5 - .01), (-1.08, .40, index / 5 + .01)):
                vertices.append(((t * 2 - 1) * width, y, z))
        _finish_authored_mesh(f"rowboat_fitted_lid_plank_{index}", vertices,
            [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], [0] * 6, (honey,), root)
    for x in (-.23, .23):
        add_box(f"rowboat_locker_hinge_{x}", (x, -1.12, .523), (.075, .10, .014), brass, root, bevel=.005)
    add_ring("rowboat_locker_pull", (0, -1.52, .53), .035, .009, brass, root, major_segments=8, minor_segments=4)
    add_marker("boat_rowboat_storage_01", (0, -1.35, .52), root, marker_type="storage")
    coil = []
    for index in range(37):
        angle = index / 36 * math.tau * 2.15
        radius = .045 + .090 * index / 36
        coil.append((.05 + radius * math.cos(angle), -1.34 + radius * math.sin(angle), .541))
    add_rope_line("rowboat_coiled_painter", coil, .016, honey, root, vertices=5)
    add_rope_line("rowboat_painter_tail", [coil[-1], (.16, -1.54, .54), (.10, -1.75, .59), (0, -1.95, .70)],
                  .016, honey, root, vertices=5)
    add_beam("rowboat_bow_cleat", (-.09, -1.89, .65), (.09, -1.89, .65), .023, brass, root, vertices=6)
    _join_direct_meshes(root, spec["id"], preserve_names=("boat_rowboat_oarlock_left", "boat_rowboat_oarlock_right"))
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

    _skiff_deck("skiff_working_deck", length, beam, -length * .44, length * .44,
                .68, params["deckBoards"], honey, root)
    # Raised platforms are supported by full risers and beams, not slabs
    # suspended over the sole. Their tops retain the existing station heights.
    for name, y0, y1, top in (("stern", 1.62, 2.86, .86), ("bow", -2.86, -1.72, .81)):
        _skiff_deck(f"skiff_{name}_deck", length, beam, y0, y1, top, 8, honey, root)
        for index, y in enumerate((y0 + .05, y1 - .05)):
            width = _skiff_station(length, beam, y / length + .5, 1)[1] - .14
            add_box(f"skiff_{name}_deck_riser_{index}", (0, y, (.68 + top - .075) * .5),
                    (width * 2, .09, top - .075 - .68), dark, root, bevel=.012)
    for index, y in enumerate((-1.4, -.65, .1, .85, 1.5, 2.2)):
        width = _skiff_station(length, beam, y / length + .5, 1)[1] - .14
        add_beam(f"skiff_deck_beam_{index}", (-width, y, .59), (width, y, .59), .065, dark, root, vertices=4)
    for side, side_name in ((-1, "left"), (1, "right")):
        gunwale_points = []
        for index in range(hull_segments + 1):
            y, width, sheer, _, _ = _skiff_station(length, beam, index, hull_segments)
            gunwale_points.append((side * (width - .018), y, sheer + 0.035))
        add_rope_line(
            f"skiff_gunwale_{side_name}", gunwale_points, 0.075, honey, root, vertices=6,
        )
        add_rope_line(f"skiff_inboard_stringer_{side_name}",
                      [(x - side * .075, y, z - .09) for x, y, z in gunwale_points],
                      .035, dark, root, vertices=4)

    # The helmsman stands at the stern deck so the wheel sits naturally in arm
    # reach ahead of both hands, clear of the raised boom above and clear of the
    # wheel base plate below.
    helm_deck_y = half_length * 0.71
    add_marker(
        "boat_skiff_driver_station",
        (0, helm_deck_y, 0.86),
        root,
        marker_type="standing_station",
    )
    for side_name, side in (("left", 1), ("right", -1)):
        add_marker(
            f"boat_skiff_foot_{side_name}_socket",
            (side * 0.18, helm_deck_y, 0.86),
            root,
            marker_type="foot_support",
        )
    add_marker(
        "boat_skiff_fishing_station",
        (beam * 0.25, -half_length * 0.24, 0.68),
        root,
        marker_type="standing_station",
    )
    add_beam("skiff_bowsprit", (0, -half_length * .84, .98), (0, -half_length * 1.18, 1.12),
             .065, honey, root, vertices=7)
    add_rope_line("skiff_stem_knee", [(0, -half_length, -.25), (0, -half_length * 1.015, .24),
                  (0, -half_length, .72), (0, -half_length * .98, 1.02)], .085, honey, root, vertices=6)
    for index, y in enumerate((-half_length, half_length)):
        _, width, sheer, _, _ = _skiff_station(length, beam, y / length + .5, 1)
        add_beam(f"skiff_end_cap_{index}", (-width, y, sheer + .035), (width, y, sheer + .035),
                 .074, honey, root, vertices=6)

    _add_skiff_hold_coaming(length, beam, honey, dark, root)
    # The crate tops now land exactly on their existing cargo markers, keeping
    # future runtime attachments aligned while making the hold read at distance.
    _add_deck_crate("skiff_crate_a", (-0.46, 0.18, 0.68), 0.52, honey, dark, root)
    _add_deck_crate("skiff_crate_b", (0.38, 0.42, 0.68), 0.50, honey, dark, root)
    _skiff_barrel(honey, dark, root)
    for index, (x, y) in enumerate(((-0.55, 1.45), (-0.28, 1.52), (0.22, 1.48))):
        add_box(f"skiff_weight_{index:02d}", (x, y, 0.75), (0.22, 0.18, 0.14), dark, root, bevel=0.012)
    add_marker("boat_skiff_cargo_01", (-0.38, 0.18, 1.20), root, marker_type="cargo")
    add_marker("boat_skiff_cargo_02", (0.38, 0.42, 1.18), root, marker_type="cargo")

    mast_height = params["mastHeight"]
    # The boom is kicked up aft so the standing helmsman clears the rig while
    # the sail foot stays low at the mast, matching the isolated sheet.
    boom_run = 2.86
    boom_rise = 1.25
    boom_foot_rise = boom_rise / boom_run
    add_beam("skiff_mast", (0, 0.0, 0.62), (0, 0.0, mast_height), 0.13, honey, root, vertices=8)
    add_box("skiff_mast_partner", (0, 0, .71), (.34, .32, .08), dark, root, bevel=.018)
    add_beam("skiff_pennant_staff", (0, 0, mast_height - .08), (0, 0, mast_height + .31),
             .034, honey, root, vertices=6)
    for index, z in enumerate((.80, mast_height * .34, mast_height * .77, mast_height * .96)):
        add_ring(f"skiff_mast_binding_{index}", (0, 0, z), .14, .022, dark, root, major_segments=10, minor_segments=4)
    add_beam("skiff_boom", (0, 0, mast_height * 0.34), (0, boom_run, mast_height * 0.34 + boom_rise), 0.085, honey, root, vertices=7)
    add_beam("skiff_yard_main", (0, -.10, mast_height * .77),
             (0, 1.22, mast_height * .77 + boom_foot_rise * 1.12), .055, honey, root, vertices=7)
    add_beam("skiff_yard_top", (0, -0.08, mast_height * 0.96), (0, 1.20, mast_height * 0.96), 0.05, honey, root, vertices=6)
    _add_working_sail("skiff_sail", mast_height, canvas, root, rows=params["sailRows"], foot_rise=boom_foot_rise)
    _add_topsail("skiff_topsail", mast_height, canvas, root)
    add_rope_line("skiff_topsail_clew_tie", [(.16, 1.15, mast_height * .854),
                  (.06, 1.17, mast_height * .77 + boom_foot_rise * 1.07),
                  (-.035, 1.17, mast_height * .77 + boom_foot_rise * 1.07)], .015, canvas, root, vertices=5)
    add_rope_line("skiff_topsail_peak_tie", [(.10, 1.15, mast_height * .952),
                  (.04, 1.15, mast_height * .96 + .025), (-.03, 1.15, mast_height * .96)],
                  .014, canvas, root, vertices=5)
    add_tri_prism(
        "skiff_pennant",
        (0.04, 0.22, mast_height + 0.18),
        (0.04, 0.42, 0.22),
        red,
        root,
        rotation=(math.radians(-12), 0, 0),
    )
    for row in range(6):
        z = mast_height * (.36 + row * .078)
        add_ring(f"skiff_luff_hoop_{row}", (0, .018, z), .142, .015, canvas, root,
                 major_segments=10, minor_segments=4)
    # Tensioned stays terminate on hull chainplates. The working/fishing
    # station and standing helm remain clear between the attachment stations.
    for side in (-1, 1):
        for index, y in enumerate((-.18, .92)):
            _, width, sheer, _, _ = _skiff_station(length, beam, y / length + .5, 1)
            x = side * (width + .025)
            add_box(f"skiff_chainplate_{side}_{index}", (x, y, sheer - .13),
                    (.045, .095, .38), dark, root, bevel=.012)
            add_ring(f"skiff_deadeye_{side}_{index}", (x, y, sheer + .065), .05, .018, dark, root,
                     major_segments=8, minor_segments=4, rotation=(math.pi / 2, 0, 0))
            add_catenary_rope(f"skiff_shroud_{side}_{index}", (side * .11, 0, mast_height * .77),
                             (x, y, sheer + .095), .025, .021, dark, root, segments=8)
    add_catenary_rope("skiff_forestay", (0, -.10, mast_height * .93),
                     (0, -half_length * 1.16, 1.12), .035, .022, dark, root, segments=10)
    add_catenary_rope("skiff_topping_lift", (0, .05, mast_height * .96),
                     (0, boom_run, mast_height * .34 + boom_rise), .025, .018, dark, root, segments=8)
    for index, y in enumerate((1.66, 2.78)):
        add_catenary_rope(f"skiff_boom_lashing_{index}", (-.06, y, mast_height * .34 + boom_foot_rise * y),
                         (.04, y, mast_height * .354 + boom_foot_rise * (y - .10)),
                         .015, .015, canvas, root, segments=3)

    for side, sign in (("left", -1), ("right", 1)):
        x = sign * beam * .56
        add_beam(f"skiff_hook_rail_{side}", (x, 1.5, 0.72), (x, 2.35, 0.72), 0.055, dark, root, vertices=7)
        add_marker(f"boat_skiff_hook_{side}", (x, 2.35, 0.62), root, marker_type="cargo_hook")
        for index, y in enumerate((1.5, 2.35)):
            _, width, sheer, _, _ = _skiff_station(length, beam, y / length + .5, 1)
            add_beam(f"skiff_hook_outrigger_{side}_{index}", (sign * (width - .03), y, sheer),
                     (x, y, .72), .04, dark, root, vertices=6)
            add_beam(f"skiff_hook_knee_{side}_{index}", (sign * width * .9, y, sheer - .25),
                     (x, y, .72), .028, dark, root, vertices=5)
        add_rope_line(f"skiff_cargo_hook_{side}", [(x, 2.35, .72), (x, 2.35, .62),
                      (x + sign * .055, 2.35, .585), (x + sign * .095, 2.35, .64)],
                      .018, dark, root, vertices=6)
        for fender in range(3):
            y = -1.1 + fender * 1.15
            _, width, sheer, _, _ = _skiff_station(length, beam, y / length + .5, 1)
            fender_x = sign * (width + .11)
            fender_z = sheer - .33
            add_ring(
                f"skiff_fender_{side}_{fender}",
                (fender_x, y, fender_z),
                0.17, 0.045, canvas, root,
                major_segments=12, minor_segments=5,
                rotation=(0, math.pi / 2, 0),
            )
            add_rope_line(
                f"skiff_fender_rope_{side}_{fender}",
                [(sign * (width - .055), y, sheer), (sign * width, y, sheer + .11),
                 (sign * (width + .08), y, sheer + .015), (fender_x, y, fender_z + .14)],
                .017, honey, root, vertices=5,
            )
    # A net hangs over the starboard gunwale; every strand follows the same
    # draped surface, with its two corners lashed to the caprail.
    def net_point(u, v):
        y = 1.60 + u * .60
        _, width, sheer, _, _ = _skiff_station(length, beam, y / length + .5, 1)
        return (width + .075 + math.sin(v * math.pi) * .07, y,
                sheer + .035 - v * .42 - math.sin(u * math.pi) * .06)
    for i in range(5):
        for axis in (0, 1):
            points = [net_point(i / 4, j / 6) if axis == 0 else net_point(j / 6, i / 4) for j in range(7)]
            add_rope_line(f"skiff_net_{axis}_{i}", points, .012, canvas, root, vertices=4)
    for u in (0, 1):
        x, y, z = net_point(u, 0)
        add_rope_line(f"skiff_net_lashing_{u}", [(x - .15, y, z), (x - .06, y, z + .07), (x, y, z)],
                      .016, honey, root, vertices=5)
    add_box("skiff_rudder_blade", (0, half_length + .14, .02), (.075, .26, 1.0), dark, root, bevel=.022)
    add_beam("skiff_rudder_stock", (0, half_length + .10, .32), (0, half_length + .10, .93),
             .038, dark, root, vertices=8)
    for index, z in enumerate((.40, .78)):
        add_beam(f"skiff_rudder_gudgeon_{index}", (0, half_length - .05, z),
                 (0, half_length + .10, z), .035, dark, root, vertices=6)
        add_ring(f"skiff_rudder_pintle_{index}", (0, half_length + .10, z),
                 .043, .015, honey, root, major_segments=8, minor_segments=4)
    # A compact wheel is fixed to the raised stern deck ahead of the helmsman.
    # The bracket posts support the wheel from the fore side, keeping clear of the rim,
    # and the axle passes through the wheel plane so the helm reads as supported hardware.
    wheel_y = 1.95
    wheel_center = (0, wheel_y, 2.10)
    wheel_radius = 0.27
    rim_minor = 0.045
    post_y = wheel_y - 0.16
    add_box("skiff_helm_wheel_base", (0, post_y, 0.90), (0.66, 0.20, 0.08), dark, root, bevel=0.02)
    for side_name, x, inner_x in (("left", -0.22, -0.055), ("right", 0.22, 0.055)):
        add_beam(
            f"skiff_helm_wheel_bracket_{side_name}",
            (x, post_y, 0.90),
            (inner_x, post_y, wheel_center[2]),
            0.045,
            dark,
            root,
            vertices=6,
        )
    add_beam(
        "skiff_helm_wheel_cross_brace",
        (-0.22, post_y, wheel_center[2]),
        (0.22, post_y, wheel_center[2]),
        0.04,
        dark,
        root,
        vertices=6,
    )
    add_ring(
        "skiff_helm_wheel_rim",
        wheel_center,
        wheel_radius,
        rim_minor,
        honey,
        root,
        major_segments=18,
        minor_segments=6,
        rotation=(math.pi / 2, 0, 0),
    )
    add_cylinder(
        "skiff_helm_wheel_axle",
        (0, (post_y + wheel_y) * 0.5 + 0.02, wheel_center[2]),
        0.038,
        0.26,
        dark,
        root,
        vertices=8,
        rotation=(math.pi / 2, 0, 0),
        bevel=0.008,
    )
    add_cylinder(
        "skiff_helm_wheel_hub",
        wheel_center,
        0.085,
        0.09,
        dark,
        root,
        vertices=8,
        rotation=(math.pi / 2, 0, 0),
        bevel=0.016,
    )
    for spoke in range(6):
        angle = spoke * math.tau / 6.0
        inner = (wheel_radius * 0.18 * math.cos(angle), wheel_y, wheel_center[2] + wheel_radius * 0.18 * math.sin(angle))
        outer = (wheel_radius * 0.92 * math.cos(angle), wheel_y, wheel_center[2] + wheel_radius * 0.92 * math.sin(angle))
        add_beam(f"skiff_helm_wheel_spoke_{spoke:02d}", inner, outer, 0.028, honey, root, vertices=6)
    for index, x in enumerate((-.24, .24)):
        add_cylinder(f"skiff_helm_base_bolt_{index}", (x, post_y, .946), .021, .012, honey, root, vertices=6)
    # Palm frames sit on the near face of the rim tube with the fingers curling
    # around it, within natural reach of the standing helmsman.
    grip_y = wheel_y + rim_minor
    add_grip_marker("boat_skiff_helm_grip", (-wheel_radius, grip_y, wheel_center[2]), root,
                    fingers=(1, 0, 0), contact_normal=(0, -1, 0))
    add_grip_marker("boat_skiff_helm_grip_left", (wheel_radius, grip_y, wheel_center[2]), root,
                    fingers=(-1, 0, 0), contact_normal=(0, -1, 0))
    consolidate_lod_level(root, spec["id"])
    add_collision_primitives(spec, root)
