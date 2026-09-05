"""Deterministic low-poly geometry helpers shared by all asset families."""

from __future__ import annotations

import random
import math
from collections.abc import Iterable

import bmesh
import bpy
from mathutils import Matrix, Vector

from .materials import get_or_create_material


def seeded_rng(seed: int) -> random.Random:
    return random.Random(seed)


def _active_object() -> bpy.types.Object:
    """Resolve the active object without relying on Blender's UI context."""
    obj = bpy.context.view_layer.objects.active
    if obj is None:
        raise RuntimeError("Blender did not expose an active object after primitive creation")
    return obj


def _object_operator_context(obj: bpy.types.Object, selected=None):
    selected_objects = list(selected) if selected is not None else [obj]
    return bpy.context.temp_override(
        object=obj,
        active_object=obj,
        selected_objects=selected_objects,
        selected_editable_objects=selected_objects,
    )


def _finish_mesh(
    obj: bpy.types.Object,
    name: str,
    token: str,
    parent: bpy.types.Object,
    *,
    bevel: float = 0.0,
    flat: bool = True,
    vertex_values: bool = True,
    normal_mode: str = "planar",
) -> bpy.types.Object:
    obj.name = name
    obj.data.name = f"{name}_mesh"
    obj.data.materials.append(get_or_create_material(token))
    obj.parent = parent
    for selected in bpy.context.view_layer.objects:
        selected.select_set(False)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    with _object_operator_context(obj):
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    if bevel > 0:
        modifier = obj.modifiers.new(name="NEVA_Chamfer", type="BEVEL")
        modifier.width = bevel
        modifier.segments = 1
        modifier.limit_method = "ANGLE"
        bpy.context.view_layer.objects.active = obj
        with _object_operator_context(obj):
            bpy.ops.object.modifier_apply(modifier=modifier.name)

    for polygon in obj.data.polygons:
        polygon.use_smooth = not flat
    set_surface_normals(obj, "rounded" if not flat else normal_mode)
    if vertex_values:
        apply_vertex_values(obj)
    return obj


def set_surface_normals(obj, mode="rounded", *, faces=None):
    """Record authored smoothing groups on faces, including across material slots.

    FACE data survives object joining and decimation; object names and material
    boundaries do not define a lighting seam. The export finish consumes this
    private attribute after every LOD has been constructed.
    """
    if mode not in ("rounded", "planar"):
        raise ValueError(f"Unknown surface normal mode: {mode}")
    attribute = obj.data.attributes.get(".neva_surface")
    if attribute is None:
        attribute = obj.data.attributes.new(".neva_surface", "INT", "FACE")
    for index in range(len(obj.data.polygons)) if faces is None else faces:
        attribute.data[index].value = int(mode == "rounded")
    return obj


def remember_rest_transform(obj):
    """Keep an object's authored basis before NLA evaluation can replace it."""
    if "_neva_rest_transform" not in obj:
        obj["_neva_rest_transform"] = [value for row in obj.matrix_basis for value in row]


def authored_rest_transforms(objects):
    """Resolve rest matrices without changing the active action or its pose."""
    matrices = {}

    def resolve(obj):
        if obj in matrices:
            return matrices[obj]
        saved = obj.get("_neva_rest_transform")
        basis = Matrix([saved[i:i + 4] for i in range(0, 16, 4)]) if saved else obj.matrix_basis.copy()
        if obj.parent:
            if obj.parent_type != "OBJECT":
                raise ValueError(f"{obj.name}: procedural rest-space baking requires object-parented surfaces")
            basis = resolve(obj.parent) @ obj.matrix_parent_inverse @ basis
        matrices[obj] = basis
        return basis

    for obj in objects:
        resolve(obj)
    return matrices


