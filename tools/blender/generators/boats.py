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
