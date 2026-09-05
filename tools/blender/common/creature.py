"""Shared construction for creatures that must read as one animal.

Neva's fauna were built the way most low-poly generators start: an ico-sphere
for the body, another for the haunch, a box per leg segment, each its own object
parented to an empty that rotates it. At rest that reads as a toy, and the
moment a limb rotates the intersecting primitives slide apart and the animal
comes to pieces. `fauna_cow_a` is the only animal that does not do this, because
it is not built here at all -- it is a reviewed donor mesh with one continuous
surface and a real skeleton.

Build anatomy with the lofts, limb tubes and shared-boundary grafts in `geometry`,
then bind it to a deterministic armature and key the catalog's clips onto bones.
Joining objects packages those surfaces; shared boundary loops or deliberately
matched attachments establish continuity. Weights must preserve those joins as
the animal bends.

Everything here is deterministic. `art:determinism` regenerates an asset and
compares decoded semantics, so weighting solves distances in a fixed order and breaks
ties by name rather than calling Blender's bone-heat solver.
"""

from __future__ import annotations

from collections import defaultdict
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

from .geometry import _object_operator_context, apply_vertex_values, join_meshes


# One bone of an authored skeleton. `head`/`tail` are in the generator's own
# authored space -- the same coordinates the geometry uses -- so a bone can be
# placed at the pivot the clip already rotates around. `envelope` optionally
# caps how far the bone reaches: without it a distant bone still contributes a
# vanishing inverse-distance weight, which is harmless but wastes an influence
# slot on a four-legged animal where all four legs compete.
def bone(name: str, head, tail, parent: str | None = None, *, envelope: float | None = None) -> dict:
    return {
        "name": name,
        "head": Vector(head),
        "tail": Vector(tail),
        "parent": parent,
        "envelope": None if envelope is None else float(envelope),
    }


def _point_to_segment_distance(point: Vector, start: Vector, end: Vector) -> float:
    segment = end - start
    length_squared = segment.length_squared
    if length_squared <= 1e-12:
        return (point - start).length
    projection = (point - start).dot(segment) / length_squared
    clamped = max(0.0, min(1.0, projection))
    return (point - (start + segment * clamped)).length


def build_creature_armature(name: str, bones: list[dict], parent) -> bpy.types.Object:
    """Author one armature from a declarative bone list.

    Bone names must stay dot-free: the pipeline rejects unstable node names, and
    the glTF exporter emits one node per bone.
    """
    if not bones:
        raise ValueError(f"{name}: a creature armature needs at least one bone")
    seen: set[str] = set()
    for entry in bones:
        if "." in entry["name"]:
            raise ValueError(f"{name}: bone {entry['name']!r} would export as an unstable node name")
        if entry["name"] in seen:
            raise ValueError(f"{name}: duplicate bone {entry['name']!r}")
        seen.add(entry["name"])
        if entry["parent"] is not None and entry["parent"] not in seen:
            raise ValueError(f"{name}: bone {entry['name']!r} is declared before its parent")
        if (entry["tail"] - entry["head"]).length < 1e-5:
            raise ValueError(f"{name}: bone {entry['name']!r} has no length")

    armature = bpy.data.armatures.new(f"{name}_skeleton")
    rig = bpy.data.objects.new(name, armature)
    collection = parent.users_collection[0] if parent.users_collection else bpy.context.scene.collection
    collection.objects.link(rig)
    rig.parent = parent

    previous_active = bpy.context.view_layer.objects.active
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    try:
        for entry in bones:
            edit_bone = armature.edit_bones.new(entry["name"])
            edit_bone.head = entry["head"]
            edit_bone.tail = entry["tail"]
            edit_bone.roll = 0.0
            if entry["parent"] is not None:
                edit_bone.parent = armature.edit_bones[entry["parent"]]
    finally:
        bpy.ops.object.mode_set(mode="OBJECT")
        bpy.context.view_layer.objects.active = previous_active

    for pose_bone in rig.pose.bones:
        pose_bone.rotation_mode = "XYZ"
    rig["neva_creature_rig"] = True
    return rig