def finish_authored_surface(obj, asset_root, *, object_to_asset=None, sharp_angle=math.radians(70)):
    """Bake rest-space face color and normals within connected smoothing groups.

    Geometry supplies the light response; COLOR_0 supplies only broad facet
    values. No world light, component height, material seam or animated pose is
    part of the bake. Planar faces and authored creases retain their own normal.
    """
    mesh = obj.data
    mesh.update()
    object_to_asset = object_to_asset if object_to_asset is not None else asset_root.matrix_world.inverted() @ obj.matrix_world
    rest_normal = object_to_asset.to_3x3().inverted().transposed()
    face_values = mesh.attributes.new(".neva_facet_value", "FLOAT", "FACE")
    for polygon in mesh.polygons:
        normal = (rest_normal @ polygon.normal).normalized()
        face_values.data[polygon.index].value = .91 + .07 * max(-1.0, min(1.0, normal.z))
    mesh.calc_loop_triangles()
    warped = set()
    for triangle in mesh.loop_triangles:
        polygon = mesh.polygons[triangle.polygon_index]
        if len(polygon.vertices) > 3 and triangle.normal.dot(polygon.normal) < .5:
            warped.add(polygon.index)
    if warped:
        # A strongly folded quad has no single geometric normal. Split its
        # planes before smoothing, while retaining one authored face color.
        editable = bmesh.new()
        editable.from_mesh(mesh)
        editable.faces.ensure_lookup_table()
        bmesh.ops.triangulate(editable, faces=[editable.faces[index] for index in sorted(warped)], quad_method="BEAUTY", ngon_method="BEAUTY")
        editable.to_mesh(mesh)
        editable.free()
        mesh.update()
        face_values = mesh.attributes[".neva_facet_value"]
    groups = mesh.attributes.get(".neva_surface")
    rounded = [bool(groups and groups.data[p.index].value) for p in mesh.polygons]
    edge_faces = [[] for _ in mesh.edges]
    vertex_faces = [[] for _ in mesh.vertices]
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            loop = mesh.loops[loop_index]
            edge_faces[loop.edge_index].append(polygon.index)
            vertex_faces[loop.vertex_index].append(polygon.index)
    neighbours = [set() for _ in mesh.polygons]
    cosine = math.cos(sharp_angle)
    for edge, faces in zip(mesh.edges, edge_faces):
        if len(faces) != 2 or edge.use_edge_sharp:
            continue
        a, b = faces
        if rounded[a] and rounded[b] and mesh.polygons[a].normal.dot(mesh.polygons[b].normal) >= cosine:
            neighbours[a].add(b)
            neighbours[b].add(a)
    corner_normals = [None] * len(mesh.loops)
    for vertex, faces in zip(mesh.vertices, vertex_faces):
        remaining = set(faces)
        while remaining:
            first = min(remaining)
            connected, pending = {first}, [first]
            while pending:
                current = pending.pop()
                for neighbour in sorted(neighbours[current] & remaining):
                    if neighbour not in connected:
                        connected.add(neighbour)
                        pending.append(neighbour)
            remaining -= connected
            normal = Vector((0, 0, 0))
            loops = []
            for face_index in sorted(connected):
                polygon = mesh.polygons[face_index]
                ring = list(polygon.vertices)
                corner = ring.index(vertex.index)
                incoming = mesh.vertices[ring[corner - 1]].co - vertex.co
                outgoing = mesh.vertices[ring[(corner + 1) % len(ring)]].co - vertex.co
                angle = incoming.angle(outgoing, 0.0)
                normal += polygon.normal * angle
                loops.append(polygon.loop_start + corner)
            normal.normalize()
            for loop_index in loops:
                corner_normals[loop_index] = tuple(normal)
    for polygon in mesh.polygons:
        polygon.use_smooth = rounded[polygon.index]
    mesh.normals_split_custom_set(corner_normals)

    old = mesh.color_attributes.get("Color")
    if old is not None:
        mesh.color_attributes.remove(old)
    color = mesh.color_attributes.new(name="Color", type="FLOAT_COLOR", domain="CORNER")
    mesh.color_attributes.active_color = color
    for polygon in mesh.polygons:
        value = face_values.data[polygon.index].value
        base = mesh.materials[polygon.material_index].diffuse_color
        rgba = (base[0] * value, base[1] * value, base[2] * value, 1.0)
        for loop_index in polygon.loop_indices:
            color.data[loop_index].color = rgba
    if groups is not None:
        mesh.attributes.remove(groups)
    mesh.attributes.remove(face_values)
    return {"roundedFaces": sum(rounded), "planarFaces": len(rounded) - sum(rounded)}


def apply_vertex_values(obj: bpy.types.Object) -> None:
    """Bake linear semantic color plus broad, bounded COLOR_0 modulation."""
    mesh = obj.data
    if not mesh.polygons or not mesh.loops:
        return
    attribute = mesh.color_attributes.get("Color")
    if attribute is None:
        attribute = mesh.color_attributes.new(name="Color", type="BYTE_COLOR", domain="CORNER")
    mesh.color_attributes.active_color = attribute

    z_values = [vertex.co.z for vertex in mesh.vertices]
    z_min = min(z_values, default=0.0)
    z_max = max(z_values, default=1.0)
    z_span = max(0.001, z_max - z_min)
    key_direction = Vector((0.46, -0.34, 0.82)).normalized()
    for polygon in mesh.polygons:
        normal = polygon.normal.normalized()
        top_light = max(-0.06, min(0.06, normal.z * 0.06))
        key_light = max(-0.025, min(0.025, normal.dot(key_direction) * 0.025))
        material = mesh.materials[polygon.material_index] if mesh.materials else None
        base_color = material.diffuse_color if material is not None else (1.0, 1.0, 1.0, 1.0)
        for loop_index in polygon.loop_indices:
            vertex = mesh.vertices[mesh.loops[loop_index].vertex_index]
            normalized_height = (vertex.co.z - z_min) / z_span
            height_light = (normalized_height - 0.5) * 0.05
            contact_darkening = (1.0 - normalized_height) ** 2 * 0.025
            value = max(
                0.74,
                min(1.0, 0.92 + top_light + key_light + height_light - contact_darkening),
            )
            attribute.data[loop_index].color = (
                base_color[0] * value,
                base_color[1] * value,
                base_color[2] * value,
                1.0,
            )


def add_box(name, location, dimensions, token, parent, *, rotation=(0.0, 0.0, 0.0), bevel=0.025, flat=True):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = _active_object()
    obj.dimensions = dimensions
    return _finish_mesh(obj, name, token, parent, bevel=bevel, flat=flat)


def add_cylinder(name, location, radius, depth, token, parent, *, vertices=8, rotation=(0.0, 0.0, 0.0), bevel=0.0, flat=True):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation
    )
    return _finish_mesh(_active_object(), name, token, parent, bevel=bevel, flat=flat)


def add_cone(name, location, radius1, radius2, depth, token, parent, *, vertices=8, rotation=(0.0, 0.0, 0.0), flat=True):
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices, radius1=radius1, radius2=radius2, depth=depth,
        location=location, rotation=rotation
    )
    return _finish_mesh(_active_object(), name, token, parent, flat=flat)


def add_ico(name, location, scale, token, parent, *, subdivisions=1, rotation=(0.0, 0.0, 0.0), flat=True, normal_mode="planar"):
    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=subdivisions, radius=1.0, location=location, rotation=rotation
    )
    obj = _active_object()
    obj.scale = scale
    return _finish_mesh(obj, name, token, parent, flat=flat, normal_mode=normal_mode)


def add_beam(name, start, end, radius, token, parent, *, vertices=6, flat=True):
    start_vec = Vector(start)
    end_vec = Vector(end)
    direction = end_vec - start_vec
    midpoint = (start_vec + end_vec) * 0.5
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=direction.length, location=midpoint
    )
    obj = _active_object()
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    return _finish_mesh(obj, name, token, parent, flat=flat)


