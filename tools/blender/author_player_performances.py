"""Author the Neva player's catalog performances directly on its fitted rig.

Run in a fresh background Blender process, writing to a new directory under
``output/``:

    blender --background --factory-startup --python tools/blender/author_player_performances.py -- \\
        --output-dir output/player-performances [--clips walk,run]

The durable library (the catalog's ``parameters.sourceBlend``) keeps its
surfaces, skin, rest skeleton and sockets byte-for-byte; only actions change.
Each selected catalog clip is rebuilt from its recipe in
``common/player_clips.py`` (every clip when ``--clips`` is omitted) and baked
at 60 samples per second with linear subframe keys on the 30 fps timeline, one action and one same-named NLA track per clip.
Unselected actions are kept unchanged and fingerprinted.

The report measures what the runtime relies on: stance feet that keep the
clip's reference speed (or stay put), soles that never sink below the ground,
legs that reach their feet, seamless loops, and the contact intervals and
reference speeds the catalog must declare. The helper never publishes and
never edits the catalog; promote the candidate, update the catalog from the
report, then run the registered ``imported_blend`` generation.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.path.insert(0, str(HERE))

from common.player_actions import RECIPES as ACTION_RECIPES, Context, rod_knob_offset  # noqa: E402
from common.player_clips import RECIPES as GAIT_RECIPES, build_pose  # noqa: E402
from common.player_rides import RECIPES as RIDE_RECIPES  # noqa: E402
from common.player_skin import blend_crotch  # noqa: E402
from common.player_motion import FPS, SIDES, RigModel, knee_flexion, sole_points  # noqa: E402

ASSET = "char_player_a"
BAKE_HZ = 60  # Keep source seconds and the importer's 30 fps timebase unchanged.
# A planted sole may drift this much (m) over a contact and still count as planted.
CONTACT_SLIP_METERS = 0.012
CONTACT_HEIGHT_METERS = 0.012
# A heel or toe pivot this close to the ground bears weight and must not slide.
GROUNDED_METERS = 0.004


def _curves(action):
    return [curve for layer in action.layers for strip in layer.strips for bag in strip.channelbags
            for curve in bag.fcurves]


def action_fingerprint(action) -> str:
    payload = []
    for curve in sorted(_curves(action), key=lambda value: (value.data_path, value.array_index)):
        payload.append((curve.data_path, curve.array_index,
                        [(round(float(key.co.x), 6), round(float(key.co.y), 6)) for key in curve.keyframe_points]))
    return hashlib.sha256(json.dumps(payload, separators=(",", ":")).encode()).hexdigest()


def geometry_fingerprint(collection) -> str:
    digest = hashlib.sha256()
    for obj in sorted(collection.all_objects, key=lambda item: item.name):
        digest.update(obj.name.encode())
        digest.update(repr([round(value, 7) for row in obj.matrix_basis for value in row]).encode())
        if obj.type == "MESH":
            mesh = obj.data
            digest.update(repr([tuple(round(c, 7) for c in vertex.co) for vertex in mesh.vertices]).encode())
            digest.update(repr([tuple(polygon.vertices) for polygon in mesh.polygons]).encode())
            names = {group.index: group.name for group in obj.vertex_groups}
            digest.update(repr([sorted((names[g.group], round(g.weight, 6)) for g in vertex.groups)
                                for vertex in mesh.vertices]).encode())
        if obj.type == "ARMATURE":
            digest.update(repr([(bone.name, [round(v, 7) for row in bone.matrix_local for v in row])
                                for bone in obj.data.bones]).encode())
        if obj.type == "EMPTY":
            digest.update(repr((obj.parent_type, obj.parent_bone,
                                [round(v, 7) for row in obj.matrix_parent_inverse for v in row])).encode())
    return digest.hexdigest()


def measure_boots(surface) -> dict:
    """Heel and toe pivots and the splay of each boot, from its sole vertices."""
    feet = {}
    points = [vertex.co.copy() for vertex in surface.data.vertices if vertex.co.z < 0.06]
    for side in SIDES:
        sign = 1.0 if side == "L" else -1.0
        sole = [point for point in points if point.x * sign > 0.04]
        centre = sum(sole, Vector()) / len(sole)
        xx = sum((p.x - centre.x) ** 2 for p in sole)
        yy = sum((p.y - centre.y) ** 2 for p in sole)
        xy = sum((p.x - centre.x) * (p.y - centre.y) for p in sole)
        angle = 0.5 * math.atan2(2.0 * xy, xx - yy)
        axis = Vector((math.cos(angle), math.sin(angle), 0.0))
        if axis.y > 0:
            axis.negate()
        projections = [(p - centre).dot(axis) for p in sole]
        toe = centre + axis * max(projections)
        heel = centre + axis * min(projections)
        toe.z = heel.z = 0.0
        # A stiff boot rolls over the ball of the foot, a little behind the tip.
        ball = heel.lerp(toe, 0.82)
        splay = math.degrees(math.atan2(axis.x * sign, -axis.y))
        feet[side] = {"heel": list(heel), "toe": list(ball), "tip": list(toe), "bootYaw": splay}
    return feet


def socket_frames(collection, rig, scene) -> dict[str, Matrix]:
    rig.data.pose_position = "REST"
    scene.view_layers[0].update()
    frames = {}
    for side, name in (("L", "char_player_hand_socket_left"), ("R", "char_player_hand_socket_right")):
        socket = collection.all_objects[name]
        hand = rig.data.bones[socket.parent_bone]
        frames[side] = hand.matrix_local.inverted() @ rig.matrix_world.inverted() @ socket.matrix_world
    rig.data.pose_position = "POSE"
    return frames


def bake(rig, model: RigModel, clip, spec_clip) -> tuple[object, dict]:
    old = bpy.data.actions.get(clip.name)
    if old is not None:
        bpy.data.actions.remove(old)
    action = bpy.data.actions.new(clip.name)
    action.use_fake_user = True
    rig.animation_data.action = action
    frames = round(clip.duration * BAKE_HZ)
    names = model.order
    samples = {name: {"location": [[], [], []], "rotation_quaternion": [[], [], [], []]} for name in names}
    previous = {}
    metrics = {"legShortMillimetres": 0.0, "notes": [], "frames": frames + 1, "sampleRateHz": BAKE_HZ}
    soles = {side: [] for side in SIDES}
    knees = []
    poses = []
    for frame in range(frames + 1):
        t = min(clip.duration, frame / BAKE_HZ)
        pose = build_pose(model, clip.sample(t))
        poses.append(pose)
        for note in pose.notes:
            metrics["notes"].append(f"f{frame}: {note}")
            try:
                metrics["legShortMillimetres"] = max(metrics["legShortMillimetres"], float(note.split(" by ")[1].split(" ")[0]))
            except (IndexError, ValueError):
                pass
        for side in SIDES:
            soles[side].append(sole_points(model, pose, side))
        knees.append(min(knee_flexion(pose, side) for side in SIDES))
        for name, (location, rotation) in pose.channels().items():
            if name in previous and rotation.dot(previous[name]) < 0:
                rotation.negate()
            previous[name] = rotation
            for axis in range(3):
                samples[name]["location"][axis].append(location[axis])
            for axis in range(4):
                samples[name]["rotation_quaternion"][axis].append(rotation[axis])
    for name in names:
        pose_bone = rig.pose.bones[name]
        pose_bone.rotation_mode = "QUATERNION"
        for path, channels in samples[name].items():
            for index, values in enumerate(channels):
                curve = action.fcurve_ensure_for_datablock(rig, f'pose.bones["{name}"].{path}', index=index,
                                                           group_name=name)
                curve.keyframe_points.clear()
                curve.keyframe_points.add(len(values))
                curve.keyframe_points.foreach_set("co", [c for frame, value in enumerate(values) for c in (frame * FPS / BAKE_HZ, value)])
                for key in curve.keyframe_points:
                    key.interpolation = "LINEAR"
                curve.update()
        for index in range(3):
            curve = action.fcurve_ensure_for_datablock(rig, f'pose.bones["{name}"].scale', index=index, group_name=name)
            curve.keyframe_points.clear()
            curve.keyframe_points.add(2)
            curve.keyframe_points.foreach_set("co", [0.0, 1.0, float(frames) * FPS / BAKE_HZ, 1.0])
            for key in curve.keyframe_points:
                key.interpolation = "LINEAR"
            curve.update()
    # The recipe owns loop and reference speed; the catalog owns commit markers.
    action["neva_loop"] = clip.loop
    if clip.reference_speed is not None:
        action["neva_reference_speed_meters_per_second"] = clip.reference_speed
    if "commitMarkerSeconds" in spec_clip:
        action["neva_commit_marker_seconds"] = spec_clip["commitMarkerSeconds"]
    metrics.update(_contact_metrics(clip, soles))
    metrics["minimumKneeFlexionDegrees"] = min(knees)
    if clip.loop:
        seam = max((poses[0].H[name] - poses[-1].H[name]).length for name in names)
        metrics["loopSeamMillimetres"] = seam * 1000.0
    metrics["notes"] = metrics["notes"][:12]
    return action, {**metrics, "poses": poses}


def _contact_metrics(clip, soles) -> dict:
    """Stance intervals, their slip against the clip's ground speed, and the lowest sole."""
    speed = clip.reference_speed or 0.0

    def ground_speed(frame: int) -> float:
        if clip.travel is None:
            return speed
        t0, t1 = (frame - 1) / BAKE_HZ, frame / BAKE_HZ
        return (clip.travel(min(t1, clip.duration)) - clip.travel(min(t0, clip.duration))) * BAKE_HZ

    result = {"contacts": {}, "maximumSlipMillimetres": 0.0, "lowestSoleMillimetres": 1e9}
    for side in SIDES:
        planted = []
        for frame, (heel, toe) in enumerate(soles[side]):
            low = min(heel.z, toe.z)
            result["lowestSoleMillimetres"] = min(result["lowestSoleMillimetres"], low * 1000.0)
            planted.append(low < CONTACT_HEIGHT_METERS)
        if clip.loop:
            # A loop's last frame repeats its first; a stance that reaches it
            # continues through the seam rather than landing anew.
            planted = planted[:-1]
        spans, start = [], None
        for frame, down in enumerate(planted + [False]):
            if down and start is None:
                start = frame
            elif not down and start is not None:
                spans.append((start, frame - 1))
                start = None
        if clip.loop and spans and spans[-1][1] == len(planted) - 1:
            spans[-1] = (spans[-1][0], len(planted))
        if clip.loop:
            planted = planted + [planted[0]]
        intervals = []
        frames_total = len(planted) - 1
        for first, last in spans:
            if last == first:
                # A single planted frame counts only at the clip's ends (a
                # start still standing, a landing just touching down).
                if first not in ((0,) if clip.loop else (0, frames_total)):
                    continue
                first, last = (0, 1) if first == 0 else (frames_total - 1, frames_total)
            # The lowest pivot must track the ground: compare successive frames.
            slip = 0.0
            for frame in range(first + 1, last + 1):
                for index in (0, 1):
                    before, after = soles[side][frame - 1][index], soles[side][frame][index]
                    if max(before.z, after.z) < GROUNDED_METERS:
                        moved = after - before
                        # A planted sole moves back at the ground speed.
                        expected = Vector((0.0, ground_speed(frame) / BAKE_HZ, 0.0))
                        slip = max(slip, (moved - expected).length)
            result["maximumSlipMillimetres"] = max(result["maximumSlipMillimetres"], slip * 1000.0)
            intervals.append({"start": round(first / BAKE_HZ, 6), "end": round(last / BAKE_HZ, 6),
                              "slipMillimetresPerFrame": round(slip * 1000.0, 2)})
        result["contacts"][side] = intervals
    return result