def bind_creature_skin(
    surface: bpy.types.Object,
    rig: bpy.types.Object,
    bones: list[dict],
    *,
    falloff: float = 4.0,
    max_influences: int = 4,
) -> dict:
    """Weight one joined surface to an authored skeleton, deterministically.

    Inverse distance to the bone *segment* rather than to its head, so a long
    limb bone holds its whole tube instead of pulling everything toward the
    joint. A high falloff keeps the middle of a limb effectively rigid while
    still blending across the loop at each joint, which is the behaviour that
    stops a shoulder tearing open.
    """
    mesh = surface.data
    if not mesh.vertices:
        raise ValueError(f"{surface.name}: cannot skin an empty surface")
    if max_influences < 1 or max_influences > 4:
        raise ValueError(f"{surface.name}: glTF supports one to four influences per vertex")

    for group in list(surface.vertex_groups):
        surface.vertex_groups.remove(group)
    groups = {entry["name"]: surface.vertex_groups.new(name=entry["name"]) for entry in bones}

    to_world = surface.matrix_world
    rig_to_world = rig.matrix_world
    segments = [
        (entry["name"], rig_to_world @ entry["head"], rig_to_world @ entry["tail"], entry["envelope"])
        for entry in bones
    ]

    pruned = 0
    escaped_envelope = 0
    for vertex in mesh.vertices:
        point = to_world @ vertex.co
        distances = [
            (name, _point_to_segment_distance(point, head, tail), envelope)
            for name, head, tail, envelope in segments
        ]
        candidates = [
            (name, 1.0 / max(distance, 1e-4) ** falloff)
            for name, distance, envelope in distances
            if envelope is None or distance <= envelope
        ]
        if not candidates:
            # A vertex outside every declared envelope still has to move with
            # something; fall back to its nearest bone rather than exporting an
            # unweighted vertex that would collapse to the origin.
            escaped_envelope += 1
            nearest = min(distances, key=lambda item: (item[1], item[0]))
            candidates = [(nearest[0], 1.0)]
        candidates.sort(key=lambda item: (-item[1], item[0]))
        selected = candidates[:max_influences]
        pruned += max(0, len(candidates) - len(selected))
        total = sum(weight for _, weight in selected)
        if total <= 0.0:
            raise ValueError(f"{surface.name}: vertex {vertex.index} resolved to zero total weight")
        for name, weight in selected:
            groups[name].add([vertex.index], weight / total, "REPLACE")

    modifiers = [modifier for modifier in surface.modifiers if modifier.type == "ARMATURE"]
    for modifier in modifiers:
        surface.modifiers.remove(modifier)
    surface.modifiers.new(f"{surface.name}_skin", "ARMATURE").object = rig

    unweighted = [vertex.index for vertex in mesh.vertices if not vertex.groups]
    if unweighted:
        raise ValueError(f"{surface.name}: {len(unweighted)} vertices left unweighted")
    return {
        "surface": surface.name,
        "bones": len(bones),
        "maximumInfluences": max(len(vertex.groups) for vertex in mesh.vertices),
        "prunedInfluences": pruned,
        "verticesOutsideEveryEnvelope": escaped_envelope,
    }


def prune_influences(surface: bpy.types.Object, rig: bpy.types.Object, *, max_influences: int = 4) -> dict:
    """Keep the strongest influences per vertex and renormalize what remains.

    Decimation interpolates vertex groups, so a collapsed vertex can end up with
    more influences than glTF carries. Truncating here rather than leaving it to
    the exporter keeps the exported weights summing to one.
    """
    pruned = 0
    for vertex in surface.data.vertices:
        entries = sorted(
            ((group.group, group.weight) for group in vertex.groups if group.weight > 1e-8),
            key=lambda item: (-item[1], surface.vertex_groups[item[0]].name),
        )
        if not entries:
            raise ValueError(f"{surface.name}: vertex {vertex.index} lost every influence")
        selected = entries[:max_influences]
        pruned += max(0, len(entries) - len(selected))
        total = sum(weight for _, weight in selected)
        for group in list(vertex.groups):
            surface.vertex_groups[group.group].remove([vertex.index])
        for index, weight in selected:
            name = surface.vertex_groups[index].name
            if name not in rig.data.bones:
                raise ValueError(f"{surface.name}: weight references absent bone {name!r}")
            surface.vertex_groups[index].add([vertex.index], weight / total, "REPLACE")
    return {
        "maximumInfluences": max(len(vertex.groups) for vertex in surface.data.vertices),
        "prunedInfluences": pruned,
    }


