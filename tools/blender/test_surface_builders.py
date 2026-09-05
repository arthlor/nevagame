"""Construction invariants that survive the production surface finish."""
import hashlib
import json
import math

import bmesh
import bpy
from mathutils import Vector

from common.authored import add_burlap_sack, add_profiled_vessel, grow_branch
from common.creature import bone, build_creature_armature, bind_creature_skin, decimate_skinned_lod
from common.geometry import add_box, add_limb_tube, authored_rest_transforms, finish_authored_surface, graft_limb, join_meshes, remember_rest_transform, set_surface_normals
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
    assert signature() == signature(), "Geometry, normals, colors or skin weights are nondeterministic"
    print("[NEVA ART] Surface builders passed: manifold grafts, winding, mixed normals, rest-face colors, LOD weights, determinism")