# Collision volumes for the self-contact check (hands and forearms against the
# torso and head; the baggy trousers make thighs meaningless): elliptic capsules round these
# bones, fitted to the skin they carry at rest.
VOLUME_BONES = ("Hips", "Abdomen", "Torso", "Chest", "Head")
PROBE_POINTS = [("Wrist.{s}", "head"), ("LowerArm.{s}", "mid"), ("Index4.{s}", "tail"), ("Middle3.{s}", "head"),
                ("Pinky4.{s}", "tail"), ("Thumb3.{s}", "tail"), ("Middle2.{s}", "head")]


def fit_volumes(surface, model) -> dict:
    """Per bone: an elliptic section (lateral, sagittal radius) round its segment at rest.

    Radii are the 60th percentile of the skin the bone dominates, measured in
    the bone's frame, so the volume sits just inside the surface.
    """
    names = {group.index: group.name for group in surface.vertex_groups}
    owned: dict[str, list] = {bone: [] for bone in VOLUME_BONES}
    for vertex in surface.data.vertices:
        weights = {names[item.group]: item.weight for item in vertex.groups}
        if weights:
            bone = max(weights, key=weights.get)
            if bone in owned:
                owned[bone].append(vertex.co.copy())
    volumes = {}
    for bone, points in owned.items():
        head, tail = model.rest_head[bone], model.rest_tail[bone]
        axis = (tail - head).normalized()
        lateral = Vector((1.0, 0.0, 0.0)) - axis * axis.x
        lateral.normalize()
        sagittal = axis.cross(lateral)
        xs, ys = [], []
        for point in points:
            offset = point - head
            t = offset.dot(axis)
            if -0.02 <= t <= (tail - head).length + 0.02:
                xs.append(abs(offset.dot(lateral)))
                ys.append(abs(offset.dot(sagittal)))
        xs.sort()
        ys.sort()
        pick = lambda values: values[int(len(values) * 0.6)] if values else 0.05  # noqa: E731
        volumes[bone] = {"lateral": pick(xs), "sagittal": pick(ys), "axis": axis, "lateralAxis": lateral,
                         "sagittalAxis": sagittal, "length": (tail - head).length}
    return volumes


