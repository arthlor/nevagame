"""Offline Ines-only foot-contact retarget. Never exports or publishes a GLB.

Run in fresh background Blender, with --source-blend and a fresh --output-dir.
Only the existing walk action's thigh/shin/foot quaternion curves may change.
Input files, bind state, other curves, geometry, weights and sockets are guarded.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import traceback
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.path.insert(0, str(HERE))
from ines_walk_math import solve_knee, support_path

ASSET = "char_npc_ines_a"
SIDES = ("left", "right")
BONES = tuple(f"rig_{part}_{side}" for side in SIDES for part in ("thigh", "shin", "foot"))
PATHS = {f'pose.bones["{bone}"].rotation_quaternion' for bone in BONES}
SPEED = 0.975
FPS = 30
BAKE_HZ = 30
VERIFY_HZ = 240


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def serial(value):
    if hasattr(value, "to_list"):
        return value.to_list()
    if hasattr(value, "to_dict"):
        return {key: serial(item) for key, item in value.to_dict().items()}
    if isinstance(value, (list, tuple)):
        return [serial(item) for item in value]
    return value


def props(block):
    return {key: serial(block[key]) for key in block.keys()}


def rows(matrix):
    return [list(row) for row in matrix]


def bags(action):
    return [bag for layer in action.layers for strip in layer.strips for bag in strip.channelbags]


def curves(action):
    return [curve for bag in bags(action) for curve in bag.fcurves]


def curve_record(curve):
    return [curve.data_path, curve.array_index, curve.extrapolation,
            [[*key.co, key.interpolation, key.easing, key.handle_left_type, key.handle_right_type,
              *key.handle_left, *key.handle_right] for key in curve.keyframe_points]]


def action_snapshot(actions, walk):
    result = {}
    for action in actions:
        records = [curve_record(curve) for curve in curves(action)
                   if action != walk or curve.data_path not in PATHS]
        result[action.name] = {"protectedCurvesSha256": digest(records), "customProperties": props(action),
                               "frameRange": list(action.frame_range), "slots": [slot.identifier for slot in action.slots]}
    return result


def asset_snapshot(collection, rig):
    objects = []
    for obj in sorted(collection.all_objects, key=lambda item: item.name):
        record = {"name": obj.name, "type": obj.type, "parent": obj.parent.name if obj.parent else None,
                  "parentType": obj.parent_type, "parentBone": obj.parent_bone, "matrixBasis": rows(obj.matrix_basis),
                  "parentInverse": rows(obj.matrix_parent_inverse), "properties": props(obj)}
        if obj.type == "MESH":
            mesh = obj.data
            record["mesh"] = {"vertices": [list(v.co) for v in mesh.vertices],
                              "polygons": [list(p.vertices) for p in mesh.polygons],
                              "materialIndices": [p.material_index for p in mesh.polygons],
                              "materials": [m.name if m else None for m in mesh.materials],
                              "groups": [g.name for g in obj.vertex_groups],
                              "weights": [[[g.group, g.weight] for g in v.groups] for v in mesh.vertices],
                              "colors": {a.name: [list(c.color) for c in a.data] for a in mesh.color_attributes},
                              "modifiers": [[m.name, m.type, m.object.name if m.type == "ARMATURE" and m.object else None] for m in obj.modifiers]}
        objects.append(record)
    bones = [{"name": b.name, "parent": b.parent.name if b.parent else None, "matrix": rows(b.matrix_local),
              "head": list(b.head_local), "tail": list(b.tail_local), "properties": props(b)} for b in rig.data.bones]
    return {"objectGeometryWeightsSocketsSha256": digest(objects), "restHierarchySha256": digest(bones),
            "objectCount": len(objects), "boneCount": len(bones)}


def sample(scene, seconds):
    frame = seconds * FPS
    scene.frame_set(math.floor(frame + 1e-8), subframe=frame - math.floor(frame + 1e-8))
    bpy.context.view_layer.update()


def position(rig, name):
    return rig.matrix_world @ rig.pose.bones[name].matrix.translation


def orientation(rig, name):
    return (rig.matrix_world @ rig.pose.bones[name].matrix).to_quaternion().normalized()


def shoe_vertices(collection):
    """Only actual LOD0 sole/foot vertices; never approximate with the ankle."""
    result = {side: [] for side in SIDES}
    for obj in collection.all_objects:
        if obj.type != "MESH" or not obj.parent or obj.parent.name != ASSET + "_LOD0":
            continue
        groups = {g.index: g.name for g in obj.vertex_groups}
        for side in SIDES:
            names = {f"rig_foot_{side}", f"rig_toe_{side}"}
            ids = [v.index for v in obj.data.vertices if sum(g.weight for g in v.groups if groups[g.group] in names) >= 0.95]
            if ids:
                result[side].append((obj, ids))
    if any(not found for found in result.values()):
        raise ValueError("Could not isolate weighted LOD0 shoe geometry for both feet")
    return result


def evaluated_shoes(selection):
    graph = bpy.context.evaluated_depsgraph_get()
    result = {side: [] for side in SIDES}
    cache = {}
    for side, entries in selection.items():
        for obj, ids in entries:
            if obj.name not in cache:
                evaluated = obj.evaluated_get(graph)
                mesh = evaluated.to_mesh()
                cache[obj.name] = (evaluated, mesh)
            evaluated, mesh = cache[obj.name]
            result[side].extend((obj.name, index, evaluated.matrix_world @ mesh.vertices[index].co) for index in ids)
    for evaluated, mesh in cache.values():
        evaluated.to_mesh_clear()
    return result


def set_world_orientation(rig, bone, rotation):
    pose = rig.pose.bones[bone]
    world = rig.matrix_world @ pose.matrix
    pose.matrix = rig.matrix_world.inverted() @ Matrix.LocRotScale(world.translation, rotation, world.to_scale())
    bpy.context.view_layer.update()


def rotate_toward(rig, bone, child, destination):
    start = position(rig, bone)
    current = position(rig, child) - start
    target = destination - start
    if min(current.length, target.length) < 1e-7:
        raise ValueError("Degenerate leg segment")
    change = current.normalized().rotation_difference(target.normalized())
    set_world_orientation(rig, bone, change @ orientation(rig, bone))


def main(args, report):
    if not bpy.app.background:
        raise ValueError("Use a fresh background Blender process; never modify the artist's open scene")
    catalog = json.loads((REPO / "assets/specs/asset-catalog.json").read_text())
    spec = next(item for item in catalog["assets"] if item["id"] == ASSET)
    clip = next(item for item in spec["animationClips"] if item["name"] == "walk")
    if clip.get("referenceSpeedMetersPerSecond") != SPEED or abs(clip["durationSeconds"] - 4 / 3) > 1e-5:
        raise ValueError("Catalog walk timing/speed differs from this bounded retarget contract")
    report.update({"asset": ASSET, "source": str(args.source_blend), "sourceSha256": sha(args.source_blend),
                   "catalogWalk": clip, "allowedChannels": sorted(PATHS), "bakeHz": BAKE_HZ,
                   "verificationHz": VERIFY_HZ, "coordinateConvention": "Blender Z up / -Y forward", "rootMotionAdded": False})
    bpy.ops.wm.open_mainfile(filepath=str(args.source_blend), load_ui=False, use_scripts=False)
    scene = bpy.context.scene
    scene.render.fps, scene.render.fps_base = FPS, 1
    collection = bpy.data.collections.get(ASSET)
    if collection is None:
        raise ValueError("Expected exact durable Ines collection")
    rig = bpy.data.objects[spec["rigNode"]]
    if len(rig.data.bones) != 27 or any(name not in rig.pose.bones for name in BONES):
        raise ValueError("Unexpected Ines skeleton")
    actions = list(bpy.data.actions)
    walk = next((a for a in actions if a.name == "walk"), None)
    if walk is None or len(bags(walk)) != 1:
        raise ValueError("Expected one existing walk action channelbag")
    if any(b.constraints for b in rig.pose.bones) or any(c.modifiers for c in curves(walk)):
        raise ValueError("Constraints or F-curve modifiers require a separate retarget review")
    if any(rig.pose.bones[name].rotation_mode != "QUATERNION" for name in BONES):
        raise ValueError("Only existing quaternion rotation channels are supported")
    if any(c.data_path.endswith(("rotation_euler", "rotation_axis_angle")) and any(name in c.data_path for name in BONES) for c in curves(walk)):
        raise ValueError("Conflicting leg rotation representation")
    protected_before, asset_before = action_snapshot(actions, walk), asset_snapshot(collection, rig)
    start, end = walk.frame_range
    duration = (end - start) / FPS
    if abs(start) > 1e-6 or abs(duration - 4 / 3) > 1e-6:
        raise ValueError("Walk action must span frames 0..40")
    animation = rig.animation_data_create()
    previous = {"action": animation.action, "slot": animation.action_slot, "useNla": animation.use_nla,
                "posePosition": rig.data.pose_position, "frame": scene.frame_current, "subframe": scene.frame_subframe}
    animation.use_nla = False
    animation.action = walk
    animation.action_slot = walk.slots[0]
    rig.data.pose_position = "REST"
    bpy.context.view_layer.update()
    selection = shoe_vertices(collection)
    rest_shoes = evaluated_shoes(selection)
    anchors, rest_ankles = {}, {}
    for side in SIDES:
        points = rest_shoes[side]
        minimum = min(p.z for _, _, p in points)
        anchors[side] = {(name, index) for name, index, p in points if p.z < minimum + 0.012}
        rest_ankles[side] = rig.matrix_world @ rig.data.bones[f"rig_foot_{side}"].head_local
    rig.data.pose_position = "POSE"
    report["shoeSelection"] = {side: {"vertices": sum(len(ids) for _, ids in selection[side]), "soleAnchorVertices": len(anchors[side]),
                                      "restAnkle": list(rest_ankles[side])} for side in SIDES}
    snapshots = []
    count = round(duration * BAKE_HZ)
    reach = {side: {"minimumMarginMeters": 1e9, "worst": None} for side in SIDES}
    for index in range(count + 1):
        seconds = index * duration / count
        sample(scene, seconds)
        shoes = evaluated_shoes(selection)
        frame = {"seconds": seconds, "legs": {}}
        for side in SIDES:
            thigh, shin, foot = [f"rig_{part}_{side}" for part in ("thigh", "shin", "foot")]
            hip, knee, ankle = [position(rig, bone) for bone in (thigh, shin, foot)]
            sole_points = [p for name, vi, p in shoes[side] if (name, vi) in anchors[side]]
            anchor = sum(sole_points, Vector()) / len(sole_points)
            offset = anchor - ankle
            floor_offset = min(p.z - ankle.z for _, _, p in shoes[side])
            forward, lift, stance = support_path(seconds, duration, SPEED, args.swing_lift, 0 if side == "left" else duration / 2)
            # Support is the evaluated source sole anchor, not an assumed ankle.
            target = Vector((rest_ankles[side].x - offset.x, rest_ankles[side].y - forward - offset.y, lift - floor_offset))
            upper, lower = (knee - hip).length, (ankle - knee).length
            margin = upper + lower - (target - hip).length
            if margin < reach[side]["minimumMarginMeters"]:
                reach[side] = {"minimumMarginMeters": margin, "worst": {"seconds": seconds, "stance": stance,
                               "hip": list(hip), "targetAnkle": list(target), "upperLength": upper, "lowerLength": lower,
                               "originalFootQuaternionWorld": list(orientation(rig, foot)), "soleOffset": list(offset), "lowestShoeOffset": floor_offset}}
            frame["legs"][side] = {"hip": hip, "knee": knee, "target": target, "upper": upper, "lower": lower,
                                    "footRotation": orientation(rig, foot), "stance": stance}
        snapshots.append(frame)
    report["preflightReachability"] = reach
    report["footOrientationPolicy"] = "Preserve each original walk sample's world-space foot orientation; toe local curves unchanged"
    if min(item["minimumMarginMeters"] for item in reach.values()) <= 1e-7:
        raise ValueError("Exact foot-orientation/support constraints are unreachable with the fixed hip and leg lengths; no curves changed")
    if args.preflight_only:
        report["status"] = "preflight_passed_no_candidate"
        return
    rotations = {name: [] for name in BONES}
    max_solve_error, max_orientation_error = 0.0, 0.0
    for frame in snapshots:
        sample(scene, frame["seconds"])
        for side, leg in frame["legs"].items():
            thigh, shin, foot = [f"rig_{part}_{side}" for part in ("thigh", "shin", "foot")]
            solved_knee = Vector(solve_knee(leg["hip"], leg["knee"], leg["target"], leg["upper"], leg["lower"]))
            rotate_toward(rig, thigh, shin, solved_knee)
            rotate_toward(rig, shin, foot, leg["target"])
            set_world_orientation(rig, foot, leg["footRotation"])
            max_solve_error = max(max_solve_error, (position(rig, foot) - leg["target"]).length)
            max_orientation_error = max(max_orientation_error, orientation(rig, foot).rotation_difference(leg["footRotation"]).angle)
            for name in (thigh, shin, foot):
                quat = rig.pose.bones[name].rotation_quaternion.copy().normalized()
                if rotations[name] and rotations[name][-1].dot(quat) < 0:
                    quat.negate()
                rotations[name].append(quat)
    if max_solve_error > 1e-5 or max_orientation_error > 0.002:
        raise ValueError(f"Analytic pose application residual: {max_solve_error}m, {max_orientation_error}rad")
    bag = bags(walk)[0]
    for curve in list(bag.fcurves):
        if curve.data_path in PATHS:
            bag.fcurves.remove(curve)
    for name, values in rotations.items():
        for axis in range(4):
            curve = bag.fcurves.new(f'pose.bones["{name}"].rotation_quaternion', index=axis)
            curve.keyframe_points.add(len(values))
            for index, (key, quat) in enumerate(zip(curve.keyframe_points, values)):
                key.co = (index * duration / count * FPS, quat[axis])
                key.interpolation = "LINEAR"
            curve.extrapolation = "CONSTANT"
            curve.update()
    report["solve"] = {"maxAnkleTargetResidualMeters": max_solve_error, "maxFootOrientationErrorRadians": max_orientation_error,
                       "keyframesPerQuaternionChannel": count + 1, "changedQuaternionChannels": 24}
    report["verification"] = verify(scene, rig, walk, selection, anchors, rest_ankles, duration, args.swing_lift)
    if protected_before != action_snapshot(actions, walk) or asset_before != asset_snapshot(collection, rig):
        raise ValueError("Protected curves, rest state, geometry, weights or sockets changed")
    report["invariants"] = {"protectedActionsAndChannelsExact": True, "restGeometryWeightsSocketsExact": True,
                            "before": asset_before, "actions": protected_before}
    verification = report["verification"]
    if any(item["maxStanceAnchorResidualMeters"] > 0.004 or item["maxStanceSoleHeightAbsMeters"] > 0.004 or
           item["minimumShoeHeightMeters"] < -0.004 for item in verification["feet"].values()):
        raise ValueError("Baked/interstitial evaluated shoe contact exceeds 4mm gate")
    if verification["maxLoopQuaternionDifferenceRadians"] > 0.002:
        raise ValueError("Loop rotations do not close")
    animation.action = previous["action"]
    if previous["slot"]:
        animation.action_slot = previous["slot"]
    animation.use_nla = previous["useNla"]
    rig.data.pose_position = previous["posePosition"]
    scene.frame_set(previous["frame"], subframe=previous["subframe"])
    destination = args.output_dir / (ASSET + ".blend")
    bpy.ops.wm.save_as_mainfile(filepath=str(destination), check_existing=False, compress=True)
    if sha(args.source_blend) != report["sourceSha256"]:
        raise ValueError("Input source digest changed unexpectedly")
    report.update({"status": "candidate_staged", "candidate": str(destination), "candidateSha256": sha(destination),
                   "limitations": "Offline numerical evaluation only; no GLB export, runtime publication, browser or visual approval"})


def verify(scene, rig, walk, selection, anchors, rest_ankles, duration, swing_lift):
    result = {"samples": round(duration * VERIFY_HZ) + 1, "feet": {}, "maxLoopQuaternionDifferenceRadians": 0}
    data = {side: [] for side in SIDES}
    endpoints = []
    for index in range(result["samples"]):
        seconds = index * duration / (result["samples"] - 1)
        sample(scene, seconds)
        shoes = evaluated_shoes(selection)
        if index in (0, result["samples"] - 1):
            endpoints.append({name: rig.pose.bones[name].rotation_quaternion.copy().normalized() for name in BONES})
        for side in SIDES:
            points = shoes[side]
            anchor = sum([p for name, vi, p in points if (name, vi) in anchors[side]], Vector()) / len(anchors[side])
            forward, lift, stance = support_path(seconds, duration, SPEED, swing_lift, 0 if side == "left" else duration / 2)
            error = math.hypot(anchor.x - rest_ankles[side].x, anchor.y - (rest_ankles[side].y - forward))
            data[side].append({"seconds": seconds, "stance": stance, "anchorForward": -anchor.y,
                               "anchorResidual": error, "shoeMinHeight": min(p.z for _, _, p in points),
                               "shoeMaxHeight": max(p.z for _, _, p in points), "ankle": list(position(rig, f"rig_foot_{side}"))})
    for side, values in data.items():
        stance = [entry for entry in values if entry["stance"]]
        # Right phase-zero duplicate is the prior stance endpoint; compare the
        # contiguous contact interval beginning at the declared right event.
        contact = [entry for entry in stance if side == "left" and entry["seconds"] <= duration / 2 + 1e-8 or
                   side == "right" and entry["seconds"] >= duration / 2 - 1e-8]
        result["feet"][side] = {"maxStanceAnchorResidualMeters": max(entry["anchorResidual"] for entry in stance),
                                "maxStanceSoleHeightAbsMeters": max(abs(entry["shoeMinHeight"]) for entry in stance),
                                "minimumShoeHeightMeters": min(entry["shoeMinHeight"] for entry in values),
                                "stanceSupportTravelMeters": contact[-1]["anchorForward"] - contact[0]["anchorForward"],
                                "maxStanceForwardVelocityErrorMetersPerSecond": max(abs((b["anchorForward"] - a["anchorForward"]) /
                                                                                       (b["seconds"] - a["seconds"]) + SPEED)
                                                                                     for a, b in zip(contact, contact[1:])),
                                "samples": values}
    result["maxLoopQuaternionDifferenceRadians"] = max(endpoints[0][name].rotation_difference(endpoints[1][name]).angle for name in BONES)
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-blend", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--preflight-only", action="store_true")
    parser.add_argument("--swing-lift", type=float, default=0.085)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    args.source_blend = args.source_blend.resolve(strict=True)
    args.output_dir = args.output_dir.resolve()
    if args.source_blend != REPO / "art/imported/poly-pizza/char_npc_ines_a.blend":
        parser.error("Input must be the current durable Ines source")
    if not args.output_dir.is_relative_to(REPO / "output") or args.output_dir.exists():
        parser.error("Choose a fresh, nonexistent staging directory below output/")
    if not 0.03 <= args.swing_lift <= 0.15:
        parser.error("Swing lift must remain in the bounded 0.03..0.15m range")
    args.output_dir.mkdir(parents=True)
    report = {"status": "failed"}
    try:
        main(args, report)
    except Exception as error:
        report["status"] = "failed"
        report["error"] = str(error)
        report["traceback"] = traceback.format_exc()
        raise
    finally:
        report_path = args.output_dir / (ASSET + ".walk-retarget-report.json")
        report_path.write_text(json.dumps(report, indent=2) + "\n")
        print("INES_WALK_RETARGET_REPORT", report_path, flush=True)