def join_creature_surface(parts, name: str, parent) -> bpy.types.Object:
    """Package surfaces for skinning; joining does not establish continuity.

    Primary anatomy uses shared loops (geometry.graft_limb). Deliberately
    separate attachments may be packaged here without welding their boundaries.
    """
    meshes = [part for part in parts if part is not None]
    if not meshes:
        raise ValueError(f"{name}: no anatomy to join")
    surface = join_meshes(meshes, name)
    if surface is None:
        raise ValueError(f"{name}: join produced no surface")
    bpy.context.view_layer.update()
    world = surface.matrix_world.copy()
    surface.parent = parent
    surface.matrix_parent_inverse.identity()
    surface.matrix_basis = parent.matrix_world.inverted() @ world
    bpy.context.view_layer.update()
    apply_vertex_values(surface)
    return surface


def bake_pivot_skin(spec, rig, pivot_map, *, frame_rate):
    """Bake existing articulated-pivot motion into the skin's bind frames.

    Equipment and gameplay-facing markers keep their original channels. Bones
    receive the same rest-relative matrices, sampled on the original frame grid,
    so adding continuous anatomy cannot change mounted contact timing.
    """
    bpy.context.view_layer.update()
    rest = {name: rig.matrix_world.inverted() @ node.matrix_world for name, node in pivot_map.items()}
    holders = [obj for obj in bpy.context.scene.objects if obj.animation_data and obj is not rig]
    saved_mutes = [(track, track.mute) for obj in holders for track in obj.animation_data.nla_tracks]
    saved_basis = {obj: obj.matrix_basis.copy() for obj in holders}
    rig.animation_data_create()
    clips = [*(spec.get("animationClips") or []), *(spec.get("additionalAnimationClips") or [])]
    try:
        for clip in clips:
            for track, _ in saved_mutes:
                track.mute = track.name != clip["name"]
            for track in rig.animation_data.nla_tracks:
                track.mute = True
            action = bpy.data.actions.new(clip["name"] + "_skin")
            _tag_action(action, clip)
            rig.animation_data.action = action
            for frame in range(_frame_number(clip["durationSeconds"], frame_rate) + 1):
                bpy.context.scene.frame_set(frame)
                inverse = rig.matrix_world.inverted()
                for name, node in pivot_map.items():
                    pose = rig.pose.bones[name]
                    desired = inverse @ node.matrix_world @ rest[name].inverted() @ pose.bone.matrix_local
                    # These independent bind frames already include their pivot
                    # ancestors, so no parent transform is applied a second time.
                    pose.matrix_basis = pose.bone.matrix_local.inverted() @ desired
                    pose.rotation_mode = "QUATERNION"
                    pose.keyframe_insert("location", frame=frame)
                    pose.keyframe_insert("rotation_quaternion", frame=frame)
                    pose.keyframe_insert("scale", frame=frame)
            rig.animation_data.action = None
            track = rig.animation_data.nla_tracks.new()
            track.name = clip["name"]
            track.strips.new(clip["name"], 0, action)
    finally:
        for track, muted in saved_mutes:
            track.mute = muted
        for track in rig.animation_data.nla_tracks:
            track.mute = False
        bpy.context.scene.frame_set(0)
        for obj, matrix in saved_basis.items():
            obj.matrix_basis = matrix
        for pose in rig.pose.bones:
            pose.matrix_basis = Matrix.Identity(4)
        bpy.context.view_layer.update()