def contact_depth(pose, model, volumes) -> tuple[float, str]:
    """Deepest arm probe inside a torso, thigh or head volume (m), and where."""
    worst, where = 0.0, ""
    probes = []
    for side in SIDES:
        for bone_pattern, place in PROBE_POINTS:
            bone = bone_pattern.format(s=side)
            if place == "head":
                point = pose.H[bone]
            elif place == "tail":
                point = pose.tail(bone)
            else:
                point = (pose.H[bone] + pose.tail(bone)) * 0.5
            probes.append((f"{bone}:{place}", point))
    for bone, volume in volumes.items():
        rotation = pose.W[bone]
        head = pose.H[bone]
        axis, lateral, sagittal = (rotation @ volume["axis"], rotation @ volume["lateralAxis"],
                                   rotation @ volume["sagittalAxis"])
        for label, point in probes:
            offset = point - head
            t = offset.dot(axis)
            if t < 0.0 or t > volume["length"]:
                continue
            x, y = offset.dot(lateral) / volume["lateral"], offset.dot(sagittal) / volume["sagittal"]
            radial = math.hypot(x, y)
            if radial < 1.0:
                # Depth along the section's smaller radius, a conservative measure.
                depth = (1.0 - radial) * min(volume["lateral"], volume["sagittal"])
                if depth > worst:
                    worst, where = depth, f"{label} in {bone}"
    return worst, where