def add_tapered_beam(
    name,
    start,
    end,
    radius_start,
    radius_end,
    token,
    parent,
    *,
    vertices=6,
    flat=True,
):
    """Create one connected low-sided tapered section between authored joints."""
    start_vec = Vector(start)
    end_vec = Vector(end)
    direction = end_vec - start_vec
    if direction.length <= 1e-6:
        raise ValueError(f"{name}: tapered beam endpoints must be distinct")
    midpoint = (start_vec + end_vec) * 0.5
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius_start,
        radius2=radius_end,
        depth=direction.length,
        location=midpoint,
    )
    obj = _active_object()
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    return _finish_mesh(obj, name, token, parent, flat=flat)


def add_limb_tube(
    name,
    points,
    radii,
    token,
    parent,
    *,
    sides=8,
    cap_start=True,
    cap_end=True,
    flat=True,
    normal_mode="rounded",
):
    """Loft one continuous tube through a joint chain.

    Replaces the beam + ico-sphere + beam triples that used to build arms and
    legs. Those left a free-floating ball at every joint that visibly detached
    from the limb when the bone rotated. A single lofted surface with a real
    edge loop at each joint deforms as one piece, and gives distance-based skin
    weighting a clean loop to blend across.

    Each ring is oriented by the average of the incoming and outgoing segment
    directions, which is what miters the joint instead of creasing it. `points`
    and `radii` must be the same length and at least two entries long.
    """
    if len(points) != len(radii):
        raise ValueError(f"{name}: limb tube needs one radius per point")
    if len(points) < 2:
        raise ValueError(f"{name}: limb tube needs at least two points")

    nodes = [Vector(point) for point in points]
    directions = []
    for index in range(len(nodes)):
        if index == 0:
            direction = nodes[1] - nodes[0]
        elif index == len(nodes) - 1:
            direction = nodes[-1] - nodes[-2]
        else:
            incoming = (nodes[index] - nodes[index - 1]).normalized()
            outgoing = (nodes[index + 1] - nodes[index]).normalized()
            direction = incoming + outgoing
        if direction.length <= 1e-6:
            raise ValueError(f"{name}: degenerate limb tube segment at {index}")
        directions.append(direction.normalized())

    vertices = []
    faces = []
    side = None
    previous_direction = None
    for index, (node, radius, direction) in enumerate(zip(nodes, radii, directions)):
        # Transport the frame through bends. Choosing a fresh reference axis at
        # each ring introduces a quarter-turn when a stem crosses the pole.
        if side is None:
            reference = Vector((0.0, 0.0, 1.0))
            if abs(direction.dot(reference)) > 0.94:
                reference = Vector((1.0, 0.0, 0.0))
            side = direction.cross(reference).normalized()
        else:
            side = previous_direction.rotation_difference(direction) @ side
        previous_direction = direction
        # (side, up, direction) must be right-handed or every side quad winds
        # inward and the tube renders inside-out.
        up = direction.cross(side).normalized()
        for step in range(sides):
            angle = (2.0 * math.pi * step) / sides
            width, depth = (radius, radius) if isinstance(radius, (int, float)) else radius
            offset = side * math.cos(angle) * width + up * math.sin(angle) * depth
            vertices.append(node + offset)
        if index > 0:
            base = (index - 1) * sides
            for step in range(sides):
                nxt = (step + 1) % sides
                faces.append((base + step, base + nxt, base + sides + nxt, base + sides + step))

    if cap_start:
        faces.append(tuple(range(sides - 1, -1, -1)))
    if cap_end:
        base = (len(nodes) - 1) * sides
        faces.append(tuple(base + step for step in range(sides)))

    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata([tuple(vertex) for vertex in vertices], [], faces)
    mesh.validate()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection = parent.users_collection[0] if parent.users_collection else bpy.context.scene.collection
    collection.objects.link(obj)
    obj = _finish_mesh(obj, name, token, parent, flat=flat, normal_mode=normal_mode)
    if cap_start:
        set_surface_normals(obj, "planar", faces=[len(faces) - int(cap_end) - 1])
    if cap_end:
        set_surface_normals(obj, "planar", faces=[len(faces) - 1])
    return obj


