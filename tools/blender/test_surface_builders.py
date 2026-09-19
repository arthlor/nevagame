"""Construction invariants that survive the production surface finish."""
import hashlib
import json
import math

import bmesh
import bpy
from mathutils import Vector

from common.authored import add_burlap_sack, add_profiled_vessel, grow_branch
from common.creature import bone, build_creature_armature, bind_creature_skin, decimate_skinned_lod
from common.geometry import add_box, add_limb_tube, add_swept_profile, authored_rest_transforms, chamfer_authored, finish_authored_surface, graft_limb, join_meshes, remember_rest_transform, set_face_value_zone, set_surface_normals
from common.materials import get_or_create_material
from common.pipeline import _scene_bounds, clean_scene, create_root
from generators.coastal import _ribbon


def test_animated_rest_space():
    clean_scene()
    root = create_root("rest_test_root")
    pivot = bpy.data.objects.new("rest_test_pivot", None)
    bpy.context.collection.objects.link(pivot)
    pivot.parent = root
    pivot.location = (0, 0, .5)
    remember_rest_transform(pivot)
    surface = add_box("rest_test_surface", (0, 0, 0), (.3, 1.4, .4), "wood_honey_01", pivot, bevel=0)
    pivot.rotation_euler = (.4, .3, .2)
    pivot.keyframe_insert("rotation_euler", frame=0)
    bpy.context.scene.frame_set(0)
    bpy.context.view_layer.update()
    animated_basis = pivot.matrix_basis.copy()
    matrices = authored_rest_transforms([root, pivot, surface])
    minimum, maximum = _scene_bounds([surface], matrices)
    assert all(abs(actual - expected) < 1e-5 for actual, expected in zip(
        [maximum[i] - minimum[i] for i in range(3)], (.3, 1.4, .4)))
    finish_authored_surface(surface, root, object_to_asset=matrices[root].inverted() @ matrices[surface])
    for face in surface.data.polygons:
        color = surface.data.color_attributes["Color"].data[face.loop_start].color
        base = surface.data.materials[face.material_index].diffuse_color
        assert abs(color[0] / base[0] - (.91 + .07 * face.normal.z)) < 1e-5
    assert pivot.matrix_basis == animated_basis, "Rest-space inspection changed the active pose"


