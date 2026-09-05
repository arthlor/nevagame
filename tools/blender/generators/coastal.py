"""Reference-led harbor habitat. Closed leaf ribbons, bedded fractures and timber joinery.

All coordinates are Blender Z-up. Custom wind weights survive catalog export as
_NEVA_WIND; structural parts carry zero. Color modulation describes contact and
material variation, never a fixed sunlight direction.
"""
from __future__ import annotations

import math
import bpy
from mathutils import Vector
from common.geometry import add_box, add_beam, add_tapered_beam, add_limb_tube, add_collision_primitives, seeded_rng, set_surface_normals
from common.lod import create_lod_roots, consolidate_lod_level
from common.materials import get_or_create_material


def _mesh(name, vertices, faces, token, parent, weights=None, smooth=False):
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    set_surface_normals(obj, "rounded" if smooth else "planar")
    mesh.materials.append(get_or_create_material(token))
    for polygon in mesh.polygons:
        polygon.use_smooth = smooth
    if weights is not None:
        attribute = mesh.attributes.new("_NEVA_WIND", "FLOAT", "POINT")
        for item, weight in zip(attribute.data, weights):
            item.value = weight
    return obj


def _neutralize(parent, wind=False):
    for obj in parent.children:
        if obj.type != "MESH":
            continue
        mesh = obj.data
        if wind and not mesh.attributes.get("_NEVA_WIND"):
            mesh.attributes.new("_NEVA_WIND", "FLOAT", "POINT")
        colors = mesh.color_attributes.get("Color") or mesh.color_attributes.new(name="Color", type="BYTE_COLOR", domain="CORNER")
        mesh.color_attributes.active_color = colors
        for polygon in mesh.polygons:
            base = mesh.materials[polygon.material_index].diffuse_color
            for loop in polygon.loop_indices:
                z = mesh.vertices[mesh.loops[loop].vertex_index].co.z
                value = 0.96 - 0.045 * math.exp(-max(0, z) * 2.4)
                colors.data[loop].color = (*[channel * value for channel in base[:3]], 1)


def _lods(spec, root, builder, wind=False):
    for level, parent in create_lod_roots(spec, root):
        builder(spec, parent, level)
        # Ensure zero-weight bark/branches participate in the same attribute contract.
        _neutralize(parent, wind)
        consolidate_lod_level(parent, f"{spec['id']}_LOD{level}")
        _neutralize(parent, wind)
    add_collision_primitives(spec, root)


def _ribbon(name, centers, widths, side, token, parent, weights, fold=0.08):
    """Closed, creased blade: readable upper/lower normals without alpha cards."""
    centers = [Vector(center) for center in centers]
    side = Vector(side).normalized()
    verts, faces, bend = [], [], []
    previous_tangent = None
    for index, (center, width, weight) in enumerate(zip(centers, widths, weights)):
        tangent = (centers[min(len(centers) - 1, index + 1)] - centers[max(0, index - 1)]).normalized()
        if previous_tangent is None:
            side = (side - tangent * side.dot(tangent)).normalized()
            if tangent.cross(side).z < 0:
                side.negate()
        else:
            side = previous_tangent.rotation_difference(tangent) @ side
        previous_tangent = tangent
        up = tangent.cross(side).normalized()
        for point in (center - side * width, center + up * max(.0025, fold * width), center + side * width,
                      center - up * .014):
            verts.append(tuple(point))
            bend.append(weight)
    for row in range(len(centers) - 1):
        a, b = row * 4, (row + 1) * 4
        for left, right in ((0, 1), (1, 2), (2, 3), (3, 0)):
            faces.append((a + left, b + left, b + right, a + right))
    faces.extend([(0, 1, 2, 3), tuple((len(centers) - 1) * 4 + i for i in reversed(range(4)))])
    return _mesh(name, verts, faces, token, parent, bend, smooth=True)