def graft_limb(surface, face_indices, points, radii, *, token=None, collar_radius=None):
    """Extrude a limb/branch from a real opening in an existing surface.

    The first ring reuses the opening's vertices. Adjacent limbs therefore share
    positions, weights and normals at their root; this is construction, not a
    proximity weld of independently closed objects. Call before skin binding.
    The selected faces must form one disk with a single boundary.
    """
    mesh = surface.data
    selected = set(face_indices)
    if not selected or len(points) != len(radii) or not points:
        raise ValueError("A graft needs an opening and one radius per section")
    directed = set()
    for index in selected:
        ring = list(mesh.polygons[index].vertices)
        for a, b in zip(ring, ring[1:] + ring[:1]):
            if (b, a) in directed:
                directed.remove((b, a))
            else:
                directed.add((a, b))
    start = min(directed)[0]
    boundary, current = [], start
    while True:
        boundary.append(current)
        following = [b for a, b in directed if a == current]
        if len(following) != 1:
            raise ValueError("Graft opening must have one unambiguous boundary")
        current = following[0]
        if current == start:
            break
        if current in boundary:
            raise ValueError("Graft opening is not a disk")
    if len(boundary) != len(directed):
        raise ValueError("Graft opening has multiple boundaries")
    vertices = [v.co.copy() for v in mesh.vertices]
    faces = [tuple(p.vertices) for p in mesh.polygons if p.index not in selected]
    materials = [p.material_index for p in mesh.polygons if p.index not in selected]
    attribute = mesh.attributes.get(".neva_surface")
    groups = [attribute.data[p.index].value if attribute else 0 for p in mesh.polygons if p.index not in selected]
    slots = list(mesh.materials)
    material_index = mesh.polygons[min(selected)].material_index
    if token is not None:
        material = get_or_create_material(token)
        if material not in slots:
            slots.append(material)
        material_index = slots.index(material)
    if collar_radius is not None:
        if len(boundary) != 4:
            raise ValueError("A branch collar requires one quadrilateral opening")
        a, b, c, d = [vertices[index] for index in boundary]
        u_length = ((b - a).length + (c - d).length) * .5
        v_length = ((d - a).length + (c - b).length) * .5
        du, dv = min(.4, collar_radius / u_length), min(.4, collar_radius / v_length)
        inset = []
        for u, v in ((.5 - du, .5 - dv), (.5 + du, .5 - dv), (.5 + du, .5 + dv), (.5 - du, .5 + dv)):
            inset.append(len(vertices))
            vertices.append(a * (1 - u) * (1 - v) + b * u * (1 - v) + c * u * v + d * (1 - u) * v)
        for step in range(4):
            nxt = (step + 1) % 4
            faces.append((boundary[step], boundary[nxt], inset[nxt], inset[step]))
            materials.append(material_index)
            groups.append(1)
        boundary = inset
    inverse = surface.matrix_world.inverted()
    nodes = [inverse @ Vector(point) for point in points]
    previous = boundary
    center = sum((vertices[index] for index in boundary), Vector()) / len(boundary)
    previous_direction = sum((mesh.polygons[index].normal * mesh.polygons[index].area for index in selected), Vector()).normalized()
    side = vertices[boundary[0]] - center
    side = (side - previous_direction * side.dot(previous_direction)).normalized()
    up = previous_direction.cross(side)
    # A rectangular opening does not have equally spaced polar angles. Keeping
    # its authored angles prevents the first branch ring from folding its quads.
    angles = [math.atan2((vertices[index] - center).dot(up), (vertices[index] - center).dot(side)) for index in boundary]
    rings = [boundary]
    for node_index, (node, radius) in enumerate(zip(nodes, radii)):
        direction = node - center if node_index == len(nodes) - 1 else nodes[node_index + 1] - center
        direction.normalize()
        side = previous_direction.rotation_difference(direction) @ side
        previous_direction = direction
        up = direction.cross(side).normalized()
        width, depth = (radius, radius) if isinstance(radius, (int, float)) else radius
        ring = []
        for angle in angles:
            ring.append(len(vertices))
            vertices.append(node + side * math.cos(angle) * width + up * math.sin(angle) * depth)
        for step in range(len(ring)):
            nxt = (step + 1) % len(ring)
            faces.append((previous[step], previous[nxt], ring[nxt], ring[step]))
            materials.append(material_index)
            groups.append(1)
        rings.append(ring)
        previous, center = ring, node
    faces.append(tuple(previous))
    materials.append(material_index)
    groups.append(0)
    replacement = bpy.data.meshes.new(mesh.name + "_grafted")
    replacement.from_pydata(vertices, [], faces)
    replacement.update()
    for material in slots:
        replacement.materials.append(material)
    surface.data = replacement
    style = replacement.attributes.new(".neva_surface", "INT", "FACE")
    for polygon, material_index, group in zip(replacement.polygons, materials, groups):
        polygon.material_index = material_index
        style.data[polygon.index].value = group
    apply_vertex_values(surface)
    if mesh.users == 0:
        bpy.data.meshes.remove(mesh)
    return rings


# --- Body forms and conforming garments -------------------------------------
#
# Every builder above shapes one closed primitive in isolation, which is why a
# generated character read as a stack of separate blobs: an apron had no way to
# know the shape of the chest it hung on, so it could only ever be a slab
# parked in front of one. The builders below all consume the same authored
# cross-section list, so a garment is *derived* from the body underneath it and
# lands on that silhouette by construction instead of by hand-tuned offsets.
#
# A section is ``((x, y, z), half_width, half_depth)``: one horizontal
# elliptical slice of the form, ordered bottom to top. Angles are measured from
# the character's front (-Y) and increase toward +X, so an arc of
# ``(-1.2, 1.2)`` is the front of the chest and ``0`` is the sternum.


def _ellipse_point(center, half_width: float, half_depth: float, angle: float) -> Vector:
    """One point on a cross-section, angle measured from the front (-Y)."""
    return Vector((
        center[0] + math.sin(angle) * half_width,
        center[1] - math.cos(angle) * half_depth,
        center[2],
    ))


def _ellipse_normal(half_width: float, half_depth: float, angle: float) -> Vector:
    """True outward normal of that cross-section, not a scaled radius.

    Scaling an ellipse outward thickens the flat flanks far more than the sharp
    front, which is exactly the error that made offset garments bulge at the
    sides. Offsetting along the real normal keeps a constant gap to the body.
    """
    normal = Vector((math.sin(angle) * half_depth, -math.cos(angle) * half_width, 0.0))
    if normal.length <= 1e-9:
        return Vector((0.0, -1.0, 0.0))
    return normal.normalized()


def _validate_sections(name: str, sections, minimum: int = 2) -> list:
    resolved = [(Vector(center), float(half_width), float(half_depth)) for center, half_width, half_depth in sections]
    if len(resolved) < minimum:
        raise ValueError(f"{name}: needs at least {minimum} cross-sections")
    return resolved


def _section_origin(sections) -> Vector:
    total = Vector((0.0, 0.0, 0.0))
    for center, _, _ in sections:
        total += center
    return total / len(sections)


def _build_mesh(name, origin, vertices, faces, token, parent, *, flat=True, bevel=0.0, recalc_normals=False, normal_mode="planar"):
    """Link one authored vertex/face soup as a mesh object seated at `origin`.

    Vertices are authored relative to `origin` so object transforms retain the
    intended pivot for attachment and animation. Set `recalc_normals` when the
    face winding is generated rather than hand-checked, so the solid still
    survives the backface culling every palette material turns on.
    """
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata([tuple(vertex) for vertex in vertices], [], faces)
    mesh.validate()
    mesh.update(calc_edges=recalc_normals)
    if recalc_normals:
        editable = bmesh.new()
        editable.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(editable, faces=editable.faces)
        editable.to_mesh(mesh)
        editable.free()
    obj = bpy.data.objects.new(name, mesh)
    collection = parent.users_collection[0] if parent.users_collection else bpy.context.scene.collection
    collection.objects.link(obj)
    obj.location = origin
    return _finish_mesh(obj, name, token, parent, flat=flat, bevel=bevel, normal_mode=normal_mode)