def test_folded_face_color():
    clean_scene()
    root = create_root("folded_face_root")
    mesh = bpy.data.meshes.new("folded_branch_face")
    mesh.from_pydata([(0, 0, 0), (-.079, -.129, .943), (-.074, -.212, .738), (-.268, -.027, .376)], [], [(0, 1, 2, 3)])
    mesh.update()
    material = get_or_create_material("wood_honey_01")
    mesh.materials.append(material)
    obj = bpy.data.objects.new("folded_branch", mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = root
    set_surface_normals(obj, "rounded")
    expected = .91 + .07 * mesh.polygons[0].normal.z
    finish_authored_surface(obj, root)
    assert len(mesh.polygons) == 2, "Folded planes retained one invalid geometric normal"
    for color in mesh.color_attributes["Color"].data:
        assert abs(color.color[0] / material.diffuse_color[0] - expected) < 1e-5, "Triangulation split the authored facet color"
    mesh.calc_loop_triangles()
    for tri in mesh.loop_triangles:
        normal = sum((mesh.corner_normals[i].vector for i in tri.loops), Vector()).normalized()
        assert normal.dot(tri.normal) >= -.001


def _face_value_ratios(obj):
    """Baked face value over the base rest-face value, per triangle."""
    colors = obj.data.color_attributes["Color"]
    ratios = []
    for face in obj.data.polygons:
        base = obj.data.materials[face.material_index].diffuse_color[0]
        value = colors.data[face.loop_start].color[0] / base
        ratios.append(value / (.91 + .07 * face.normal.z))
    return ratios


def test_value_zones():
    # Quad faces are triangulated before the bake, so a tagged quad becomes two
    # same-valued triangles; assertions count zones instead of assuming order.
    clean_scene()
    root = create_root("value_zone_root")
    box = add_box("value_zone_box", (0, 0, .5), (.6, .6, 1.0), "wood_honey_01", root, bevel=0)
    set_face_value_zone(box, "groundContact", faces=[0, 1])
    finish_authored_surface(box, root)
    assert box.data.attributes.get(".neva_value_zone") is None, "Private zone data leaked into the export"
    ratios = _face_value_ratios(box)
    assert sum(1 for ratio in ratios if abs(ratio - .90) < 1e-5) == 4, "The tagged quads did not keep their zone"
    assert all(abs(ratio - .90) < 1e-5 or abs(ratio - 1.0) < 1e-5 for ratio in ratios), "Untagged faces changed value"

    clean_scene()
    root = create_root("value_zone_override_root")
    box = add_box("value_zone_override_box", (0, 0, .5), (.6, .6, 1.0), "wood_honey_01", root, bevel=0)
    set_face_value_zone(box, "sunTop")
    try:
        set_face_value_zone(box, "not_a_zone")
    except ValueError:
        pass
    else:
        raise AssertionError("An unknown value zone was accepted")
    finish_authored_surface(box, root, value_zones={"sunTop": 1.02})
    assert all(abs(ratio - 1.02) < 1e-5 for ratio in _face_value_ratios(box)), "Zone override was not applied"

    clean_scene()
    root = create_root("value_zone_bounds_root")
    box = add_box("value_zone_bounds_box", (0, 0, .5), (.6, .6, 1.0), "wood_honey_01", root, bevel=0)
    set_face_value_zone(box, "wear")
    try:
        finish_authored_surface(box, root, value_zones={"wear": 1.5})
    except ValueError:
        pass
    else:
        raise AssertionError("An out-of-bounds value-zone override was accepted")
    try:
        finish_authored_surface(box, root, value_zones={"not_a_zone": 1.0})
    except ValueError:
        pass
    else:
        raise AssertionError("An unknown value-zone override was accepted")

    # Zone tagging is construction data: it survives an object join, and the
    # untagged object keeps the shared base value.
    clean_scene()
    root = create_root("value_zone_join_root")
    tagged = add_box("value_zone_tagged", (0, 0, .5), (.6, .6, 1.0), "wood_honey_01", root, bevel=0)
    set_face_value_zone(tagged, "wear")
    plain = add_box("value_zone_plain", (0, 1, .5), (.6, .6, 1.0), "wood_honey_01", root, bevel=0)
    joined = join_meshes([tagged, plain], "value_zone_join")
    finish_authored_surface(joined, root)
    ratios = _face_value_ratios(joined)
    assert len(ratios) == 24, "Join changed the expected triangle count"
    assert sum(1 for ratio in ratios if abs(ratio - .92) < 1e-5) == 12, "Zone tagging did not survive the join"
    assert sum(1 for ratio in ratios if abs(ratio - 1.0) < 1e-5) == 12, "The untagged object changed value"


def test_uv_ownership():
    clean_scene()
    root = create_root("uv_owner_root")
    plain = add_box("palette_box", (0, 0, 0), (1, 1, 1), "wood_honey_01", root)
    assert len(plain.data.uv_layers) > 0
    finish_authored_surface(plain, root)
    assert not plain.data.uv_layers, "Unused primitive UVs leaked into a palette-only export"
    textured = add_box("texture_box", (0, 0, 0), (1, 1, 1), "wood_honey_01", root)
    material = textured.data.materials[0].copy()
    material.node_tree.nodes.new("ShaderNodeTexImage")
    textured.data.materials[0] = material
    finish_authored_surface(textured, root)
    assert len(textured.data.uv_layers) > 0, "Surface finishing removed a textured material's UVs"


def test_chamfer_authored():
    clean_scene()
    root = create_root("chamfer_root")
    box = add_box("chamfer_box", (0, 0, .5), (.8, .6, 1.0), "wood_honey_01", root, bevel=0)
    before = len(box.data.vertices)
    chamfer_authored(box, .03)
    assert len(box.data.vertices) > before, "The authored chamfer added no geometry"
    editable = bmesh.new()
    editable.from_mesh(box.data)
    assert all(edge.is_manifold for edge in editable.edges), "The authored chamfer broke the closed shell"
    assert editable.calc_volume(signed=True) > 0, "The authored chamfer inverted winding"
    editable.free()
    for invalid in (0.0, -0.01):
        try:
            chamfer_authored(box, invalid)
        except ValueError:
            pass
        else:
            raise AssertionError("A non-positive chamfer width was accepted")


def test_swept_profile():
    clean_scene()
    root = create_root("sweep_root")
    profile = [(-.05, -.07), (.05, -.07), (.05, .07), (-.05, .07)]
    straight = add_swept_profile("sweep_straight", [(0, 0, 0), (0, 0, .6)], profile, "wood_honey_01", root)
    assert len(straight.data.vertices) == 8, "A two-station sweep should keep eight profile vertices"
    bent = add_swept_profile(
        "sweep_bent", [(0, 1, 0), (.02, 1, .5), (.4, 1, .9), (.65, 1, 1.0)], profile, "wood_honey_01", root,
        scales=(1.0, .9, .7, .5), twist=(0.0, .2, .3, .3),
    )
    for obj in (straight, bent):
        editable = bmesh.new()
        editable.from_mesh(obj.data)
        assert all(edge.is_manifold and edge.is_contiguous for edge in editable.edges), f"{obj.name} is not a closed shell"
        assert editable.calc_volume(signed=True) > 0, f"{obj.name} winding is inward"
        editable.free()
    try:
        add_swept_profile("sweep_bad", [(0, 0, 0)], profile, "wood_honey_01", root)
    except ValueError:
        pass
    else:
        raise AssertionError("A one-point sweep path was accepted")
    try:
        add_swept_profile("sweep_bad_scale", [(0, 0, 0), (0, 0, .5)], profile, "wood_honey_01", root, scales=(1.0,))
    except ValueError:
        pass
    else:
        raise AssertionError("A mismatched sweep scale list was accepted")


def signature():
    clean_scene()
    root = create_root("surface_test_root")
    tube = add_limb_tube("surface_trunk", [(0, 0, .1), (0, 0, .5), (.08, 0, .9)],
                         [.18, .16, .12], "wood_honey_01", root, sides=8)
    bpy.context.view_layer.update()
    graft_limb(tube, [8], [(.30, -.12, .72), (.48, -.15, .92)], [.075, .025])
    editable = bmesh.new()
    editable.from_mesh(tube.data)
    assert all(edge.is_manifold for edge in editable.edges), "Graft left an open or doubled boundary"
    assert editable.calc_volume(signed=True) > 0, "Graft has inward winding"
    editable.verts.ensure_lookup_table()
    pending, reached = [editable.verts[0]], set()
    while pending:
        vertex = pending.pop()
        if vertex in reached:
            continue
        reached.add(vertex)
        pending.extend(edge.other_vert(vertex) for edge in vertex.link_edges)
    assert len(reached) == len(editable.verts), "Primary anatomy is disconnected"
    editable.free()
    tube.data.materials.append(get_or_create_material("wood_dark_01"))
    tube.data.polygons[1].material_index = 1
    bones = [bone("test_base", (0, 0, .1), (0, 0, .6)),
             bone("test_branch", (.2, -.10, .65), (.48, -.15, .92), "test_base")]
    rig = build_creature_armature("surface_test_rig", bones, root)
    bind_creature_skin(tube, rig, bones)
    reduced = decimate_skinned_lod(tube, rig, .6, "surface_test_lod1", root)
    for obj in (tube, reduced):
        for vertex in obj.data.vertices:
            assert 1 <= len(vertex.groups) <= 4
            assert abs(sum(group.weight for group in vertex.groups) - 1) < 1e-5
    sack = add_burlap_sack("surface_sack", (1, 0, 0), (.5, .4, .7), "wood_honey_01", "wood_dark_01", root)
    add_limb_tube("pole_crossing", [(0, 0, 0), (.04, 0, .5), (.4, 0, 1), (.65, 0, 1.1)],
                  [.08] * 4, "wood_honey_01", root, sides=6)
    branch = add_limb_tube("long_branch_collar", [(0, 0, 0), (0, 0, 2)], [.3, .2], "wood_honey_01", root)
    grow_branch(branch, (.25, 0, 1), (.5, .6, 1.1), .08, .03)
    editable = bmesh.new()
    editable.from_mesh(branch.data)
    assert all(edge.is_manifold and edge.is_contiguous for edge in editable.edges), "Branch collar broke the trunk boundary"
    assert editable.calc_volume(signed=True) > 0
    editable.free()
    for sign in (-1, 1):
        leaf = _ribbon(f"surface_leaf_{sign}", [(0, 0, 0), (.5 * sign, 0, .15), (sign, 0, -.2)],
                       [.02, .12, .004], (0, 1, 0), "wood_honey_01", root, [0, .5, 1])
        editable = bmesh.new()
        editable.from_mesh(leaf.data)
        assert all(edge.is_manifold and edge.is_contiguous for edge in editable.edges), "Leaf cap winding is inconsistent"
        assert editable.calc_volume(signed=True) > 0, "Leaf is inside out"
        editable.free()
    vessel = add_profiled_vessel("surface_vessel", (-1, 0, 0), [(0, .12), (.06, .18), (.30, .20), (.35, .18)], .025, "wood_honey_01", root)
    box = add_box("surface_box", (0, 1, .4), (.4, .4, .8), "wood_honey_01", root, bevel=0)
    add_swept_profile(
        "surface_sweep", [(1.7, 0, 0), (1.7, 0, .35), (1.95, 0, .7)],
        [(-.05, -.08), (.05, -.08), (.05, .08), (-.05, .08)], "wood_honey_01", root,
    )
    # A joined rounded/hard pair retains both policies; no object-level heuristic.
    joined = join_meshes([vessel, box], "surface_joined")
    root.rotation_euler.x = math.pi / 3
    bpy.context.view_layer.update()
    result = []
    for obj in sorted((o for o in bpy.context.scene.objects if o.type == "MESH"), key=lambda o: o.name):
        finish_authored_surface(obj, root)
        mesh = obj.data
        mesh.calc_loop_triangles()
        colors = mesh.color_attributes["Color"]
        for face in mesh.polygons:
            values = [tuple(colors.data[i].color) for i in face.loop_indices]
            assert all(value == values[0] for value in values), "Height shading leaked inside a face"
        for triangle in mesh.loop_triangles:
            a, b, c = [mesh.vertices[i].co for i in triangle.vertices]
            assert (b - a).cross(c - a).length > 1e-8, "Degenerate builder triangle"
            mean_normal = sum((mesh.corner_normals[i].vector for i in triangle.loops), Vector()).normalized()
            assert (b - a).cross(c - a).normalized().dot(mean_normal) >= -.001, f"{obj.name}: normals oppose triangle winding"
        result.append({"name": obj.name, "vertices": [tuple(v.co) for v in mesh.vertices],
                       "faces": [tuple(p.vertices) for p in mesh.polygons],
                       "normals": [tuple(n.vector) for n in mesh.corner_normals],
                       "colors": [tuple(c.color) for c in colors.data],
                       "weights": [[(g.group, g.weight) for g in v.groups] for v in mesh.vertices]})
    mesh = tube.data
    # Adjacent side faces share a corner normal even when their colors differ.
    left, right = mesh.polygons[0], mesh.polygons[1]
    common = set(left.vertices) & set(right.vertices)
    assert common
    for vertex in common:
        loops = [next(i for i in face.loop_indices if mesh.loops[i].vertex_index == vertex) for face in (left, right)]
        assert (mesh.corner_normals[loops[0]].vector - mesh.corner_normals[loops[1]].vector).length < 1e-5
    caps = [p for p in mesh.polygons if not p.use_smooth]
    assert caps
    for cap in caps:
        assert all(mesh.corner_normals[i].vector.dot(cap.normal) > .999 for i in cap.loop_indices)
    # Box face values remain 0.84/0.91/0.98 in the rotated asset's rest frame.
    mesh = joined.data
    colors = mesh.color_attributes["Color"]
    for face in mesh.polygons[-6:]:
        base = mesh.materials[face.material_index].diffuse_color[0]
        value = colors.data[face.loop_start].color[0] / base
        assert min(abs(value - expected) for expected in (.84, .91, .98)) < 1e-5
    return hashlib.sha256(json.dumps(result, sort_keys=True).encode()).hexdigest()


def test_surface_builders():
    test_animated_rest_space()
    test_folded_face_color()
    test_uv_ownership()
    test_value_zones()
    test_chamfer_authored()
    test_swept_profile()
    assert signature() == signature(), "Geometry, normals, colors or skin weights are nondeterministic"
    print("[NEVA ART] Surface builders passed: manifold grafts, winding, mixed normals, rest-face colors, value zones, sweeps, LOD weights, determinism")