ROD_CLIPS = {"cast", "hookset", "fishing_idle", "reel", "slack", "brace", "skiff_fishing"}


def rod_contact(poses, model, ctx) -> dict:
    """Where the rod the right hand holds puts its reel knob, against the left palm and reach.

    The runtime docks the rod to the right hand and then solves the left hand
    onto the knob; this rebuilds that knob from the solved right hand.
    """
    arm_r, arm_l = model.arms["R"], model.arms["L"]
    socket_rest = model.rest[arm_r.hand].to_3x3() @ arm_r.socket.to_3x3()
    rest_along, rest_fingers, rest_contact = (socket_rest @ Vector(axis) for axis in ((1, 0, 0), (0, 0, 1), (0, -1, 0)))
    reach = arm_l.upper_length + arm_l.lower_length
    worst_palm, worst_reach = 0.0, 0.0
    for frame, pose in enumerate(poses):
        rotation = pose.W[arm_r.hand]
        along, fingers, contact = (rotation @ v for v in (rest_along, rest_fingers, rest_contact))
        socket = pose.point(arm_r.hand, (model.rest[arm_r.hand] @ arm_r.socket).translation)
        turn = min(ctx.duration, frame / BAKE_HZ) / ctx.duration if ctx.spec["name"] == "reel" else 0.0
        knob = socket + rod_knob_offset(ctx, along.normalized(), fingers.normalized(), contact.normalized(), turn)
        palm = pose.point(arm_l.hand, (model.rest[arm_l.hand] @ arm_l.socket).translation)
        worst_palm = max(worst_palm, (palm - knob).length)
        worst_reach = max(worst_reach, (knob - pose.H[arm_l.upper]).length / reach)
    return {"leftPalmToKnobMillimetres": round(worst_palm * 1000.0, 1), "knobReachFraction": round(worst_reach, 3)}