def add_lofted_form(
    name,
    sections,
    token,
    parent,
    *,
    sides=12,
    cap_bottom=True,
    cap_top=True,
    flat=True,
    bevel=0.0,
    normal_mode="rounded",
):
    """Loft one closed volume through authored elliptical cross-sections.

    A sphere can only ever be an egg. A stack of rings is the cheapest way to
    author a torso that actually has shoulders and a waist, a skull that tapers
    into a jaw, or a boot that spreads from ankle to sole -- and it costs fewer
    triangles than the subdivided ico-spheres it replaces.

    Ring vertex order is shared with `add_conforming_shell` and
    `add_garment_hem`, so a garment authored from the same section list sits on
    the silhouette it was derived from.
    """
    resolved = _validate_sections(name, sections)
    if sides < 3:
        raise ValueError(f"{name}: a lofted form needs at least three sides")

    origin = _section_origin(resolved)
    vertices = []
    faces = []
    for index, (center, half_width, half_depth) in enumerate(resolved):
        for step in range(sides):
            angle = (2.0 * math.pi * step) / sides
            vertices.append(_ellipse_point(center, half_width, half_depth, angle) - origin)
        if index > 0:
            base = (index - 1) * sides
            for step in range(sides):
                nxt = (step + 1) % sides
                faces.append((base + step, base + nxt, base + sides + nxt, base + sides + step))

    if cap_bottom:
        faces.append(tuple(range(sides - 1, -1, -1)))
    if cap_top:
        base = (len(resolved) - 1) * sides
        faces.append(tuple(base + step for step in range(sides)))

    obj = _build_mesh(name, origin, vertices, faces, token, parent, flat=flat, bevel=bevel, normal_mode=normal_mode)
    if cap_bottom:
        set_surface_normals(obj, "planar", faces=[len(faces) - int(cap_top) - 1])
    if cap_top:
        set_surface_normals(obj, "planar", faces=[len(faces) - 1])
    return obj


def add_conforming_shell(
    name,
    sections,
    token,
    parent,
    *,
    arc=(-1.20, 1.20),
    offset=0.010,
    thickness=0.016,
    segments=8,
    flat=True,
    bevel=0.0,
):
    """Skin a panel of garment onto the body form the sections describe.

    Pass the same sections used for the torso and the panel follows its
    silhouette at a constant `offset`, with `thickness` of visible material at
    every free edge. This is what an apron bib, a shirt front or a vest panel
    is: cloth lying on a chest, not a box hovering in front of one.

    `arc` is the angular span in radians measured from the front (-Y), so
    ``(-1.2, 1.2)`` wraps roughly the front 140 degrees and ``(0.4, 2.6)``
    wraps one flank.
    """
    resolved = _validate_sections(name, sections)
    if segments < 1:
        raise ValueError(f"{name}: a conforming shell needs at least one segment")

    arc_start, arc_end = float(arc[0]), float(arc[1])
    origin = _section_origin(resolved)
    count = segments + 1
    rows = len(resolved)
    angles = [arc_start + (arc_end - arc_start) * (step / segments) for step in range(count)]

    vertices = []
    for center, half_width, half_depth in resolved:
        for angle in angles:
            point = _ellipse_point(center, half_width, half_depth, angle)
            normal = _ellipse_normal(half_width, half_depth, angle)
            vertices.append(point + normal * offset - origin)
    for center, half_width, half_depth in resolved:
        for angle in angles:
            point = _ellipse_point(center, half_width, half_depth, angle)
            normal = _ellipse_normal(half_width, half_depth, angle)
            vertices.append(point + normal * (offset + thickness) - origin)

    def inner(row, step):
        return row * count + step

    def outer(row, step):
        return rows * count + row * count + step

    faces = []
    for row in range(rows - 1):
        for step in range(segments):
            faces.append((outer(row, step), outer(row, step + 1), outer(row + 1, step + 1), outer(row + 1, step)))
            faces.append((inner(row, step), inner(row + 1, step), inner(row + 1, step + 1), inner(row, step + 1)))
        faces.append((inner(row, 0), outer(row, 0), outer(row + 1, 0), inner(row + 1, 0)))
        faces.append((inner(row, segments), inner(row + 1, segments), outer(row + 1, segments), outer(row, segments)))
    for step in range(segments):
        faces.append((inner(0, step), inner(0, step + 1), outer(0, step + 1), outer(0, step)))
        faces.append((inner(rows - 1, step), outer(rows - 1, step), outer(rows - 1, step + 1), inner(rows - 1, step + 1)))

    return _build_mesh(name, origin, vertices, faces, token, parent, flat=flat, bevel=bevel)


