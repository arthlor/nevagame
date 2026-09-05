"""Stage the reviewed Poly Pizza cow as a palette-normalized Blender library.

Run through Blender with arguments after --. This authoring helper retains the
donor skeleton and surface, bakes only peaceful donor performances, and never
exports or publishes a runtime asset. The catalog-selected imported generator
and normal art CLI own admission, export, and publication.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector


PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "tools" / "blender"))

from common.materials import get_or_create_material  # noqa: E402
from common.pipeline import _validate_animation_contract, _validate_vertex_color_contract  # noqa: E402


ASSET_ID = "fauna_cow_a"
SOURCE_ID = "26zM1outCr"
SOURCE_BLEND = PROJECT_ROOT / "art/imported/poly-pizza/sources/cow.blend"
SOURCE_COLLECTION = f"POLYPIZZA_{SOURCE_ID}_SOURCE"
SOURCE_CLIPS = {"idle": "Idle", "graze": "Eating", "look": "Idle_2"}
FPS = 30
DEFAULT_LODS = [
    {"node": "LOD0", "distanceMeters": 0, "triangleRatioMin": 1, "triangleRatioMax": 1},
    {"node": "LOD1", "distanceMeters": 34, "triangleRatioMin": 0.25, "triangleRatioMax": 0.6},
]
MATERIAL_MAP = {
    "Main": "animal_hide_black_01",
    "Main_Light": "animal_hide_white_01",
    "Muzzle": "accent_red_01",
    "Hooves": "animal_hide_black_01",
    "Eye_Black": "animal_hide_black_01",
    "Eye_White": "animal_hide_white_01",
    "Horns": "stone_golden_01",
}


def _sha256(path):
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def _empty(collection, name, parent=None, location=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.parent = parent
    obj.location = location
    return obj


def _triangles(mesh):
    mesh.calc_loop_triangles()
    return len(mesh.loop_triangles)


def _bounds(points):
    return (
        Vector(tuple(min(point[axis] for point in points) for axis in range(3))),
        Vector(tuple(max(point[axis] for point in points) for axis in range(3))),
    )


def _frame(scene, value):
    whole = math.floor(value)
    scene.frame_set(whole, subframe=value - whole)
    bpy.context.view_layer.update()


def _evaluated_vertices(obj):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    try:
        return [evaluated.matrix_world @ vertex.co for vertex in mesh.vertices]
    finally:
        evaluated.to_mesh_clear()


def _solid_source_materials(mesh):
    names = []
    for material in mesh.materials:
        if material is None or material.name not in MATERIAL_MAP:
            raise ValueError(f"Unreviewed cow material: {material.name if material else None}")
        if material.diffuse_color[3] < 0.999:
            raise ValueError(f"Source alpha is not supported: {material.name}")
        if material.node_tree:
            for node in material.node_tree.nodes:
                if node.type in {"TEX_IMAGE", "TEX_ENVIRONMENT"}:
                    raise ValueError(f"Source texture requires a separate reviewed adaptation: {material.name}")
                if node.type == "BSDF_PRINCIPLED":
                    alpha = node.inputs.get("Alpha")
                    if alpha and (alpha.is_linked or alpha.default_value < 0.999):
                        raise ValueError(f"Source alpha is not supported: {material.name}")
        names.append(material.name)
    return names


def _capture_performances(scene, rig, mesh, spec, normalization):
    """Sample the source once; no source action is copied into the derivative."""
    rig.data.pose_position = "POSE"
    rig.animation_data.use_nla = False
    captures = {}
    for clip in spec["animationClips"]:
        source_name = SOURCE_CLIPS[clip["name"]]
        action = bpy.data.actions.get(source_name)
        if action is None or len(action.slots) != 1:
            raise ValueError(f"Reviewed donor action is missing or ambiguous: {source_name}")
        start, end = action.frame_range
        rig.animation_data.action = action
        rig.animation_data.action_slot = action.slots[0]
        count = round(clip["durationSeconds"] * FPS)
        proof_frames = {0, round(count * 0.25), round(count * 0.5), round(count * 0.75), count}
        frames = []
        for index in range(count + 1):
            source_frame = start + (end - start) * index / count
            _frame(scene, source_frame)
            frames.append({
                "sourceFrame": source_frame,
                "matrices": {bone.name: bone.matrix.copy() for bone in rig.pose.bones},
                "vertices": [normalization @ point for point in _evaluated_vertices(mesh)] if index in proof_frames else None,
            })
        captures[clip["name"]] = {"sourceAction": source_name, "sourceFrames": [start, end], "frames": frames}
    rig.animation_data.action = None
    rig.data.pose_position = "REST"
    _frame(scene, 0)
    return captures


def _bake_performances(scene, rig, source_world, source_rest, names, captures, spec):
    new_rest = {old: rig.data.bones[new].matrix_local.copy() for old, new in names.items()}
    corrections = {
        name: source_rest[name].inverted() @ source_world.inverted() @ new_rest[name]
        for name in names
    }
    rig.animation_data_create()
    rig.animation_data.use_nla = False
    report = []
    for clip in spec["animationClips"]:
        action = bpy.data.actions.new(clip["name"])
        action.use_fake_user = True
        action["neva_loop"] = clip["loop"]
        for key, metadata in (
            ("commitMarkerSeconds", "neva_commit_marker_seconds"),
            ("referenceSpeedMetersPerSecond", "neva_reference_speed_meters_per_second"),
        ):
            if key in clip:
                action[metadata] = clip[key]
        action["neva_source_action"] = captures[clip["name"]]["sourceAction"]
        action["neva_source_model"] = SOURCE_ID
        rig.animation_data.action = action
        previous_quaternions = {}
        for index, capture in enumerate(captures[clip["name"]]["frames"]):
            target = {old: source_world @ capture["matrices"][old] @ corrections[old] for old in names}
            for old, new in names.items():
                pose = rig.pose.bones[new]
                bone = pose.bone
                kwargs = {}
                if bone.parent:
                    old_parent = next(key for key, value in names.items() if value == bone.parent.name)
                    kwargs = {"parent_matrix": target[old_parent], "parent_matrix_local": bone.parent.matrix_local}
                local = bone.convert_local_to_pose(target[old], bone.matrix_local, invert=True, **kwargs)
                position, rotation, scale = local.decompose()
                if old in previous_quaternions and rotation.dot(previous_quaternions[old]) < 0:
                    rotation.negate()
                previous_quaternions[old] = rotation.copy()
                pose.rotation_mode = "QUATERNION"
                pose.location = position
                pose.rotation_quaternion = rotation
                pose.scale = scale
                pose.keyframe_insert("location", frame=index)
                pose.keyframe_insert("rotation_quaternion", frame=index)
                pose.keyframe_insert("scale", frame=index)
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for point in curve.keyframe_points:
                            point.interpolation = "LINEAR"
        report.append({
            "name": clip["name"], "sourceAction": captures[clip["name"]]["sourceAction"],
            "sourceFrameRange": captures[clip["name"]]["sourceFrames"],
            "durationSeconds": clip["durationSeconds"], "loop": clip["loop"],
            "bakedFrames": len(captures[clip["name"]]["frames"]), "fps": FPS,
        })
    return report


def _verify_deformation(scene, rig, mesh, captures):
    proofs = []
    for name, capture in captures.items():
        action = bpy.data.actions[name]
        rig.animation_data.action = action
        rig.animation_data.action_slot = action.slots[0]
        frame_errors = []
        first = last = None
        for index, sample in enumerate(capture["frames"]):
            if sample["vertices"] is None:
                continue
            _frame(scene, index)
            points = _evaluated_vertices(mesh)
            if len(points) != len(sample["vertices"]):
                raise ValueError("Source-to-derivative deformation correspondence changed before cleanup")
            error = max((actual - expected).length for actual, expected in zip(points, sample["vertices"]))
            if error > 0.0005:
                raise ValueError(f"{name} frame {index}: source deformation changed by {error:.6f} metres")
            frame_errors.append({"frame": index, "maxErrorMeters": error})
            if index == 0:
                first = points
            if index == len(capture["frames"]) - 1:
                last = points
        seam = max((a - b).length for a, b in zip(first, last))
        if seam > 0.002:
            raise ValueError(f"{name}: donor loop seam is {seam:.6f} metres")
        proofs.append({"name": name, "sampledSourceParity": frame_errors, "loopSeamMaxMeters": seam})
    rig.animation_data.action = None
    for pose in rig.pose.bones:
        pose.matrix_basis = Matrix.Identity(4)
        # FBX authoring control widgets are external object references and would
        # otherwise be pulled into the saved library as hidden mesh extras.
        pose.custom_shape = None
    _frame(scene, 0)
    return proofs


def _clean_mesh(mesh):
    before = _triangles(mesh)
    bm = bmesh.new()
    try:
        bm.from_mesh(mesh)
        # Keep original winding and weighted vertex seams. A global weld could
        # average weights across independently skinned anatomical surfaces.
        bmesh.ops.triangulate(bm, faces=list(bm.faces))
        tiny = [face for face in bm.faces if face.calc_area() < 5.1e-9]
        if tiny:
            bmesh.ops.delete(bm, geom=tiny, context="FACES")
        loose = [vertex for vertex in bm.verts if not vertex.link_faces]
        if loose:
            bmesh.ops.delete(bm, geom=loose, context="VERTS")
        bm.to_mesh(mesh)
    finally:
        bm.free()
    for polygon in mesh.polygons:
        polygon.use_smooth = False
    mesh.update()
    return {"beforeTriangles": before, "afterTriangles": _triangles(mesh), "winding": "preserved"}


def _remap_materials(mesh, source_names):
    tokens = list(dict.fromkeys(MATERIAL_MAP[name] for name in source_names))
    indices = [tokens.index(MATERIAL_MAP[source_names[polygon.material_index]]) for polygon in mesh.polygons]
    mesh.materials.clear()
    for token in tokens:
        mesh.materials.append(get_or_create_material(token))
    for polygon, index in zip(mesh.polygons, indices):
        polygon.material_index = index
    return [{"source": name, "target": MATERIAL_MAP[name]} for name in source_names]


def _colors(mesh):
    for old in list(mesh.color_attributes):
        mesh.color_attributes.remove(old)
    attribute = mesh.color_attributes.new(name="Color", type="FLOAT_COLOR", domain="CORNER")
    for polygon in mesh.polygons:
        # Broad lighting response comes from the authored facets. This bounded
        # value variation never substitutes arbitrary RGB for a palette token.
        scalar = 0.91 + 0.07 * max(-1.0, min(1.0, polygon.normal.z))
        color = mesh.materials[polygon.material_index].diffuse_color
        for loop in polygon.loop_indices:
            attribute.data[loop].color = (*[channel * scalar for channel in color[:3]], 1)
    mesh.color_attributes.active_color = attribute
    mesh.color_attributes.render_color_index = list(mesh.color_attributes).index(attribute)


def _weights(obj, rig):
    pruned = 0
    for vertex in obj.data.vertices:
        entries = sorted(((group.group, group.weight) for group in vertex.groups if group.weight > 1e-8), key=lambda item: (-item[1], item[0]))
        if not entries:
            raise ValueError(f"Unweighted vertex in {obj.name}: {vertex.index}")
        selected = entries[:4]
        pruned += max(0, len(entries) - 4)
        total = sum(weight for _, weight in selected)
        for group in list(vertex.groups):
            obj.vertex_groups[group.group].remove([vertex.index])
        for group, weight in selected:
            if obj.vertex_groups[group].name not in rig.data.bones:
                raise ValueError(f"Weight references absent bone: {obj.vertex_groups[group].name}")
            obj.vertex_groups[group].add([vertex.index], weight / total, "REPLACE")
    return {"maximumInfluences": max(len(vertex.groups) for vertex in obj.data.vertices), "prunedInfluences": pruned}


def _collision(collection, root, spec):
    if len(spec.get("collisionPrimitives", [])) != 1:
        raise ValueError("This pilot requires the existing single cow collision box")
    primitive = spec["collisionPrimitives"][0]
    x, y, z = primitive["center"]
    hx, hy, hz = primitive["halfExtents"]
    obj = _empty(collection, "COL_fauna_cow_a", root, (x, -z, y))
    obj["neva_marker"] = "collision"
    obj["shape"] = "box"
    obj["dimensions"] = [hx * 2, hz * 2, hy * 2]
    obj.rotation_euler.z = math.radians(primitive.get("yawDegrees", 0))


def _validate(spec, collection, rig, meshes, levels):
    objects = list(collection.all_objects)
    names = {obj.name for obj in objects}
    if set(spec["requiredNodes"]) - names:
        raise ValueError(f"Missing required nodes: {set(spec['requiredNodes']) - names}")
    if any(obj.type not in {"EMPTY", "ARMATURE", "MESH"} or "." in obj.name for obj in objects):
        raise ValueError("Unstable or non-asset object in derivative")
    if {obj for obj in objects if obj.type == "MESH"} != set(meshes):
        raise ValueError("Geometry exists outside the two LOD surfaces")
    animation = _validate_animation_contract(spec, objects, meshes)
    materials = set()
    lod_metrics = []
    lod0 = _triangles(meshes[0].data)
    budget = spec["budget"]
    if not budget["trianglesMin"] <= lod0 <= budget["trianglesMax"]:
        raise ValueError(f"LOD0 {lod0} triangles violates catalog budget; no padding will be added")
    for obj, level in zip(meshes, levels):
        if obj.parent.name != level["node"] or obj.parent.type != "EMPTY" or any(abs(value - 1) > 1e-5 for value in obj.scale):
            raise ValueError(f"Invalid unit-scale LOD hierarchy: {obj.name}")
        count = _triangles(obj.data)
        ratio = count / lod0
        if not level["triangleRatioMin"] <= ratio <= level["triangleRatioMax"]:
            raise ValueError(f"LOD ratio outside declared contract: {ratio}")
        for triangle in obj.data.loop_triangles:
            a, b, c = (obj.data.vertices[index].co for index in triangle.vertices)
            if (b - a).cross(c - a).length < 1e-8:
                raise ValueError("Degenerate triangle survived cleanup")
        used, loops = _validate_vertex_color_contract(ASSET_ID, obj)
        materials.update(used)
        lod_metrics.append({"node": level["node"], "triangles": count, "ratio": ratio, "colorLoops": loops})
    if len(materials) > budget["materialsMax"] or not materials.issubset(spec["palette"]):
        raise ValueError("Palette or material budget mismatch")
    if len(rig.animation_data.nla_tracks) != len(spec["animationClips"]):
        raise ValueError("Unexpected donor NLA tracks survived")
    minimum, maximum = _bounds([obj.matrix_world @ vertex.co for obj in meshes for vertex in obj.data.vertices])
    expected = Vector([spec["dimensions"][axis] for axis in ("width", "depth", "height")])
    actual = maximum - minimum
    if any(not expected[axis] * 0.25 <= actual[axis] <= expected[axis] * 1.35 for axis in range(3)) or abs(minimum.z) > 0.005:
        raise ValueError(f"Normalized ground-center dimensions violate the catalog envelope: dimensions={list(actual)}, minimum={list(minimum)}, expected={list(expected)}")
    return {"lods": lod_metrics, "materials": sorted(materials), "animationClips": animation, "dimensions": list(maximum - minimum), "groundMinimumZ": minimum.z}


def adapt(args):
    if args.asset != ASSET_ID or args.source_collection != SOURCE_COLLECTION:
        raise ValueError("This helper supports only the reviewed cow pilot and exact capture collection")
    source = Path(args.source_blend).resolve(strict=True)
    source_report = json.loads(source.with_name(source.stem + "-report.json").read_text())
    digest = _sha256(source)
    if source_report["modelId"] != SOURCE_ID or source_report["sourceSha256"] != digest or source_report["license"] != ["CC0 1.0"]:
        raise ValueError("Source identity, license, or digest differs from the reviewed capture")
    output_dir = Path(args.output_dir).resolve()
    blend_path = output_dir / f"{ASSET_ID}.blend"
    report_path = output_dir / f"{ASSET_ID}-report.json"
    if blend_path.exists() or report_path.exists():
        raise ValueError("Refusing to overwrite a staged derivative; choose a fresh output directory")
    catalog = json.loads((PROJECT_ROOT / "assets/specs/asset-catalog.json").read_text())
    spec = next(asset for asset in catalog["assets"] if asset["id"] == ASSET_ID)
    if {clip["name"]: clip["durationSeconds"] for clip in spec["animationClips"]} != {"idle": 1.6, "graze": 2.4, "look": 1.8}:
        raise ValueError("Cow animation contract changed; review the adapter")
    if spec.get("additionalAnimationClips"):
        raise ValueError("Additional cow motions need explicit source review")
    levels = spec.get("lodLevels") or DEFAULT_LODS
    if len(levels) != 2:
        raise ValueError("The cow pilot supports exactly two LODs")
    scene = bpy.data.scenes.new("NEVA_COW_ADAPTATION")
    bpy.context.window.scene = scene
    scene.render.fps, scene.render.fps_base = FPS, 1
    with bpy.data.libraries.load(str(source), link=False) as (available, requested):
        if args.source_collection not in available.collections:
            raise ValueError("Missing source capture collection")
        requested.collections = [args.source_collection]
    donor_collection = requested.collections[0]
    scene.collection.children.link(donor_collection)
    bpy.context.view_layer.update()
    donor = next(obj for obj in donor_collection.all_objects if obj.name == "Cow" and obj.type == "MESH")
    source_rig = next(obj for obj in donor_collection.all_objects if obj.name == "AnimalArmature" and obj.type == "ARMATURE")
    if donor.data.shape_keys or source_rig.constraints or any(bone.constraints for bone in source_rig.pose.bones):
        raise ValueError("Unreviewed source morph or constraint dependencies")
    if len(donor.modifiers) != 1 or donor.modifiers[0].type != "ARMATURE" or donor.modifiers[0].object is not source_rig:
        raise ValueError("Unexpected cow deformation stack")
    if source_rig.animation_data is None or source_rig.animation_data.drivers:
        raise ValueError("Source animation is missing or driver-dependent")
    source_names = _solid_source_materials(donor.data)
    source_world = source_rig.matrix_world.copy()
    if max(abs(value - source_world.to_scale()[0]) for value in source_world.to_scale()) > 1e-4:
        raise ValueError("Source rig world transform must be uniformly scaled")
    if max(abs(donor.matrix_world[row][col] - source_world[row][col]) for row in range(4) for col in range(4)) > 1e-4:
        raise ValueError("Source mesh and rig do not share a bind space")
    minimum, maximum = _bounds([source_world @ vertex.co for vertex in donor.data.vertices])
    dimensions = maximum - minimum
    center = Vector(((minimum.x + maximum.x) / 2, (minimum.y + maximum.y) / 2, minimum.z))
    desired = Vector([spec["dimensions"][axis] for axis in ("width", "depth", "height")])
    # The catalog describes a permissible envelope, not a request to distort
    # the donor anatomy. Match length uniformly and preserve its proportions.
    uniform_scale = desired.y / dimensions.y
    fit = Vector((uniform_scale, uniform_scale, uniform_scale))
    normalization = Matrix.Diagonal((*fit, 1)) @ Matrix.Translation(-center)
    source_rest = {bone.name: bone.matrix_local.copy() for bone in source_rig.data.bones}
    captures = _capture_performances(scene, source_rig, donor, spec, normalization)
    source_world = normalization @ source_world
    collection = bpy.data.collections.new(ASSET_ID)
    scene.collection.children.link(collection)
    root = _empty(collection, spec["rootNode"])
    root["neva_asset_root"] = True
    root["polypizza_id"] = SOURCE_ID
    root["polypizza_licence"] = "CC0 1.0"
    root["polypizza_attribution"] = "\n".join(source_report["attribution"])
    motion = _empty(collection, f"{ASSET_ID}_motion_root", root)
    rig = source_rig.copy()
    rig.data = source_rig.data.copy()
    rig.animation_data_clear()
    rig.name = f"{ASSET_ID}_rig"
    rig.data.name = f"{ASSET_ID}_skeleton"
    collection.objects.link(rig)
    rig.parent = motion
    rig.matrix_parent_inverse = Matrix.Identity(4)
    rig.matrix_basis = Matrix.Identity(4)
    rig.data.transform(source_world)
    rig.data.pose_position = "POSE"
    names = {old: old.replace(".", "_") for old in source_rest}
    for old, new in names.items():
        rig.data.bones[old].name = new
    for pose in rig.pose.bones:
        pose.matrix_basis = Matrix.Identity(4)
    mesh = donor.copy()
    mesh.data = donor.data.copy()
    mesh.animation_data_clear()
    mesh.name = f"{ASSET_ID}_LOD0_surface"
    mesh.data.name = f"{mesh.name}_mesh"
    collection.objects.link(mesh)
    mesh.parent = motion
    mesh.matrix_parent_inverse = Matrix.Identity(4)
    mesh.matrix_basis = Matrix.Identity(4)
    mesh.data.transform(source_world)
    for group in mesh.vertex_groups:
        group.name = names[group.name]
    mesh.modifiers[0].object = rig
    bpy.context.view_layer.update()
    animation_report = _bake_performances(scene, rig, source_world, source_rest, names, captures, spec)
    deformation_proof = _verify_deformation(scene, rig, mesh, captures)
    scene.collection.children.unlink(donor_collection)
    cleanup = _clean_mesh(mesh.data)
    mapping = _remap_materials(mesh.data, source_names)
    meshes = []
    weight_reports = []
    lod_grounding = []
    for index, level in enumerate(levels):
        lod = _empty(collection, level["node"], motion)
        lod["neva_lod_index"] = index
        lod["neva_lod_distance_meters"] = level["distanceMeters"]
        if index == 0:
            obj = mesh
        else:
            obj = mesh.copy()
            obj.data = mesh.data.copy()
            obj.name = f"{ASSET_ID}_LOD1_surface"
            obj.data.name = f"{obj.name}_mesh"
            collection.objects.link(obj)
            for modifier in list(obj.modifiers):
                obj.modifiers.remove(modifier)
            decimate = obj.modifiers.new("CowSilhouetteLOD", "DECIMATE")
            decimate.ratio = min(0.48, level["triangleRatioMax"] * 0.9)
            decimate.use_collapse_triangulate = True
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            bpy.ops.object.modifier_apply(modifier=decimate.name)
            obj.select_set(False)
            # QEM may extrapolate a hoof vertex below the original floor.
            # Preserve the authored ground plane without adding any geometry.
            below = [vertex for vertex in obj.data.vertices if vertex.co.z < 0]
            maximum_lift = max((-vertex.co.z for vertex in below), default=0)
            if maximum_lift > 0.05:
                raise ValueError("LOD reduction moved hoof geometry too far below the source floor")
            for vertex in below:
                vertex.co.z = 0
            lod_grounding.append({"node": level["node"], "verticesConstrainedToSourceFloor": len(below), "maximumLiftMeters": maximum_lift})
            _clean_mesh(obj.data)
            obj.modifiers.new("CowSkin", "ARMATURE").object = rig
        obj.parent = lod
        obj.matrix_parent_inverse = Matrix.Identity(4)
        obj.matrix_basis = Matrix.Identity(4)
        weight_reports.append({"node": level["node"], **_weights(obj, rig)})
        _colors(obj.data)
        meshes.append(obj)
    for suffix, bone_name in (("head_pivot", "Head"), ("tail_pivot", "Tail1")):
        marker = _empty(collection, f"{ASSET_ID}_{suffix}", motion, rig.data.bones[names[bone_name]].head_local)
        marker["neva_marker"] = "presentation_pivot"
        marker["neva_source_bone"] = names[bone_name]
    _collision(collection, root, spec)
    rig.animation_data.action = None
    for clip in spec["animationClips"]:
        action = bpy.data.actions[clip["name"]]
        track = rig.animation_data.nla_tracks.new()
        track.name = clip["name"]
        strip = track.strips.new(clip["name"], 0, action)
        strip.action_slot = action.slots[0]
        strip.extrapolation = "NOTHING"
        strip.blend_type = "REPLACE"
    rig.animation_data.use_nla = True
    _frame(scene, 0)
    metrics = _validate(spec, collection, rig, meshes, levels)
    report = {
        "assetId": ASSET_ID, "sourceModelId": SOURCE_ID, "sourceUrl": source_report["sourceUrl"],
        "sourceSha256": digest, "sourceCollection": args.source_collection,
        "license": source_report["license"], "attribution": source_report["attribution"],
        "outputBlend": str(blend_path), "outputCollection": ASSET_ID,
        "normalization": {"sourceDimensions": list(dimensions), "uniformScale": uniform_scale, "catalogEnvelopeDimensions": list(desired), "actualDimensions": list(dimensions * uniform_scale), "policy": "unit-scale-metre-space-rig-and-mesh-preserving-source-proportions"},
        "sourceRigBones": len(source_rest), "retainedRigBones": len(rig.data.bones),
        "cleanup": cleanup, "lodGrounding": lod_grounding, "materialRemap": mapping, "weights": weight_reports,
        "animationMapping": animation_report, "deformationProof": deformation_proof,
        "includedActions": [clip["name"] for clip in spec["animationClips"]],
        "sourceCombatActionsShipped": False, "sourceAlphaTexturesShipped": False,
        "lodLevels": levels, "metrics": metrics,
        "saveImpact": False, "publication": "not_performed", "visualStatus": "Awaiting human game review",
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    bpy.data.libraries.write(str(blend_path), {collection}, path_remap="RELATIVE", fake_user=True, compress=True)
    report["outputSha256"] = _sha256(blend_path)
    report_path.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--asset", default=ASSET_ID)
    parser.add_argument("--source-blend", default=str(SOURCE_BLEND))
    parser.add_argument("--source-collection", default=SOURCE_COLLECTION)
    parser.add_argument("--output-dir", required=True)
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    adapt(parser.parse_args(argv))


if __name__ == "__main__":
    main()