def catalog_fields(clip, metrics) -> dict:
    """The catalog clip fields this performance defines, for apply_player_performance_report.mjs."""
    fields = {"durationSeconds": round(clip.duration, 9), "loop": clip.loop,
              "motionSource": {"kind": "authored", "sourceTimebase": "seconds", "recipe": clip.name}}
    if clip.reference_speed is not None:
        fields["referenceSpeedMetersPerSecond"] = clip.reference_speed
    if clip.events is not None:
        fields["events"] = clip.events
    if clip.contact_windows is not None:
        fields["contacts"] = {name: [{"start": round(start, 6), "end": round(end, 6)} for start, end in clip.contact_windows[side]]
                              for side, name in (("L", "left"), ("R", "right"))}
    elif clip.contacts == "none":
        fields["contacts"] = {"left": [], "right": []}
    else:
        fields["contacts"] = {name: [{"start": span["start"], "end": span["end"]} for span in metrics["contacts"][side]]
                              for side, name in (("L", "left"), ("R", "right"))}
    return fields


def verify_bake(scene, rig, action, poses, model) -> float:
    """Evaluate the baked action in Blender and compare bone heads with the model."""
    rig.animation_data.action = action
    worst = 0.0
    for frame in sorted({0, len(poses) // 3, (2 * len(poses)) // 3, len(poses) - 1}):
        timeline_frame = frame * FPS / BAKE_HZ
        scene.frame_set(int(timeline_frame), subframe=timeline_frame % 1)
        scene.view_layers[0].update()
        for name in model.order:
            head = rig.pose.bones[name].head
            worst = max(worst, (head - poses[frame].H[name]).length)
    return worst


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--clips", default="")
    parser.add_argument("--source", type=Path, default=None)
    parser.add_argument("--repair-skin", action="store_true",
                        help="rebuild the crotch seam's thigh split (common/player_skin.py) on both LODs")
    parser.add_argument("--companions", type=Path, default=None,
                        help="companions.json from sample_player_companions.mjs (boat and mount clips)")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    output = args.output_dir.resolve()
    if not bpy.app.background or not output.is_relative_to(REPO / "output"):
        raise ValueError("Use fresh background Blender and a directory under output/")
    catalog = json.loads((REPO / "assets/specs/asset-catalog.json").read_text())
    spec = next(asset for asset in catalog["assets"] if asset["id"] == ASSET)
    catalog_clips = {clip["name"]: clip for clip in [*spec["animationClips"], *spec.get("additionalAnimationClips", [])]}
    source = (args.source or REPO / spec["parameters"]["sourceBlend"]).resolve()
    selected = [name for name in args.clips.split(",") if name] or list(catalog_clips)
    unknown = sorted(set(selected) - set(catalog_clips))
    if unknown:
        raise ValueError(f"Not catalog clips: {unknown}")
    output.mkdir(parents=True, exist_ok=True)
    blend_path = output / f"{ASSET}.blend"
    report_path = output / f"{ASSET}-performance-report.json"

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps, scene.render.fps_base = FPS, 1
    with bpy.data.libraries.load(str(source), link=False) as (available, requested):
        requested.collections = [spec["parameters"]["sourceCollection"]]
    collection = requested.collections[0]
    scene.collection.children.link(collection)
    rig = collection.all_objects[spec["rigNode"]]
    surface = collection.all_objects[f"{ASSET}_surface_LOD0"]
    skin_repairs = []
    if args.repair_skin:
        # A deliberate skin change: positions, topology and bind stay; weights move.
        for lod in ("LOD0", "LOD1"):
            skin_repairs.append(blend_crotch(collection.all_objects[f"{ASSET}_surface_{lod}"], rig))
    geometry_before = geometry_fingerprint(collection)
    kept = {action.name: action_fingerprint(action) for action in bpy.data.actions if action.name not in selected}
    stray = sorted(set(kept) - set(catalog_clips))
    for name in stray:
        bpy.data.actions.remove(bpy.data.actions[name])
        kept.pop(name)

    feet = measure_boots(surface)
    model = RigModel(rig, socket_frames(collection, rig, scene), feet)
    volumes = fit_volumes(surface, model)
    data = rig.animation_data_create()
    data.use_nla = False
    report = {"assetId": ASSET, "source": str(source.relative_to(REPO)),
              "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
              "boots": feet, "clips": {}, "removedStrayActions": stray, "skinRepairs": skin_repairs}
    companions = json.loads(args.companions.read_text()) if args.companions else None
    for name in selected:
        if name in GAIT_RECIPES:
            clip = GAIT_RECIPES[name]()
        elif name in ACTION_RECIPES or name in RIDE_RECIPES:
            recipe = ACTION_RECIPES.get(name) or RIDE_RECIPES[name]
            clip = recipe(Context(model, catalog_clips[name], companions))
        else:
            raise KeyError(f"No player performance recipe for {name!r}")
        if clip.reference_speed is None and "referenceSpeedMetersPerSecond" in catalog_clips[name]:
            # Mounted gaits ride the donkey's stride: its catalog speed, not the rider's legs.
            clip.reference_speed = catalog_clips[name]["referenceSpeedMetersPerSecond"]
        catalog_clip = catalog_clips[name]
        action, metrics = bake(rig, model, clip, catalog_clip)
        poses = metrics.pop("poses")
        metrics["bakeErrorMillimetres"] = verify_bake(scene, rig, action, poses, model) * 1000.0
        deepest = max(((contact_depth(pose, model, volumes), frame) for frame, pose in enumerate(poses)),
                      key=lambda item: item[0][0])
        metrics["selfContact"] = {"depthMillimetres": round(deepest[0][0] * 1000.0, 1), "where": deepest[0][1],
                                  "frame": deepest[1]}
        metrics.update({"durationSeconds": clip.duration, "loop": clip.loop,
                        "referenceSpeedMetersPerSecond": clip.reference_speed})
        metrics["catalog"] = catalog_fields(clip, metrics)
        if name in ROD_CLIPS:
            metrics["rodContact"] = rod_contact(poses, model, Context(model, catalog_clips[name], companions))
        report["clips"][name] = metrics
        print(f"{name}: slip {metrics['maximumSlipMillimetres']:.1f} mm/frame, lowest sole "
              f"{metrics['lowestSoleMillimetres']:.1f} mm, leg short {metrics['legShortMillimetres']:.1f} mm, "
              f"bake {metrics['bakeErrorMillimetres']:.2f} mm, contact {metrics['selfContact']}, "
              f"rod {metrics.get('rodContact')}, "
              f"contacts {[(side, [(i['start'], i['end']) for i in spans]) for side, spans in metrics['contacts'].items()]}")

    # One same-named track per catalog action; none evaluates at rest.
    data.action = None
    for track in list(data.nla_tracks):
        data.nla_tracks.remove(track)
    for name in [clip for clip in catalog_clips if bpy.data.actions.get(clip)]:
        action = bpy.data.actions[name]
        track = data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 0, action)
        if action.slots:
            strip.action_slot = action.slots[0]
        strip.extrapolation = "NOTHING"
        strip.blend_type = "REPLACE"
    data.use_nla = False
    for pose_bone in rig.pose.bones:
        pose_bone.location = (0.0, 0.0, 0.0)
        pose_bone.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
        pose_bone.scale = (1.0, 1.0, 1.0)
    scene.frame_set(0)
    missing = sorted(set(catalog_clips) - {action.name for action in bpy.data.actions})
    extra = sorted({action.name for action in bpy.data.actions} - set(catalog_clips))
    if missing or extra:
        raise RuntimeError(f"Action set differs from the catalog: missing {missing}, extra {extra}")
    changed = sorted(name for name, digest in kept.items() if action_fingerprint(bpy.data.actions[name]) != digest)
    if changed:
        raise RuntimeError(f"Unselected actions changed: {changed}")
    if geometry_fingerprint(collection) != geometry_before:
        raise RuntimeError("Surfaces, skin, skeleton or sockets changed")
    report.update({"selected": selected, "preservedActions": sorted(kept), "geometryUnchanged": True,
                   "outputBlend": str(blend_path.relative_to(REPO)), "publication": "not_performed",
                   "visualStatus": "Awaiting human game review"})
    bpy.data.libraries.write(str(blend_path), {collection}, path_remap="RELATIVE", fake_user=True, compress=True)
    report["outputSha256"] = hashlib.sha256(blend_path.read_bytes()).hexdigest()
    report_path.write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