def add_garment_hem(
    name,
    sections,
    token,
    parent,
    *,
    offset=0.010,
    thickness=0.018,
    flare=0.030,
    sides=12,
    flat=True,
):
    """Wrap a skirt, tunic or trouser hem all the way around a body form.

    Same offset surface as `add_conforming_shell`, closed through 360 degrees
    and with `flare` added at the *bottom* section and tapered to nothing at
    the top. The flare is what stops a hem reading as a tube: cloth falls away
    from the leg it hangs on, and the open bottom edge shows its thickness.
    """
    resolved = _validate_sections(name, sections)
    if sides < 3:
        raise ValueError(f"{name}: a garment hem needs at least three sides")

    origin = _section_origin(resolved)
    rows = len(resolved)
    angles = [(2.0 * math.pi * step) / sides for step in range(sides)]

    vertices = []
    for surface in (0.0, 1.0):
        for row, (center, half_width, half_depth) in enumerate(resolved):
            ramp = 1.0 - (row / (rows - 1))
            grown = offset + flare * ramp + thickness * surface
            for angle in angles:
                point = _ellipse_point(center, half_width, half_depth, angle)
                normal = _ellipse_normal(half_width, half_depth, angle)
                vertices.append(point + normal * grown - origin)

    def inner(row, step):
        return row * sides + (step % sides)

    def outer(row, step):
        return rows * sides + row * sides + (step % sides)

    faces = []
    for row in range(rows - 1):
        for step in range(sides):
            faces.append((outer(row, step), outer(row, step + 1), outer(row + 1, step + 1), outer(row + 1, step)))
            faces.append((inner(row, step), inner(row + 1, step), inner(row + 1, step + 1), inner(row, step + 1)))
    for step in range(sides):
        faces.append((inner(0, step), inner(0, step + 1), outer(0, step + 1), outer(0, step)))
        faces.append((inner(rows - 1, step), outer(rows - 1, step), outer(rows - 1, step + 1), inner(rows - 1, step + 1)))

    return _build_mesh(name, origin, vertices, faces, token, parent, flat=flat)


def add_cuff_band(
    name,
    center,
    radius,
    width,
    token,
    parent,
    *,
    direction=(0.0, 0.0, 1.0),
    thickness=0.014,
    flare=0.0,
    sides=10,
    flat=True,
):
    """Ring a limb with a rolled band at one point along its axis.

    A torus reads as a doughnut threaded onto an arm. A rolled cuff is a short
    walled band that shares the limb's axis, so it has to be oriented by
    `direction` -- the limb's own direction at that point -- or it slices
    through the sleeve the moment the arm is not vertical. `flare` widens the
    open end (the one `direction` points at) so the roll bells outward.
    """
    axis = Vector(direction)
    if axis.length <= 1e-6:
        raise ValueError(f"{name}: a cuff band needs a non-degenerate direction")
    axis.normalize()
    reference = Vector((0.0, 0.0, 1.0))
    if abs(axis.dot(reference)) > 0.94:
        reference = Vector((1.0, 0.0, 0.0))
    side = axis.cross(reference).normalized()
    up = axis.cross(side).normalized()

    origin = Vector(center)
    start = -axis * (width * 0.5)
    end = axis * (width * 0.5)

    vertices = []
    for base, grow in ((start, 0.0), (end, flare)):
        for radial in (radius + grow, radius + thickness + grow):
            for step in range(sides):
                angle = (2.0 * math.pi * step) / sides
                vertices.append(base + (side * math.cos(angle) + up * math.sin(angle)) * radial)

    inner_start, outer_start, inner_end, outer_end = 0, sides, 2 * sides, 3 * sides
    faces = []
    for step in range(sides):
        nxt = (step + 1) % sides
        faces.append((outer_start + step, outer_start + nxt, outer_end + nxt, outer_end + step))
        faces.append((inner_start + step, inner_end + step, inner_end + nxt, inner_start + nxt))
        faces.append((inner_start + step, inner_start + nxt, outer_start + nxt, outer_start + step))
        faces.append((inner_end + step, outer_end + step, outer_end + nxt, inner_end + nxt))

    return _build_mesh(name, origin, vertices, faces, token, parent, flat=flat)


def add_strap(
    name,
    points,
    width,
    thickness,
    token,
    parent,
    *,
    normals=None,
    flat=True,
):
    """Lay a flat band along a path so it lies *on* the surface it crosses.

    `add_rope_line` sweeps a round tube, which is right for rope and wrong for
    every strap on a character: an apron tie or a satchel strap is flat webbing
    whose broad face is pressed against the body. The band's width axis is
    therefore held tangential to the surface, using `normals` when the caller
    knows them and the outward radial from the body's vertical axis otherwise.
    """
    nodes = [Vector(point) for point in points]
    if len(nodes) < 2:
        raise ValueError(f"{name}: a strap needs at least two points")
    if normals is not None and len(normals) != len(nodes):
        raise ValueError(f"{name}: a strap needs one normal per point")

    directions = []
    for index in range(len(nodes)):
        if index == 0:
            direction = nodes[1] - nodes[0]
        elif index == len(nodes) - 1:
            direction = nodes[-1] - nodes[-2]
        else:
            direction = (nodes[index] - nodes[index - 1]).normalized() + (nodes[index + 1] - nodes[index]).normalized()
        if direction.length <= 1e-6:
            raise ValueError(f"{name}: degenerate strap segment at {index}")
        directions.append(direction.normalized())

    origin = sum(nodes, Vector((0.0, 0.0, 0.0))) / len(nodes)
    half_width = width * 0.5
    half_thickness = thickness * 0.5

    vertices = []
    for index, (node, direction) in enumerate(zip(nodes, directions)):
        if normals is not None:
            normal = Vector(normals[index])
        else:
            normal = Vector((node.x, node.y, 0.0))
        normal = normal - direction * normal.dot(direction)
        if normal.length <= 1e-6:
            normal = Vector((0.0, -1.0, 0.0)) - direction * direction.y * -1.0
            if normal.length <= 1e-6:
                normal = Vector((0.0, 0.0, 1.0)) - direction * direction.z
        normal.normalize()
        # `normal x side == direction` keeps the four corners wound the same way
        # as every other swept builder here, so the faces point outward.
        side = direction.cross(normal).normalized()
        vertices.append(node + normal * half_thickness + side * half_width - origin)
        vertices.append(node - normal * half_thickness + side * half_width - origin)
        vertices.append(node - normal * half_thickness - side * half_width - origin)
        vertices.append(node + normal * half_thickness - side * half_width - origin)

    faces = []
    for index in range(len(nodes) - 1):
        base = index * 4
        for step in range(4):
            nxt = (step + 1) % 4
            faces.append((base + step, base + nxt, base + 4 + nxt, base + 4 + step))
    faces.append((3, 2, 1, 0))
    tail = (len(nodes) - 1) * 4
    faces.append((tail, tail + 1, tail + 2, tail + 3))

    return _build_mesh(name, origin, vertices, faces, token, parent, flat=flat)