def _palm(spec, parent, lod):
    p, rng = spec["parameters"], seeded_rng(spec["seed"])
    wood, green, sun, shade = spec["palette"]
    height, lean, spread = p["height"], p["lean"], p["spread"]
    rings = 18 if lod == 0 else 8
    points = [(lean * (i / rings) ** 1.65, math.sin(i / rings * 2.1) * .22, height * i / rings) for i in range(rings + 1)]
    radii = [(.27 * (1 - .48 * i / rings) + .08 * math.exp(-i)) for i in range(rings + 1)]
    # One reference axis for the complete lean prevents a ring from rotating
    # ninety degrees when the long trunk crosses the limb helper's pole cutoff.
    sides = 10 if lod == 0 else 7
    vertices, faces = [], []
    for i, point in enumerate(points):
        tangent = (Vector(points[min(rings,i+1)]) - Vector(points[max(0,i-1)])).normalized()
        side = tangent.cross(Vector((0,1,0))).normalized()
        up = tangent.cross(side).normalized()
        for j in range(sides):
            angle = j * math.tau / sides
            vertices.append(tuple(Vector(point) + radii[i] * (side*math.cos(angle) + up*math.sin(angle))))
        if i:
            for j in range(sides):
                a,b=(i-1)*sides+j,(i-1)*sides+(j+1)%sides
                faces.append((a,b,b+sides,a+sides))
    faces.extend([tuple(reversed(range(sides))),tuple(rings*sides+j for j in range(sides))])
    _mesh("curved_palm_trunk",vertices,faces,wood,parent,smooth=True)
    if lod == 0:
        for i in range(2, rings):
            # Narrow old leaf scars follow the lean; these are bark structure, not painted rings.
            t = i / rings
            point = Vector(points[i])
            add_tapered_beam(f"scar_{i}", point - Vector((0, 0, .028)), point + Vector((0, 0, .028)),
                             radii[i] * 1.04, radii[i] * 1.02, wood, parent, vertices=10)
    crown = Vector(points[-1])
    count = p["fronds"] if lod == 0 else max(6, p["fronds"] - 3)
    for frond in range(count):
        angle = frond * math.tau / count + rng.uniform(-.14, .14)
        axis = Vector((math.cos(angle), math.sin(angle), 0))
        side = Vector((-axis.y, axis.x, 0))
        length = spread * rng.uniform(.82, 1.16)
        droop = .75 + (frond % 3) * .46
        def spine(t):
            return crown + axis * (length * t) + Vector((0, 0, math.sin(t * math.pi) * .68 - droop * t * t + .1))
        token = (green, sun, green, shade)[frond % 4]
        segments = 9 if lod == 0 else 5
        _ribbon(f"frond_rib_{frond}", [spine(i / segments) for i in range(segments + 1)],
                [.035 * (1 - .85 * i / segments) for i in range(segments + 1)], side, token, parent,
                [(i / segments) ** 1.5 * .65 for i in range(segments + 1)])
        pairs = p["leafletPairs"] if lod == 0 else max(6, p["leafletPairs"] // 2)
        for j in range(pairs):
            t = .09 + .85 * j / pairs
            length_leaf = (.2 + .7 * math.sin(math.pi * t) ** .55) * (length / 3.2)
            for sign in (-1, 1):
                base = spine(t + (0.015 if sign > 0 else 0))
                end = base + side * sign * length_leaf + axis * (.14 + .20 * t) + Vector((0, 0, -.18 - t * .16))
                middle = base.lerp(end, .47) + Vector((0, 0, .065))
                _ribbon(f"leaflet_{frond}_{j}_{sign}", [base, middle, end], [.022, .12 if lod == 0 else .17, .004],
                        axis, token, parent, [t * .38, .4 + t * .4, .65 + t * .35])
    for i in range(4):
        a = i * math.tau / 4 + .4
        add_tapered_beam(f"palm_root_{i}", (0, 0, .18), (.55 * math.cos(a), .55 * math.sin(a), .025), .095, .02, wood, parent)


def coastal_palm(spec, root):
    _lods(spec, root, _palm, wind=True)


def _understory(spec, parent, lod):
    p, rng = spec["parameters"], seeded_rng(spec["seed"])
    green, sun, shade = spec["palette"]
    count = p["leaves"] if lod == 0 else max(5, p["leaves"] // 2)
    split = p["form"] == "split"
    shrub = p["form"] == "shrub"
    for i in range(count):
        angle = i * 2.39996 + rng.uniform(-.22, .22)
        axis = Vector((math.cos(angle), math.sin(angle), 0))
        side = Vector((-axis.y, axis.x, 0))
        height = p["height"] * rng.uniform(.58, 1.02)
        start = Vector((0, 0, .08)) if not shrub else axis * .2 + Vector((0, 0, height * .35))
        base = axis * p["spread"] * .22 + Vector((0, 0, height * .62))
        end = axis * p["spread"] * rng.uniform(.75, 1.05) + Vector((0, 0, height * .72))
        token = (green, sun, green, shade)[i % 4]
        add_beam(f"petiole_{i}", start, base, .018 if not shrub else .025, shade, parent, vertices=5)
        rows = 8 if lod == 0 else 4
        centers, widths, weights = [], [], []
        for j in range(rows + 1):
            t = j / rows
            centers.append(base.lerp(end, t) + Vector((0, 0, math.sin(t * math.pi) * height * .25)))
            width = p["spread"] * (.26 if shrub else .29) * math.sin(math.pi * t) ** .72 + .006
            if split and j % 2 == 1:
                width *= .42
            widths.append(width)
            weights.append(t * t)
        _ribbon(f"folded_leaf_{i}", centers, widths, side, token, parent, weights, fold=.18)


def coastal_understory(spec, root):
    _lods(spec, root, _understory, wind=True)


def _rock(spec, parent, lod):
    p, rng = spec["parameters"], seeded_rng(spec["seed"])
    warm, light = spec["palette"]
    width, depth, height = p["width"], p["depth"], p["height"]
    outline = [(-.53,-.29),(-.28,-.51),(.21,-.46),(.49,-.24),(.45,.22),(.15,.48),(-.31,.41),(-.55,.08)]
    pieces = 3 if p["form"] == "cleft" else 2
    for piece in range(pieces):
        # A chipped slab with a diagonal ridge. The changing footprint creates
        # broken shoulders rather than a circular cap or decorative ledge bands.
        cx = (piece - (pieces - 1) / 2) * width * .27
        peak = height * (1 - piece * .29)
        slab_width = .92 if piece == 0 else .65
        vertices, faces = [], []
        levels = [0, .20, .48, .55, .76, 1] if lod == 0 else [0, .20, .67, 1]
        jitter = [rng.uniform(.90,1.09) for _ in outline]
        for row, t in enumerate(levels):
            for j,(ox,oy) in enumerate(outline):
                ledge = .085 * max(0, math.sin(j*1.1+piece)) if row in (1,3) and lod == 0 else 0
                taper = 1 - .26*t + ledge
                z = peak * t * (1 + ox * .24 - oy * .16 + .045 * math.sin(j*2.3+piece))
                vertices.append((cx + ox*width*slab_width*jitter[j]*taper + t*width*p["shear"]*.65,
                                 oy*depth*jitter[j]*taper + (piece%2)*depth*.09,
                                 z))
        sides = len(outline)
        for row in range(len(levels)-1):
            for j in range(sides):
                a,b = row*sides+j,row*sides+(j+1)%sides
                faces.append((a,b,b+sides,a+sides))
        faces.append(tuple(reversed(range(sides))))
        top = (len(levels)-1)*sides
        # A sloping fractured plate has no central pyramid apex.
        faces.append(tuple(top+j for j in range(sides)))
        obj = _mesh(f"fractured_slab_{piece}",vertices,faces,warm if piece%2==0 else light,parent)
        # Broad material variation follows the stone, independent of sun direction.
        if lod == 0:
            obj.data.materials.append(get_or_create_material(light if piece%2==0 else warm))
            for polygon in obj.data.polygons:
                if polygon.index in (6,12,22): polygon.material_index=1
            modifier = obj.modifiers.new(name="Weathered_fracture_edges", type="BEVEL")
            modifier.width = min(width,depth) * .024
            modifier.segments = 2
            modifier.limit_method = "ANGLE"
            modifier.angle_limit = .48
            with bpy.context.temp_override(object=obj,active_object=obj,selected_objects=[obj],selected_editable_objects=[obj]):
                bpy.ops.object.modifier_apply(modifier=modifier.name)
            set_surface_normals(obj, "planar")


def coastal_rock(spec, root):
    _lods(spec, root, _rock)


def _hut(spec, parent, lod):
    p, rng = spec["parameters"], seeded_rng(spec["seed"])
    wood, dark, roof = spec["palette"]
    w, d, h = p["width"], p["depth"], p["wallHeight"]
    store = p["form"] == "store"
    floor = .24
    for x in (-w / 2, w / 2):
        for y in (-d / 2, d / 2):
            add_tapered_beam(f"footing_{x}_{y}", (x, y, 0), (x, y, h + floor), .115, .09, dark, parent, vertices=6)
    planks = 17 if lod == 0 else 9
    for i in range(planks):
        x = (i + .5) * w / planks - w / 2
        add_box(f"floor_{i}", (x, 0, floor - .055), (w / planks - .014, d, .11), wood, parent, bevel=.008)
    # Rear wall and two side walls leave a wide working entrance and real openings.
    boards = 18 if lod == 0 else 10
    for i in range(boards):
        x = (i + .5) * w / boards - w / 2
        token = wood if i % 5 else dark
        add_box(f"rear_board_{i}", (x, d / 2, floor + h / 2), (w / boards - .013, .085, h + rng.uniform(-.035, .035)), token, parent, bevel=.008)
        if store and abs(x) > .72:
            add_box(f"front_board_{i}", (x, -d / 2, floor + h / 2), (w / boards - .014, .085, h), token, parent, bevel=.008)
    side_count = 14 if lod == 0 else 8
    for sign in (-1, 1):
        for i in range(side_count):
            y = (i + .5) * d / side_count - d / 2
            if abs(y) < d * .19:
                sections = [(h * .25, h * .5), (h * .92, h * .16)]
            else:
                sections = [(h / 2, h)]
            for j, (z, length) in enumerate(sections):
                add_box(f"side_{sign}_{i}_{j}", (sign * w / 2, y, floor + z), (.085, d / side_count - .015, length), wood, parent, bevel=.009)
        add_box(f"window_sill_{sign}", (sign * w / 2, 0, floor + h * .5), (.19, d * .41, .10), dark, parent, bevel=.015)
    pitch = math.radians(p["roofPitch"])
    half = w / 2 + .48
    rise = math.tan(pitch) * half
    roof_count = 20 if lod == 0 else 10
    for side in (-1, 1):
        for i in range(roof_count):
            y = -d / 2 - .5 + (i + .5) * (d + 1) / roof_count
            add_box(f"roof_plank_{side}_{i}", (side * half / 2, y, floor + h + rise / 2),
                    (half / math.cos(pitch) + .025, (d + 1) / roof_count - .009, .11), roof if i % 5 else wood, parent,
                    rotation=(0, side * pitch, 0), bevel=.014)
        for y in (-d / 2 - .36, d / 2 + .36):
            add_beam(f"rafter_{side}_{y}", (0, y, floor + h + rise), (side * half, y, floor + h), .095, dark, parent)
    add_box("ridge_cap", (0, 0, floor + h + rise + .045), (.22, d + 1.05, .15), dark, parent, bevel=.04)
    add_box("threshold", (0, -d / 2 - .26, .105), (1.65, .55, .21), wood, parent, bevel=.035)
    if not store:
        add_box("work_top", (0, d / 2 - .5, .96), (w * .76, .65, .12), wood, parent, bevel=.022)
        for x in (-w * .3, w * .3):
            add_box(f"work_leg_{x}", (x, d / 2 - .5, .53), (.12, .48, .82), dark, parent, bevel=.016)


def coastal_hut(spec, root):
    _lods(spec, root, _hut)