def _frame_number(seconds: float, frame_rate: float) -> int:
    return max(0, math.floor(seconds * frame_rate + 0.5))


def _clip_for(spec: dict, clip_name: str) -> dict | None:
    clips = [*(spec.get("animationClips") or []), *(spec.get("additionalAnimationClips") or [])]
    return next((entry for entry in clips if entry["name"] == clip_name), None)


def _tag_action(action, clip: dict) -> None:
    action["neva_loop"] = clip.get("loop", False)
    if "commitMarkerSeconds" in clip:
        action["neva_commit_marker_seconds"] = clip["commitMarkerSeconds"]
    if "referenceSpeedMetersPerSecond" in clip:
        action["neva_reference_speed_meters_per_second"] = clip["referenceSpeedMetersPerSecond"]
    action.use_fake_user = True


def author_creature_clip(
    spec: dict,
    clip_name: str,
    *,
    frame_rate: float,
    object_tracks=(),
    bone_tracks=(),
) -> None:
    """Key one catalog clip across empties and bones as a single exported clip.

    Blender keeps object animation in one action per object and all of an
    armature's bone channels in one action per armature. The glTF exporter
    merges NLA strips that share a track name, so every carrier here gets a
    track called `clip_name` and the exporter reassembles them into the one
    named clip the catalog declares. This is the same trick `_author_fauna_tracks`
    already uses across the donkey's pivots, extended to cover bones.

    Exactly one action carries the bare clip name, because
    `_validate_animation_contract` looks the clip up by action name and measures
    its duration; the rest are suffixed.

    `object_tracks` is `(object, keyframes)` and `bone_tracks` is
    `(rig, bone_name, keyframes)`, with keyframes `(seconds, rotation_xyz,
    location)` -- the same authoring vocabulary the fauna generators already use.
    """
    clip = _clip_for(spec, clip_name)
    if clip is None:
        return
    bpy.context.scene.render.fps = int(frame_rate)
    bpy.context.scene.render.fps_base = 1.0

    grouped_bones: dict[bpy.types.Object, list[tuple[str, list]]] = defaultdict(list)
    rig_order: list[bpy.types.Object] = []
    for rig, bone_name, keyframes in bone_tracks:
        if rig not in grouped_bones:
            rig_order.append(rig)
        grouped_bones[rig].append((bone_name, keyframes))

    carriers: list[tuple[str, object]] = [(obj.name, ("object", obj, keys)) for obj, keys in object_tracks]
    carriers.extend((rig.name, ("bones", rig, grouped_bones[rig])) for rig in rig_order)
    if not carriers:
        raise ValueError(f"{spec['id']}: clip {clip_name} has no carriers")

    primary_keys = object_tracks[0][1] if object_tracks else grouped_bones[rig_order[0]][0][1]
    duration = clip["durationSeconds"]
    if abs(primary_keys[0][0]) > 1e-6 or abs(primary_keys[-1][0] - duration) > 1e-6:
        raise ValueError(
            f"{spec['id']}: clip {clip_name} must be carried from 0.0 to {duration} by its first track, "
            f"received {primary_keys[0][0]}..{primary_keys[-1][0]}"
        )

    for index, (carrier_name, payload) in enumerate(carriers):
        action_name = clip_name if index == 0 else f"{clip_name}_{carrier_name}"
        action = bpy.data.actions.new(name=action_name)
        _tag_action(action, clip)
        kind, holder, keys = payload
        holder.animation_data_create()
        holder.animation_data.action = action
        if kind == "object":
            _key_object(holder, keys, frame_rate)
        else:
            for bone_name, bone_keys in keys:
                _key_pose_bone(holder, bone_name, bone_keys, frame_rate)
        holder.animation_data.action = None
        track = holder.animation_data.nla_tracks.new()
        track.name = clip_name
        track.strips.new(clip_name, int(action.frame_range[0]), action)