def add_tri_prism(name, center, size, token, parent, *, rotation=(0.0, 0.0, 0.0)):
    width, depth, height = size
    x, y, z = width / 2, depth / 2, height / 2
    vertices = [(-x, -y, -z), (x, -y, -z), (0, -y, z), (-x, y, -z), (x, y, -z), (0, y, z)]
    faces = [(0, 1, 2), (3, 5, 4), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)]
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = center
    obj.rotation_euler = rotation
    return _finish_mesh(obj, name, token, parent, flat=True)


def add_ring(name, location, major_radius, minor_radius, token, parent, *, major_segments=12, minor_segments=4, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius, minor_radius=minor_radius,
        major_segments=major_segments, minor_segments=minor_segments,
        location=location, rotation=rotation
    )
    return _finish_mesh(_active_object(), name, token, parent, flat=True)


def add_marker(name, location, parent, *, marker_type="interaction"):
    marker = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(marker)
    marker.empty_display_type = "PLAIN_AXES"
    marker.location = location
    marker.parent = parent
    marker["neva_marker"] = marker_type
    return marker


def add_grip_marker(name, location, parent, *, fingers, contact_normal):
    """An anatomical palm frame: +Y along fingers, +Z toward held material."""
    y_axis = Vector(fingers).normalized()
    z_axis = Vector(contact_normal)
    z_axis -= y_axis * z_axis.dot(y_axis)
    if z_axis.length_squared < 1e-8:
        raise ValueError(f"{name}: palm normal must not be parallel to fingers")
    z_axis.normalize()
    x_axis = y_axis.cross(z_axis).normalized()
    marker = add_marker(name, location, parent, marker_type="grip")
    marker.rotation_mode = "QUATERNION"
    # glTF rebases an empty's local axes as well as its world transform.
    # Postmultiply Blender Rx(-90) so the EXPORTED +Y/+Z retain this contract.
    marker.rotation_quaternion = Matrix((x_axis, -z_axis, y_axis)).transposed().to_quaternion()
    marker["neva_grip_frame"] = "palm-y-fingers-z-contact-v1"
    return marker


def add_collision_box(name, location, dimensions, parent, *, rotation=(0.0, 0.0, 0.0)):
    marker = add_marker(name, location, parent, marker_type="collision")
    marker.rotation_euler = rotation
    marker["shape"] = "box"
    marker["dimensions"] = list(dimensions)
    return marker


def add_collision_primitives(spec: dict, parent) -> list[bpy.types.Object]:
    """Emit catalog-authored box markers, converting runtime Y-up coordinates to Blender Z-up."""
    primitives = spec.get("collisionPrimitives")
    if spec.get("collision") == "none":
        if primitives:
            raise ValueError(f"{spec['id']}: nonblocking assets cannot define collision primitives")
        return []
    if not primitives:
        raise ValueError(f"{spec['id']}: blocking assets require collisionPrimitives")

    markers = []
    for index, primitive in enumerate(primitives):
        center_x, center_y, center_z = primitive["center"]
        half_x, half_y, half_z = primitive["halfExtents"]
        name = f"COL_{spec['id']}" if index == 0 else f"COL_{spec['id']}_{primitive['id']}"
        markers.append(add_collision_box(
            name,
            (center_x, -center_z, center_y),
            (half_x * 2, half_z * 2, half_y * 2),
            parent,
            rotation=(0.0, 0.0, math.radians(primitive.get("yawDegrees", 0.0))),
        ))
    return markers


def join_meshes(objects: Iterable[bpy.types.Object], name: str):
    objects = [obj for obj in objects if obj is not None and obj.type == "MESH"]
    if not objects:
        return None
    for selected in bpy.context.view_layer.objects:
        selected.select_set(False)
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    with _object_operator_context(objects[0], objects):
        bpy.ops.object.join()
    objects[0].name = name
    objects[0].data.name = f"{name}_mesh"
    return objects[0]


_CAUDAL_FORMS = ("forked", "lunate", "rounded", "square", "heterocercal")


def _caudal_outline(form: str, span: float, height: float, rays: int):
    """Trace a caudal fin once, from the bottom of its base around to the top.

    Returned points are (y, z) in the fin's own plane with the peduncle
    attachment at the origin, so the caller only has to place the object.
    """
    if form not in _CAUDAL_FORMS:
        raise ValueError(f"unknown caudal form {form!r}; expected one of {_CAUDAL_FORMS}")
    upper = height * (0.62 if form == "heterocercal" else 0.5)
    lower = height * (0.30 if form == "heterocercal" else 0.5)
    base_half = height * 0.16

    points = [(0.0, -base_half)]
    for index in range(rays + 1):
        position = -1.0 + 2.0 * index / rays
        magnitude = abs(position)
        if form == "forked":
            # A shallow notch: the lobes reach three times further than the fork.
            reach = 0.34 + 0.66 * magnitude
        elif form == "lunate":
            # Tuna and billfish: a deep crescent whose lobes sweep hard aft.
            reach = 0.16 + 0.84 * magnitude**0.62
        elif form == "rounded":
            reach = math.sqrt(max(0.0, 1.0 - magnitude**2.6))
        elif form == "square":
            reach = 1.0 - 0.10 * magnitude
        else:
            reach = 0.30 + (0.70 * magnitude**0.8 if position > 0 else 0.55 * magnitude)
        points.append((reach * span, position * (upper if position >= 0 else lower)))
    points.append((0.0, upper * 0.32))
    return points


def add_caudal_fin(
    name,
    attach,
    span,
    height,
    form,
    token,
    parent,
    *,
    thickness=0.012,
    rays=6,
    flat=True,
):
    """Author one tail fin as a solid fan of rays seated on the peduncle.

    Two crossing triangular prisms make a four-pointed star, not a tail. A fin
    is a thin lamina whose *outline* carries the whole read, so it is built as
    an explicit fan from an anchor tucked just inside the body: the silhouette
    is exact, the notch stays a notch, and the result is still a closed volume
    that survives the backface culling every palette material turns on.

    The fish families author forward along +Y, so `span` runs aft along +Y and
    `height` is the vertical extent in Z.
    """
    outline = _caudal_outline(form, span, height, rays)
    count = len(outline)
    half = thickness * 0.5
    inset = span * 0.06

    vertices = [(-half, -inset, 0.0)]
    vertices.extend((-half, y, z) for y, z in outline)
    vertices.append((half, -inset, 0.0))
    vertices.extend((half, y, z) for y, z in outline)

    back = count + 1
    faces = []
    for index in range(count):
        following = (index + 1) % count
        faces.append((0, 1 + index, 1 + following))
        faces.append((back, back + 1 + following, back + 1 + index))
        faces.append((1 + index, 1 + following, back + 1 + following, back + 1 + index))

    return _build_mesh(
        name, Vector(attach), vertices, faces, token, parent, flat=flat, recalc_normals=True
    )


def add_leaf_blade(
    name,
    base,
    tip,
    width,
    token,
    parent,
    *,
    thickness=0.010,
    cup=0.20,
    bend=(0.0, 0.0, 0.0),
    stations=4,
    flat=True,
):
    """Author one leaf as a tapered ribbon with a raised midrib.

    A leaf drawn as a single flat quad disappears the moment the camera reaches
    its edge, and a triangular prism reads as a shard rather than a blade. This
    lofts a four-sided cross-section -- two edges, a midrib ridge and a keel --
    along a quadratic bend from `base` to `tip`, so the leaf keeps a silhouette
    from every angle and still closes into a solid.
    """
    if stations < 2:
        raise ValueError(f"{name}: a leaf blade needs at least two stations")
    start = Vector(base)
    end = Vector(tip)
    control = (start + end) * 0.5 + Vector(bend)
    origin = start

    def point_at(t: float) -> Vector:
        inverse = 1.0 - t
        return inverse * inverse * start + 2.0 * inverse * t * control + t * t * end

    vertices = []
    for index in range(stations):
        t = index / stations
        centre = point_at(t)
        tangent = (point_at(min(1.0, t + 0.02)) - point_at(max(0.0, t - 0.02)))
        if tangent.length <= 1e-9:
            tangent = end - start
        tangent = tangent.normalized()
        side = tangent.cross(Vector((0.0, 0.0, 1.0)))
        if side.length <= 1e-6:
            side = tangent.cross(Vector((0.0, 1.0, 0.0)))
        side = side.normalized()
        normal = side.cross(tangent).normalized()
        # Widest a little past the base, drawn to a point at the tip.
        half_width = width * 0.5 * math.sin(math.pi * min(1.0, 0.12 + 0.88 * t))
        ridge = normal * (cup * half_width + thickness * 0.5)
        keel = normal * (cup * half_width - thickness * 0.5)
        for offset in (-side * half_width, ridge, side * half_width, keel):
            vertices.append(centre + offset - origin)
    vertices.append(end - origin)

    faces = [(0, 3, 2, 1)]
    for index in range(stations - 1):
        ring, following = index * 4, (index + 1) * 4
        for step in range(4):
            nxt = (step + 1) % 4
            faces.append((ring + step, ring + nxt, following + nxt, following + step))
    apex = stations * 4
    last = (stations - 1) * 4
    for step in range(4):
        faces.append((last + step, last + (step + 1) % 4, apex))

    return _build_mesh(
        name, origin, vertices, faces, token, parent, flat=flat, recalc_normals=True, normal_mode="rounded"
    )


def add_flower_head(
    name,
    centre,
    radius,
    disc_token,
    back_token,
    petal_token,
    parent,
    *,
    petals=12,
    nod=0.0,
    yaw=0.0,
    petal_reach=1.40,
):
    """Author a composite flower head that nods instead of staring at the sky.

    A ring of petals authored flat in the XY plane reads as nothing from a
    game camera, and its own centre disc hides it from above. This tilts the
    whole head by `nod` and places every petal inside that tilted plane, so the
    ring stays welded to the disc and presents its face to the player. Lifted
    from the sunflower stand, which already got this right.
    """
    cx, cy, cz = centre
    offset_y, offset_z = math.cos(yaw), math.sin(yaw)

    def placed(local_x: float, local_y: float, local_z: float):
        return (
            cx + local_x * offset_y - local_y * offset_z,
            cy + local_x * offset_z + local_y * offset_y,
            cz + local_z,
        )

    add_cylinder(
        f"{name}_disc", (cx, cy, cz), radius, radius * 0.44, disc_token, parent,
        vertices=10, rotation=(nod, 0, yaw), bevel=radius * 0.09,
    )
    add_cylinder(
        f"{name}_back", placed(0.0, radius * 0.22, -radius * 0.15), radius * 1.13,
        radius * 0.20, back_token, parent, vertices=10, rotation=(nod, 0, yaw),
    )
    ring = radius * petal_reach
    for petal in range(petals):
        theta = petal * math.tau / petals
        add_tri_prism(
            f"{name}_petal_{petal:02d}",
            placed(
                -math.sin(theta) * ring,
                math.cos(theta) * ring * math.cos(nod),
                math.cos(theta) * ring * math.sin(nod),
            ),
            (radius * 0.54, radius * 1.17, radius * 0.14),
            petal_token,
            parent,
            rotation=(nod, 0, theta + yaw),
        )