def _key_object(obj, keyframes, frame_rate: float) -> None:
    base_location = obj.location.copy()
    base_rotation = obj.rotation_euler.copy()
    obj.rotation_mode = "XYZ"
    for seconds, rotation, location in keyframes:
        obj.rotation_euler = tuple(base_rotation[axis] + rotation[axis] for axis in range(3))
        obj.location = tuple(base_location[axis] + location[axis] for axis in range(3))
        frame = _frame_number(seconds, frame_rate)
        obj.keyframe_insert(data_path="rotation_euler", frame=frame)
        obj.keyframe_insert(data_path="location", frame=frame)
    obj.location = base_location
    obj.rotation_euler = base_rotation


def _key_pose_bone(rig, bone_name: str, keyframes, frame_rate: float) -> None:
    pose = rig.pose.bones.get(bone_name)
    if pose is None:
        raise ValueError(f"{rig.name}: no bone named {bone_name!r} to key")
    pose.rotation_mode = "XYZ"
    for seconds, rotation, location in keyframes:
        pose.rotation_euler = tuple(rotation)
        pose.location = tuple(location)
        frame = _frame_number(seconds, frame_rate)
        pose.keyframe_insert(data_path="rotation_euler", frame=frame)
        pose.keyframe_insert(data_path="location", frame=frame)
    pose.rotation_euler = (0.0, 0.0, 0.0)
    pose.location = (0.0, 0.0, 0.0)


def rest_creature_pose(rig) -> None:
    """Return every bone to bind pose so export measures the rest silhouette."""
    for pose in rig.pose.bones:
        pose.rotation_mode = "XYZ"
        pose.rotation_euler = (0.0, 0.0, 0.0)
        pose.location = (0.0, 0.0, 0.0)
        pose.scale = (1.0, 1.0, 1.0)
    bpy.context.view_layer.update()


def decimate_skinned_lod(
    surface: bpy.types.Object,
    rig: bpy.types.Object,
    ratio: float,
    name: str,
    parent,
    *,
    ground_plane: float | None = 0.0,
    maximum_lift: float = 0.05,
) -> bpy.types.Object:
    """Copy a skinned surface, reduce it, and rebind it to the same skeleton.

    Quadric collapse happily extrapolates a hoof vertex below the floor the
    silhouette was authored against, so the reduced copy is snapped back to that
    plane -- constrained, never rebuilt, and only within a bounded tolerance.
    """
    reduced = surface.copy()
    reduced.data = surface.data.copy()
    reduced.name = name
    reduced.data.name = f"{name}_mesh"
    collection = parent.users_collection[0] if parent.users_collection else bpy.context.scene.collection
    collection.objects.link(reduced)
    reduced.parent = parent
    for modifier in list(reduced.modifiers):
        reduced.modifiers.remove(modifier)

    decimate = reduced.modifiers.new(f"{name}_reduction", "DECIMATE")
    decimate.ratio = ratio
    decimate.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = reduced
    with _object_operator_context(reduced):
        bpy.ops.object.modifier_apply(modifier=decimate.name)

    if ground_plane is not None:
        below = [vertex for vertex in reduced.data.vertices if vertex.co.z < ground_plane]
        lift = max((ground_plane - vertex.co.z for vertex in below), default=0.0)
        if lift > maximum_lift:
            raise ValueError(f"{name}: reduction moved geometry {lift:.4f} m below the authored floor")
        for vertex in below:
            vertex.co.z = ground_plane

    editable = bmesh.new()
    try:
        editable.from_mesh(reduced.data)
        degenerate = [face for face in editable.faces if face.calc_area() < 5.1e-9]
        if degenerate:
            bmesh.ops.delete(editable, geom=degenerate, context="FACES")
        loose = [vertex for vertex in editable.verts if not vertex.link_faces]
        if loose:
            bmesh.ops.delete(editable, geom=loose, context="VERTS")
        editable.to_mesh(reduced.data)
    finally:
        editable.free()
    for polygon in reduced.data.polygons:
        polygon.use_smooth = False
    reduced.data.update()

    reduced.modifiers.new(f"{name}_skin", "ARMATURE").object = rig
    prune_influences(reduced, rig)
    apply_vertex_values(reduced)
    return reduced
