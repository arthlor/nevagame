"""Rigged faceted cozy coastal-worker character and NPC generator with authored farming clips."""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Euler, Matrix, Vector

from collections import defaultdict

from common.geometry import (
    _finish_mesh,
    add_beam,
    add_box,
    add_collision_primitives,
    add_cone,
    add_conforming_shell,
    add_cuff_band,
    add_cylinder,
    add_garment_hem,
    add_ico,
    add_limb_tube,
    add_lofted_form,
    add_marker,
    add_ring,
    add_strap,
    add_tapered_beam,
    add_tri_prism,
    join_meshes,
)
from common.authored import add_fasteners, add_lattice, add_rope_line
from common.lod import consolidate_lod_level, create_lod_roots


FRAME_RATE = 30.0
FAUNA_FRAME_RATE = 25.0
DONKEY_FRAME_RATE = 30.0

# Canonical humanoid proportions, as fractions of the authored `height`. Both
# the armature and the limb meshes read these, so the rig and the skin can never
# drift apart. Ground-to-hip is 46% of stature (was 41%, which capped the stride
# below the catalog's declared travel speeds and forced the feet to skate).
HIP_HEIGHT_FRACTION = 0.44
KNEE_HEIGHT_FRACTION = 0.235
ANKLE_HEIGHT_FRACTION = 0.065
BALL_HEIGHT_FRACTION = 0.030
# Forward knee displacement at rest. Keeps the rest interior angle near 172
# degrees so IK always resolves the knee forward.
KNEE_PREBEND_METERS = 0.034

# Adult traveler arm proportions shared by the armature, meshes, and sockets.
CLAVICLE_HEIGHT_FRACTION = 0.695
SHOULDER_HEIGHT_FRACTION = 0.680
ELBOW_HEIGHT_FRACTION = 0.525
WRIST_HEIGHT_FRACTION = 0.385
HAND_TIP_HEIGHT_FRACTION = 0.315
SHOULDER_X_METERS = 0.225
ELBOW_X_METERS = 0.340
WRIST_X_METERS = 0.350

# NPCs use a deliberately chibi storybook variant while the player keeps the
# adult worker baseline above. The compact lower body, larger head, and broad
# hands are authored as one proportion contract so the mesh, rig, sockets, and
# retargeted locomotion remain aligned.
NPC_CHIBI_STYLE = "chibi-storybook"
NPC_CHIBI_PROPORTIONS = {
    "root_tail": 0.10,
    "hip": 0.31,
    "pelvis_top": 0.38,
    "spine_top": 0.44,
    "spine_02_top": 0.51,
    "chest_top": 0.58,
    "neck_top": 0.66,
    "head_tail": 0.99,
    "knee": 0.155,
    "ankle": 0.055,
    "ball": 0.025,
    "clavicle": 0.57,
    "shoulder": 0.555,
    "elbow": 0.405,
    "wrist": 0.260,
    "hand_tip": 0.190,
    "leg_x": 0.120,
    "knee_x": 0.120,
    "shoulder_x": 0.285,
    "elbow_x": 0.325,
    "wrist_x": 0.340,
    "deltoid_x": 0.270,
    "arm_mid_x": 0.310,
    "cuff": 0.425,
    "carry": 0.43,
    "hip_socket": 0.31,
    "knee_prebend": 0.024,
}


def _is_chibi_npc(spec: dict | None) -> bool:
    return bool(
        spec
        and spec.get("generator") == "npc_character"
        and (spec.get("parameters") or {}).get("style") == NPC_CHIBI_STYLE
    )


def _character_proportions(spec: dict | None) -> dict[str, float]:
    if _is_chibi_npc(spec):
        return dict(NPC_CHIBI_PROPORTIONS)
    return {
        "root_tail": 0.18,
        "hip": HIP_HEIGHT_FRACTION,
        "pelvis_top": 0.50,
        "spine_top": 0.57,
        "spine_02_top": 0.64,
        "chest_top": 0.72,
        "neck_top": 0.78,
        "head_tail": 0.98,
        "knee": KNEE_HEIGHT_FRACTION,
        "ankle": ANKLE_HEIGHT_FRACTION,
        "ball": BALL_HEIGHT_FRACTION,
        "clavicle": CLAVICLE_HEIGHT_FRACTION,
        "shoulder": SHOULDER_HEIGHT_FRACTION,
        "elbow": ELBOW_HEIGHT_FRACTION,
        "wrist": WRIST_HEIGHT_FRACTION,
        "hand_tip": HAND_TIP_HEIGHT_FRACTION,
        "leg_x": 0.13,
        "knee_x": 0.14,
        "shoulder_x": SHOULDER_X_METERS,
        "elbow_x": ELBOW_X_METERS,
        "wrist_x": WRIST_X_METERS,
        "deltoid_x": 0.19,
        "arm_mid_x": 0.292,
        "cuff": 0.405,
        "carry": 0.54,
        "hip_socket": 0.40,
        "knee_prebend": KNEE_PREBEND_METERS,
    }

# UAL1 is an authoring source only. Its mesh, armature, materials, and source
# actions never leave the generator; selected clips are retargeted onto Neva's
# smaller semantic rig and exported through the normal catalog pipeline.
UAL1_TARGET_TO_SOURCE = {
    "rig_root": ("root", None),
    "rig_pelvis": ("pelvis", "root"),
    "rig_spine": ("spine_01", "pelvis"),
    "rig_spine_02": ("spine_02", "spine_01"),
    "rig_chest": ("spine_03", "spine_02"),
    "rig_neck": ("neck_01", "spine_03"),
    "rig_head": ("Head", "neck_01"),
    "rig_clavicle_left": ("clavicle_l", "spine_03"),
    "rig_upper_arm_left": ("upperarm_l", "clavicle_l"),
    "rig_forearm_left": ("lowerarm_l", "upperarm_l"),
    "rig_hand_left": ("hand_l", "lowerarm_l"),
    "rig_clavicle_right": ("clavicle_r", "spine_03"),
    "rig_upper_arm_right": ("upperarm_r", "clavicle_r"),
    "rig_forearm_right": ("lowerarm_r", "upperarm_r"),
    "rig_hand_right": ("hand_r", "lowerarm_r"),
    "rig_thigh_left": ("thigh_l", "pelvis"),
    "rig_shin_left": ("calf_l", "thigh_l"),
    "rig_foot_left": ("foot_l", "calf_l"),
    "rig_toe_left": ("ball_l", "foot_l"),
    "rig_thigh_right": ("thigh_r", "pelvis"),
    "rig_shin_right": ("calf_r", "thigh_r"),
    "rig_foot_right": ("foot_r", "calf_r"),
    "rig_toe_right": ("ball_r", "foot_r"),
}
UAL1_TARGET_ORDER = tuple(UAL1_TARGET_TO_SOURCE)
# UAL1 (Quaternius Universal Animation Library, CC0) supplies the humanoid core.
# Its clips are authored on a UE5-mannequin skeleton with world-locked feet, a
# 92-degree swing knee and a properly pumping elbow — none of which the
# hand-typed Euler tables below ever reached. Clips with no sane UAL1 analogue
# (fishing, rowing, boarding, mounting, farm tools) stay authored.
UAL1_CLIP_MAP = {
    "idle": "Idle_Loop",
    "walk": "Walk_Loop",
    "walk_start": "Walk_Loop",
    "run": "Jog_Fwd_Loop",
    "run_start": "Jog_Fwd_Loop",
    "carry_walk": "Walk_Loop",
    "carry_run": "Jog_Fwd_Loop",
    "jump_start": "Jump_Start",
    "fall": "Jump_Loop",
    "land_soft": "Jump_Land",
    "land_hard": "Jump_Land",
    "pickup": "PickUp_Table",
    "place": "Interact",
    "workstation": "Interact",
}
NPC_UAL1_CLIP_MAP = {
    "idle": "Idle_Loop",
    "walk": "Walk_Loop",
    "talk_gesture": "Idle_Talking_Loop",
}

# Clips whose feet must be re-solved onto the scaled source trajectory. Seated
# and airborne clips are excluded: their feet are not carrying the body, so
# planting them fights the pose instead of grounding it.
RETARGET_FOOT_PLANTED_CLIPS = frozenset({
    "walk", "walk_start", "run", "run_start", "carry_walk", "carry_run",
    "idle", "pickup", "place", "workstation", "land_soft", "land_hard",
})

# Horizontal step multiplier per clip. Neva's legs are shorter than the source
# skeleton's even after the proportion fix, so the leg-ratio-scaled step falls
# short of the travel the gait speed demands. The gain widens the step without
# lengthening the leg's drop; the IK reach clamp keeps it physical.
RETARGET_STRIDE_GAIN = {
    "walk": 1.43,
    "walk_start": 1.43,
    "carry_walk": 1.43,
    "run": 1.68,
    "run_start": 1.68,
    "carry_run": 1.68,
}

UAL1_LOCOMOTION_TRANSFER = {
    "rig_root": 1.0,
    "rig_pelvis": 0.68,
    "rig_spine": 0.62,
    "rig_chest": 0.62,
    "rig_neck": 0.52,
    "rig_head": 0.48,
    "rig_clavicle_left": 0.48,
    "rig_clavicle_right": 0.48,
    "rig_upper_arm_left": 0.52,
    "rig_upper_arm_right": 0.52,
    "rig_forearm_left": 0.46,
    "rig_forearm_right": 0.46,
    "rig_hand_left": 0.42,
    "rig_hand_right": 0.42,
    "rig_thigh_left": 0.62,
    "rig_thigh_right": 0.62,
    "rig_shin_left": 0.52,
    "rig_shin_right": 0.52,
    "rig_foot_left": 0.58,
    "rig_foot_right": 0.58,
}

# A suspension phase lets a trot carry the body farther between diagonal
# contacts than a walk, but it is still bounded by the authored hoof reach.
DONKEY_TROT_SUSPENSION_COVERAGE = 1.12
# An extended gallop covers more ground than the standing leg reach because
# the body travels through a gathered-to-flight phase between contacts.
DONKEY_GALLOP_SUSPENSION_COVERAGE = 1.355


def _frame_time_for_fraction(duration: float, fraction: float, frame_rate: float = FRAME_RATE) -> float:
    """Return a normalized key time on the requested authored frame grid."""
    duration_frames = max(1, math.floor(duration * frame_rate + 0.5))
    if fraction <= 0.0:
        return 0.0
    if fraction >= 1.0:
        return duration_frames / frame_rate
    return math.floor(duration_frames * fraction + 0.5) / frame_rate


def _frame_aligned_duration(seconds: float, frame_rate: float = FRAME_RATE) -> float:
    """Quantize a derived clip duration while keeping the final key exact."""
    return max(1, math.floor(seconds * frame_rate + 0.5)) / frame_rate


def _frame_number(seconds: float, frame_rate: float = FRAME_RATE) -> int:
    """Convert authored seconds to a deterministic integer frame."""
    return max(0, math.floor(seconds * frame_rate + 0.5))


def _fauna_frame_time_for_fraction(duration: float, fraction: float) -> float:
    return _frame_time_for_fraction(duration, fraction, FAUNA_FRAME_RATE)


def _fauna_frame_aligned_duration(seconds: float) -> float:
    return _frame_aligned_duration(seconds, FAUNA_FRAME_RATE)


def _fauna_frame_number(seconds: float, frame_rate: float = FAUNA_FRAME_RATE) -> int:
    return _frame_number(seconds, frame_rate)


def _fauna_frame_rate(spec: dict) -> float:
    return DONKEY_FRAME_RATE if spec.get("generator") == "fauna_donkey" else FAUNA_FRAME_RATE


def _donkey_frame_time_for_fraction(duration: float, fraction: float) -> float:
    return _frame_time_for_fraction(duration, fraction, DONKEY_FRAME_RATE)


def _donkey_frame_aligned_duration(seconds: float) -> float:
    return _frame_aligned_duration(seconds, DONKEY_FRAME_RATE)


def _animation_clips(spec: dict) -> list[dict]:
    return [
        *(spec.get("animationClips") or []),
        *(spec.get("additionalAnimationClips") or []),
    ]


def _fauna_motion_node(name: str, parent, location=(0.0, 0.0, 0.0)):
    node = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(node)
    node.parent = parent
    node.location = location
    return node


def _reparent_preserving_world(obj, parent) -> None:
    bpy.context.view_layer.update()
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_parent_inverse.identity()
    obj.matrix_basis = parent.matrix_world.inverted() @ world


def _author_fauna_action(spec: dict, clip_name: str, node, keyframes) -> None:
    clip = next((entry for entry in _animation_clips(spec) if entry["name"] == clip_name), None)
    if clip is None:
        return
    fauna_frame_rate = _fauna_frame_rate(spec)
    bpy.context.scene.render.fps = int(fauna_frame_rate)
    bpy.context.scene.render.fps_base = 1.0
    action = bpy.data.actions.new(name=clip_name)
    action["neva_loop"] = clip.get("loop", False)
    node.animation_data_create()
    node.animation_data.action = action
    base_location = node.location.copy()
    base_rotation = node.rotation_euler.copy()
    node.rotation_mode = "XYZ"
    for seconds, rotation, location in keyframes:
        node.rotation_euler = tuple(base_rotation[index] + rotation[index] for index in range(3))
        node.location = tuple(base_location[index] + location[index] for index in range(3))
        frame = _fauna_frame_number(seconds, fauna_frame_rate)
        node.keyframe_insert(data_path="rotation_euler", frame=frame)
        node.keyframe_insert(data_path="location", frame=frame)
    action.use_fake_user = True
    node.animation_data.action = None
    track = node.animation_data.nla_tracks.new()
    track.name = clip_name
    track.strips.new(clip_name, int(action.frame_range[0]), action)
    node.location = base_location
    node.rotation_euler = base_rotation


def _author_fauna_tracks(spec: dict, clip_name: str, tracks) -> None:
    """Author one named NLA clip across the articulated fauna pivots.

    Blender stores object animation in separate actions. Giving the primary
    motion node the catalog clip name and the supporting pivots stable suffixes
    lets the GLTF exporter merge their NLA strips into one runtime clip while
    keeping the catalog's exact action-name contract.
    """
    clip = next((entry for entry in _animation_clips(spec) if entry["name"] == clip_name), None)
    if clip is None:
        return
    fauna_frame_rate = _fauna_frame_rate(spec)
    bpy.context.scene.render.fps = int(fauna_frame_rate)
    bpy.context.scene.render.fps_base = 1.0
    for track_index, (node, keyframes) in enumerate(tracks):
        action_name = clip_name if track_index == 0 else f"{clip_name}_{node.name}"
        action = bpy.data.actions.new(name=action_name)
        action["neva_loop"] = clip.get("loop", False)
        if "commitMarkerSeconds" in clip:
            action["neva_commit_marker_seconds"] = clip["commitMarkerSeconds"]
        if "referenceSpeedMetersPerSecond" in clip:
            action["neva_reference_speed_meters_per_second"] = clip["referenceSpeedMetersPerSecond"]
        node.animation_data_create()
        node.animation_data.action = action
        base_location = node.location.copy()
        base_rotation = node.rotation_euler.copy()
        node.rotation_mode = "XYZ"
        for seconds, rotation, location in keyframes:
            node.rotation_euler = tuple(base_rotation[index] + rotation[index] for index in range(3))
            node.location = tuple(base_location[index] + location[index] for index in range(3))
            frame = _fauna_frame_number(seconds, fauna_frame_rate)
            node.keyframe_insert(data_path="rotation_euler", frame=frame)
            node.keyframe_insert(data_path="location", frame=frame)
        action.use_fake_user = True
        node.animation_data.action = None
        nla_track = node.animation_data.nla_tracks.new()
        nla_track.name = clip_name
        nla_track.strips.new(clip_name, int(action.frame_range[0]), action)
        node.location = base_location
        node.rotation_euler = base_rotation


def _character_prefix(spec: dict) -> str:
    return "char_player" if spec["id"] == "char_player_a" else spec["id"]


def _create_character_rig(root, height: float, spec: dict) -> bpy.types.Object:
    rig_name = spec.get("rigNode") or f"{_character_prefix(spec)}_rig"
    proportions = _character_proportions(spec)
    # Blender 5.2's armature_add operator can dereference a missing context
    # object after read_factory_settings. Build the object from datablocks and
    # provide an explicit operator override only for the edit-mode transition.
    armature_data = bpy.data.armatures.new(f"{rig_name}_data")
    rig = bpy.data.objects.new(rig_name, armature_data)
    collection = root.users_collection[0] if root.users_collection else bpy.context.scene.collection
    collection.objects.link(rig)
    rig.parent = root
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    with bpy.context.temp_override(
        object=rig,
        active_object=rig,
        selected_objects=[rig],
        selected_editable_objects=[rig],
    ):
        bpy.ops.object.mode_set(mode="EDIT")
    edit_bones = rig.data.edit_bones
    root_bone = edit_bones.new("rig_root")
    root_bone.head = (0.0, 0.0, 0.02)
    root_bone.tail = (0.0, 0.0, height * proportions["root_tail"])

    def add_bone(name, head, tail, parent, *, roll=0.0):
        bone = edit_bones.new(name)
        bone.head = head
        bone.tail = tail
        bone.parent = parent
        bone.use_connect = False
        bone.roll = roll
        return bone

    # Proportions are shared with the generated mesh. NPCs can opt into the
    # compact storybook contract without changing the player's adult rig.
    pelvis = add_bone(
        "rig_pelvis", (0.0, 0.0, height * proportions["hip"]), (0.0, 0.0, height * proportions["pelvis_top"]), root_bone
    )
    # Three spine segments so UAL1's spine_01/02/03 maps one-to-one instead of
    # collapsing a three-joint bend into two.
    spine = add_bone(
        "rig_spine", (0.0, 0.0, height * proportions["pelvis_top"]), (0.0, 0.0, height * proportions["spine_top"]), pelvis
    )
    spine_02 = add_bone(
        "rig_spine_02", (0.0, 0.0, height * proportions["spine_top"]), (0.0, 0.0, height * proportions["spine_02_top"]), spine
    )
    chest = add_bone(
        "rig_chest", (0.0, 0.0, height * proportions["spine_02_top"]), (0.0, 0.0, height * proportions["chest_top"]), spine_02
    )
    neck = add_bone(
        "rig_neck", (0.0, 0.0, height * proportions["chest_top"]), (0.0, 0.0, height * proportions["neck_top"]), chest
    )
    head = add_bone(
        "rig_head", (0.0, 0.0, height * proportions["neck_top"]), (0.0, 0.0, height * proportions["head_tail"]), neck
    )
    for side, sign in (("left", -1.0), ("right", 1.0)):
        clavicle = add_bone(
            f"rig_clavicle_{side}",
            (sign * 0.04, 0.0, height * proportions["clavicle"]),
            (sign * proportions["shoulder_x"], 0.0, height * proportions["shoulder"]),
            chest,
            roll=sign * math.pi,
        )
        upper_arm = add_bone(
            f"rig_upper_arm_{side}",
            (sign * proportions["shoulder_x"], 0.0, height * proportions["shoulder"]),
            (sign * proportions["elbow_x"], -0.006, height * proportions["elbow"]),
            clavicle,
            roll=sign * math.pi,
        )
        forearm = add_bone(
            f"rig_forearm_{side}",
            (sign * proportions["elbow_x"], -0.006, height * proportions["elbow"]),
            (sign * proportions["wrist_x"], -0.02, height * proportions["wrist"]),
            upper_arm,
            roll=sign * math.pi,
        )
        add_bone(
            f"rig_hand_{side}",
            (sign * proportions["wrist_x"], -0.02, height * proportions["wrist"]),
            (sign * proportions["wrist_x"], -0.04, height * proportions["hand_tip"]),
            forearm,
            roll=sign * math.pi,
        )
        # The knee is displaced forward so the rest pose has an unambiguous bend
        # direction in both adult and compact NPC rigs.
        thigh = add_bone(
            f"rig_thigh_{side}",
            (sign * proportions["leg_x"], 0.0, height * proportions["hip"]),
            (sign * proportions["knee_x"], -proportions["knee_prebend"], height * proportions["knee"]),
            pelvis,
            roll=sign * math.pi,
        )
        shin = add_bone(
            f"rig_shin_{side}",
            (sign * proportions["knee_x"], -proportions["knee_prebend"], height * proportions["knee"]),
            (sign * proportions["knee_x"], -0.01, height * proportions["ankle"]),
            thigh,
            roll=sign * math.pi,
        )
        # The foot now ends at the ball of the foot and hands off to a toe bone,
        # which is what makes heel-strike and toe-off expressible at all.
        foot = add_bone(
            f"rig_foot_{side}",
            (sign * proportions["knee_x"], -0.01, height * proportions["ankle"]),
            (sign * proportions["knee_x"], -0.15, height * proportions["ball"]),
            shin,
            roll=sign * math.pi,
        )
        add_bone(
            f"rig_toe_{side}",
            (sign * proportions["knee_x"], -0.15, height * proportions["ball"]),
            (sign * proportions["knee_x"], -0.26, height * (proportions["ball"] if _is_chibi_npc(spec) else proportions["ball"] * 0.86)),
            foot,
            roll=sign * math.pi,
        )
    backpack = add_bone(
        "rig_backpack",
        (0.0, 0.13, height * 0.52),
        (0.0, 0.29, height * 0.62),
        spine,
    )
    add_bone(
        "rig_canteen_left",
        (-0.25, 0.15, height * 0.48),
        (-0.25, 0.25, height * 0.50),
        backpack,
    )
    add_bone(
        "rig_canteen_right",
        (0.25, 0.15, height * 0.48),
        (0.25, 0.25, height * 0.50),
        backpack,
    )
    add_bone(
        "rig_hat_brim",
        (0.0, -0.12, height * 0.90),
        (0.0, -0.30, height * 0.90),
        head,
    )
    with bpy.context.temp_override(
        object=rig,
        active_object=rig,
        selected_objects=[rig],
        selected_editable_objects=[rig],
    ):
        bpy.ops.object.mode_set(mode="OBJECT")
    rig.show_in_front = True
    rig["neva_rig"] = True
    return rig


def _rig_bone_for_mesh(name: str) -> str:
    side = "left" if "_left" in name else "right" if "_right" in name else None
    if "canteen_strap" in name:
        return "rig_backpack"
    if "canteen" in name and side:
        return f"rig_canteen_{side}"
    if any(token in name for token in ("backpack", "pack_roll", "pack_flap", "pack_pouch", "pack_frame", "pack_buckle", "pack_lower", "pack_strap", "pack_body", "pack_bedroll")):
        return "rig_backpack"
    if "hat_brim" in name:
        return "rig_hat_brim"
    if side and "boot_toe" in name:
        return f"rig_toe_{side}"
    if side and ("hand_" in name or "finger_" in name):
        return f"rig_hand_{side}"
    if side and "clavicle" in name:
        return f"rig_clavicle_{side}"
    if side and "shoulder" in name:
        return f"rig_upper_arm_{side}"
    if side and "elbow" in name:
        return f"rig_forearm_{side}"
    if side and ("forearm_" in name or "sleeve_cuff_" in name or "sleeve_" in name or "sleeve_guard" in name or "coat_cuff" in name):
        return f"rig_forearm_{side}"
    if side and "upper_arm_" in name:
        return f"rig_upper_arm_{side}"
    if side and ("boot_" in name or "boot" in name):
        return f"rig_foot_{side}"
    if side and "knee" in name:
        return f"rig_shin_{side}"
    if side and ("shin_" in name or "trouser_cuff_" in name):
        return f"rig_shin_{side}"
    if side and "thigh_" in name:
        return f"rig_thigh_{side}"
    if any(token in name for token in ("head", "nose", "eye_", "ear_", "brow_", "mouth", "hair_", "hat_", "beard_", "bonnet_", "scarf_", "pencil", "bun", "braid", "mustache", "chin", "cheek")):
        return "rig_head"
    if any(token in name for token in ("neck", "collar")):
        return "rig_neck"
    if any(token in name for token in ("character_torso", "vest_", "coat_body", "apron_bib", "shirt_")):
        return "rig_chest"
    if any(token in name for token in ("ruler_", "chisel_", "herb_", "scale_pin", "watch_chain", "coat_lapel", "vest_lapel", "vest_button", "coat_button")):
        return "rig_chest"
    if any(token in name for token in ("pelvis", "belt", "pouch", "hammer_", "trowel_", "skirt", "coin_", "apron_skirt", "apron_fold", "seed_", "ledger_", "keys", "dock_rope", "spyglass", "holster")):
        return "rig_pelvis"
    return "rig_spine"


def _bind_character_meshes(root, rig: bpy.types.Object, spec: dict | None = None, lod_index: int = 0) -> None:
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and obj.parent is root]
    prefix = _character_prefix(spec) if spec else "char_player"
    height = spec["parameters"].get("height", 1.98) if spec and spec.get("parameters") else 1.98
    hand_markers = {}
    for mesh in meshes:
        bone_name = _rig_bone_for_mesh(mesh.name)
        if mesh.name == f"{prefix}_hand_left":
            hand_markers["left"] = tuple(mesh.location)
        elif mesh.name == f"{prefix}_hand_right":
            hand_markers["right"] = tuple(mesh.location)
        _assign_character_weights(mesh, bone_name, rig=rig, height=height)
        mesh["neva_rig_bone"] = bone_name

    groups = defaultdict(list)
    for mesh in meshes:
        material_key = tuple(material.name for material in mesh.data.materials if material is not None)
        groups[material_key].append(mesh)

    asset_id = spec["id"] if spec else "char_player_a"
    lod_prefix = f"{asset_id}_LOD{lod_index}" if spec and spec.get("lodLevels") else asset_id
    for group_index, objects in enumerate(groups.values()):
        joined_name = f"{lod_prefix}_material_{group_index:02d}"
        if len(objects) == 1:
            joined = objects[0]
            joined.name = joined_name
            joined.data.name = f"{joined_name}_mesh"
        else:
            joined = join_meshes(objects, joined_name)
        if joined is None:
            continue
        # glTF skinned-mesh nodes must remain scene roots unless they sit under
        # identity LOD empties that configureRuntimeLod consumes by node name.
        if spec and spec.get("lodLevels"):
            joined.parent = root
            joined["neva_lod_index"] = lod_index
        else:
            world_matrix = joined.matrix_world.copy()
            joined.parent = None
            joined.matrix_world = world_matrix
        if not any(modifier.type == "ARMATURE" for modifier in joined.modifiers):
            modifier = joined.modifiers.new(name="NEVA_CharacterRig", type="ARMATURE")
            modifier.object = rig
            if spec and spec.get("id") == "char_player_a":
                modifier.use_deform_preserve_volume = True

    if spec and lod_index == 0:
        for side, fallback in (("left", (-WRIST_X_METERS, -0.03, height * 0.355)), ("right", (WRIST_X_METERS, -0.03, height * 0.355))):
            marker_name = f"{prefix}_hand_{side}"
            if bpy.data.objects.get(marker_name) is None:
                add_marker(marker_name, hand_markers.get(side, fallback), root, marker_type="socket")


# Bones that carry rigid gear and must never blend with the body around them.
RIGID_PROP_BONE_PREFIXES = ("rig_backpack", "rig_canteen_", "rig_hat_brim")

# rig_root is a motion handle, not a deformer.
NON_DEFORMING_BONES = ("rig_root",)

# Influence cutoff. The weight falls smoothly to exactly zero here, which is
# what stops neighbouring vertices disagreeing about which bones matter and
# tearing the mesh apart at the boundary.
SKIN_INFLUENCE_RADIUS_METERS = 0.34
SKIN_FALLOFF_EXPONENT = 3.0
SKIN_MAX_INFLUENCES = 4
SKIN_EPSILON_METERS = 0.02
# Past this distance from the midline a vertex may not be driven by a bone on
# the other side of the body. Without it the two boots share weights and shear
# apart the moment one foot moves.
SKIN_MIDLINE_TOLERANCE_METERS = 0.05
# Small hardware -- a buckle, a lace, a lantern -- binds rigidly rather than
# blending across a joint. The size gate matters: dominance alone also captured
# the torso and the vest, the largest parts on the body, which left rig_spine
# driving nothing and killed torso bending outright.
SKIN_RIGID_DOMINANCE = 0.9
SKIN_RIGID_MAX_EXTENT_METERS = 0.26


def _bone_segments(rig) -> list[tuple[str, object, object]]:
    """Head/tail of every deforming bone, in the rig's object space."""
    return [
        (bone.name, bone.head_local.copy(), bone.tail_local.copy())
        for bone in rig.data.bones
        if bone.name not in NON_DEFORMING_BONES
    ]


def _distance_to_segment(point, head, tail) -> float:
    axis = tail - head
    length_squared = axis.length_squared
    if length_squared < 1e-9:
        return (point - head).length
    t = max(0.0, min(1.0, (point - head).dot(axis) / length_squared))
    return (point - (head + axis * t)).length


def _bone_side(name: str) -> str | None:
    if name.endswith("_left"):
        return "left"
    if name.endswith("_right"):
        return "right"
    return None


def _vertex_bone_weights(point, segments) -> list[tuple[str, float]]:
    """Smooth, side-aware influence weights for one vertex."""
    radius = SKIN_INFLUENCE_RADIUS_METERS
    scored = []
    nearest_name = None
    nearest_distance = float("inf")
    for name, head, tail in segments:
        side = _bone_side(name)
        # A vertex clearly on one side of the body is never driven from the other.
        if side == "left" and point.x > SKIN_MIDLINE_TOLERANCE_METERS:
            continue
        if side == "right" and point.x < -SKIN_MIDLINE_TOLERANCE_METERS:
            continue
        distance = _distance_to_segment(point, head, tail)
        if distance < nearest_distance:
            nearest_distance = distance
            nearest_name = name
        if distance >= radius:
            continue
        # Windowed inverse distance: the window term reaches exactly zero at the
        # cutoff, so a bone entering or leaving the influence set contributes
        # nothing at the boundary and the weight field stays continuous.
        window = (radius - distance) / radius
        scored.append((name, (window ** SKIN_FALLOFF_EXPONENT) / (distance + SKIN_EPSILON_METERS)))

    if not scored:
        return [(nearest_name, 1.0)] if nearest_name else []
    scored.sort(key=lambda item: item[1], reverse=True)
    scored = scored[:SKIN_MAX_INFLUENCES]
    total = sum(weight for _, weight in scored)
    if total <= 0.0:
        return [(nearest_name, 1.0)] if nearest_name else []
    return [(name, weight / total) for name, weight in scored]


def _assign_character_weights(mesh, bone_name: str, rig=None, height: float = 1.98) -> None:
    """Weight every vertex by its distance to each bone segment.

    The original implementation matched part names against a table of hardcoded
    world-space Z thresholds and split joint loops 0.50/0.50, which creased at
    every joint and needed hand tuning for each new part. This is geometric and
    generic: it needs no knowledge of what a part is called, so it holds for the
    player and all four NPCs identically.

    `bone_name` (from `_rig_bone_for_mesh`) is still honoured as a hard override
    for the prop bones, whose gear must ride its bone exactly.
    """
    vertices = list(range(len(mesh.data.vertices)))
    if not vertices:
        return

    def bind_rigid(name: str) -> None:
        group = mesh.vertex_groups.get(name) or mesh.vertex_groups.new(name=name)
        group.add(vertices, 1.0, "REPLACE")

    if rig is None or bone_name.startswith(RIGID_PROP_BONE_PREFIXES):
        # A backpack that partly follows the spine shears against its straps.
        bind_rigid(bone_name)
        return

    segments = _bone_segments(rig)
    if not segments:
        bind_rigid(bone_name)
        return

    # Parts are modelled in place in world space and the rig sits at the
    # character root, so the two share a frame.
    to_rig = rig.matrix_world.inverted() @ mesh.matrix_world

    resolved = []
    dominant_counts = {}
    for vertex in mesh.data.vertices:
        weights = _vertex_bone_weights(to_rig @ vertex.co, segments)
        resolved.append((vertex.index, weights))
        if weights:
            top = max(weights, key=lambda item: item[1])[0]
            dominant_counts[top] = dominant_counts.get(top, 0) + 1

    if dominant_counts:
        top_bone, top_count = max(dominant_counts.items(), key=lambda item: item[1])
        corners = [corner[axis] for corner in mesh.bound_box for axis in range(3)]
        extent = (max(corners) - min(corners)) if corners else 0.0
        if (
            top_count >= len(resolved) * SKIN_RIGID_DOMINANCE
            and extent <= SKIN_RIGID_MAX_EXTENT_METERS
        ):
            bind_rigid(top_bone)
            return

    groups = {}

    def group_for(name: str):
        existing = groups.get(name)
        if existing is None:
            existing = mesh.vertex_groups.get(name) or mesh.vertex_groups.new(name=name)
            groups[name] = existing
        return existing

    for vertex_index, weights in resolved:
        if not weights:
            group_for(bone_name).add([vertex_index], 1.0, "REPLACE")
            continue
        for name, weight in weights:
            if weight <= 0.001:
                continue
            group_for(name).add([vertex_index], weight, "REPLACE")


def _add_bone_socket(name, position, rig, bone_name):
    socket = add_marker(name, position, rig.parent, marker_type="socket")
    bpy.context.view_layer.update()
    world_matrix = socket.matrix_world.copy()
    socket.parent = rig
    socket.parent_type = "BONE"
    socket.parent_bone = bone_name
    socket.matrix_world = world_matrix
    socket["neva_socket"] = True
    return socket


REEL_UPPER_BODY_BONES = {
    "rig_spine",
    "rig_chest",
    "rig_neck",
    "rig_head",
    "rig_clavicle_left",
    "rig_upper_arm_left",
    "rig_forearm_left",
    "rig_hand_left",
    "rig_clavicle_right",
    "rig_upper_arm_right",
    "rig_forearm_right",
    "rig_hand_right",
}


def _key_rig_pose(
    rig,
    frame: float,
    rotations: dict,
    locations: dict | None = None,
    keyed_bones: set[str] | None = None,
) -> None:
    # Quaternion throughout. The retargeted clips must avoid XYZ gimbal lock on
    # the arms, and a rig cannot mix rotation modes between actions: whichever
    # mode the pose bone carries at export time is the one the exporter reads.
    for pose_bone in rig.pose.bones:
        pose_bone.rotation_mode = "QUATERNION"
        pose_bone.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
        pose_bone.location = (0.0, 0.0, 0.0)
        pose_bone.scale = (1.0, 1.0, 1.0)
    for bone_name, degrees in rotations.items():
        if bone_name not in rig.pose.bones:
            continue
        # Blender -Y exports as local +Z in glTF. The downward-facing leg
        # chains therefore use the authored X sign directly: positive thigh
        # flexion advances the knee toward runtime +Z and negative shin
        # flexion folds the ankle back. The upward torso and oblique arm bones
        # retain their established inverse-X convention.
        x_degrees = degrees[0] if bone_name.startswith(
            ("rig_thigh_", "rig_shin_", "rig_foot_")
        ) else -degrees[0]
        authored = Euler(
            (
                math.radians(x_degrees),
                math.radians(degrees[1]),
                math.radians(degrees[2]),
            ),
            "XYZ",
        ).to_quaternion()
        # Canonicalise to the positive-w hemisphere so consecutive authored keys
        # always interpolate the short way around.
        if authored.w < 0.0:
            authored.negate()
        rig.pose.bones[bone_name].rotation_quaternion = authored
    for bone_name, location in (locations or {}).items():
        if bone_name not in rig.pose.bones:
            continue
        rig.pose.bones[bone_name].location = location
    for pose_bone in rig.pose.bones:
        if keyed_bones is not None and pose_bone.name not in keyed_bones:
            continue
        pose_bone.keyframe_insert(data_path="rotation_quaternion", frame=frame, group=pose_bone.name)
        pose_bone.keyframe_insert(data_path="location", frame=frame, group=pose_bone.name)



def _resolve_animation_source(spec: dict) -> Path | None:
    """Resolve a catalog-declared authoring source without allowing path escape."""
    relative_path = (spec.get("parameters") or {}).get("animationSource")
    if not relative_path:
        return None
    repository_root = Path(__file__).resolve().parents[3]
    source_path = (repository_root / relative_path).resolve()
    try:
        source_path.relative_to(repository_root)
    except ValueError as error:
        raise RuntimeError(f"{spec['id']}: animationSource escapes the repository: {relative_path}") from error
    if not source_path.is_file():
        raise RuntimeError(f"{spec['id']}: missing animationSource {relative_path}")
    return source_path


def _import_animation_source(source_path: Path):
    """Import a source armature and return only the objects/actions it created."""
    existing_objects = set(bpy.data.objects)
    existing_actions = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=str(source_path))
    imported_objects = [obj for obj in bpy.data.objects if obj not in existing_objects]
    imported_actions = [action for action in bpy.data.actions if action not in existing_actions]
    source_bones = set()
    for source_name, source_parent_name in UAL1_TARGET_TO_SOURCE.values():
        source_bones.add(source_name)
        if source_parent_name is not None:
            source_bones.add(source_parent_name)
    source_armatures = [
        obj
        for obj in imported_objects
        if obj.type == "ARMATURE" and source_bones.issubset({bone.name for bone in obj.data.bones})
    ]
    if len(source_armatures) != 1:
        raise RuntimeError(
            f"animation source {source_path.name}: expected one humanoid armature, found {len(source_armatures)}"
        )
    return source_armatures[0], imported_objects, imported_actions


def _find_source_action(actions, name: str):
    exact = next((action for action in actions if action.name == name), None)
    if exact is not None:
        return exact
    return next((action for action in actions if action.name.rsplit("|", 1)[-1] == name), None)


def _solve_two_bone_chain(hip, knee, ankle, target, pole, thigh_length, shin_length):
    """Analytic two-bone IK. Returns the corrected knee and ankle positions.

    Mirrors src/render/animation/HumanoidFootSupportSolver.ts so the authoring
    bake and the runtime solver agree. Analytic rather than a Blender IK
    constraint plus nla.bake, because `npm run art:determinism` requires a
    byte-identical rebuild and constraint solving is iterative.
    """
    direction = target - hip
    raw_distance = direction.length
    if raw_distance < 1e-5 or thigh_length < 1e-5 or shin_length < 1e-5:
        return knee, ankle
    distance = max(
        abs(thigh_length - shin_length) + 1e-4,
        min(raw_distance, thigh_length + shin_length - 1e-4),
    )
    direction = direction / raw_distance

    bend = pole - direction * pole.dot(direction)
    if bend.length_squared < 1e-8:
        bend = (knee - hip)
        bend = bend - direction * bend.dot(direction)
    if bend.length_squared < 1e-8:
        return knee, ankle
    bend.normalize()

    along = (thigh_length * thigh_length - shin_length * shin_length + distance * distance) / (2.0 * distance)
    bend_distance = math.sqrt(max(0.0, thigh_length * thigh_length - along * along))
    solved_knee = hip + direction * along + bend * bend_distance
    solved_ankle = hip + direction * distance
    return solved_knee, solved_ankle


def _aim_bone(pose_bone, from_direction, to_direction):
    """Rotate a pose bone in armature space so `from` points along `to`."""
    if from_direction.length_squared < 1e-10 or to_direction.length_squared < 1e-10:
        return
    rotation = from_direction.normalized().rotation_difference(to_direction.normalized())
    matrix = pose_bone.matrix.copy()
    translation = matrix.translation.copy()
    pose_bone.matrix = (
        Matrix.Translation(translation)
        @ (rotation @ matrix.to_quaternion()).to_matrix().to_4x4()
    )


def _retarget_ual1_clip(
    rig: bpy.types.Object,
    source_rig: bpy.types.Object,
    source_action,
    source_reference_orientations: dict[str, object],
    source_reference_positions: dict[str, object],
    retarget_scales: dict[str, float],
    clip_name: str,
    clip_spec: dict,
) -> None:
    """Retarget one UAL1 action onto Neva's semantic rig at the Neva duration.

    Three things distinguish this from a naive rotation copy, and all three are
    why the earlier attempt was abandoned as "bent knees and floor warping":

    1. The pelvis carries its source translation, scaled by the hip-height
       ratio. Rotation-only transfer pins the pelvis at rest height while
       differently proportioned legs swing under it, so the feet must either
       sink through the floor or hover.
    2. Each leg is re-solved with IK against the *source foot trajectory scaled
       by the limb-length ratio*, rather than inheriting raw joint angles. Equal
       angles on unequal bones do not put the foot in the same place; equal
       scaled positions do, which is what actually plants the feet.
    3. Nothing is amplitude-damped. The old transfer slerped every bone 40-60%
       of the way back toward the reference pose to hide artifacts 1 and 2, and
       that is what made retargeted motion read as mush.
    """
    existing = bpy.data.actions.get(clip_name)
    if existing is not None:
        bpy.data.actions.remove(existing)

    action = bpy.data.actions.new(name=clip_name)
    action["neva_loop"] = clip_spec.get("loop", False)
    action["neva_retargeted_from"] = f"UAL1:{source_action.name}"
    action["neva_source_frame_rate"] = 30.0
    if "commitMarkerSeconds" in clip_spec:
        action["neva_commit_marker_seconds"] = clip_spec["commitMarkerSeconds"]
    if "referenceSpeedMetersPerSecond" in clip_spec:
        action["neva_reference_speed_meters_per_second"] = clip_spec["referenceSpeedMetersPerSecond"]

    scene = bpy.context.scene
    scene.render.fps = int(FRAME_RATE)
    scene.render.fps_base = 1.0
    original_frame = scene.frame_current
    source_rig.animation_data_create()
    source_rig.animation_data.action = source_action
    rig.animation_data_create()
    # The action stays detached while a frame is being posed. The leg IK needs
    # view_layer updates to read back bone positions, and every such update
    # re-evaluates whatever action is attached at the *source* frame number --
    # stomping the pose mid-solve and corrupting the frames keyed before the
    # curves have filled in. Attach it only to record the keys.
    rig.animation_data.action = None

    target_duration = _frame_aligned_duration(float(clip_spec["durationSeconds"]))
    target_end_frame = _frame_number(target_duration)
    sample_count = max(1, target_end_frame)
    source_start, source_end = source_action.frame_range
    source_duration = max(0.0, source_end - source_start)
    source_data_bones = source_rig.data.bones
    source_pose_bones = source_rig.pose.bones
    target_data_bones = rig.data.bones
    target_pose_bones = rig.pose.bones

    for target_name, (source_name, source_parent_name) in UAL1_TARGET_TO_SOURCE.items():
        if target_name not in target_data_bones:
            raise RuntimeError(f"{rig.name}: retarget target bone missing {target_name}")
        if source_name not in source_data_bones or (
            source_parent_name is not None and source_parent_name not in source_data_bones
        ):
            raise RuntimeError(f"{source_action.name}: retarget source bone missing for {target_name}")

    target_parent_by_name = {
        target_name: target_data_bones[target_name].parent.name
        if target_data_bones[target_name].parent is not None
        else None
        for target_name in UAL1_TARGET_ORDER
    }
    rest_orientation_corrections = {
        target_name: (
            target_data_bones[target_name].matrix_local.to_quaternion()
            @ source_reference_orientations[source_name].inverted()
        )
        for target_name, (source_name, _source_parent_name) in UAL1_TARGET_TO_SOURCE.items()
    }
    target_rest_relative_by_name = {}
    for target_name in UAL1_TARGET_ORDER:
        target_rest = target_data_bones[target_name].matrix_local
        target_parent_name = target_parent_by_name[target_name]
        target_parent_rest = (
            target_data_bones[target_parent_name].matrix_local
            if target_parent_name is not None
            else Matrix.Identity(4)
        )
        target_rest_relative_by_name[target_name] = target_parent_rest.inverted() @ target_rest

    limb_scale = retarget_scales["limb"]
    hip_scale = retarget_scales["hip"]
    stride_gain = float(clip_spec.get("_retargetStrideGain", RETARGET_STRIDE_GAIN.get(clip_name, 1.0)))
    plant_feet = clip_name in RETARGET_FOOT_PLANTED_CLIPS

    ankle_rest_height = target_data_bones["rig_foot_left"].head_local.z
    source_ankle_rest_heights = {
        side: source_rig.data.bones[UAL1_TARGET_TO_SOURCE[f"rig_foot_{side}"][0]].head_local.z
        for side in ("left", "right")
    }

    leg_lengths = {}
    for side in ("left", "right"):
        thigh_rest = target_data_bones[f"rig_thigh_{side}"].matrix_local.translation
        shin_rest = target_data_bones[f"rig_shin_{side}"].matrix_local.translation
        foot_rest = target_data_bones[f"rig_foot_{side}"].matrix_local.translation
        leg_lengths[side] = (
            (shin_rest - thigh_rest).length,
            (foot_rest - shin_rest).length,
        )

    keyed_translation_bones = ("rig_pelvis",)
    # Quaternions, not Euler. Retargeted arm poses pass close enough to XYZ
    # gimbal lock that the Euler decomposition jumps between frames, and the
    # interpolation between two such keys swings the whole arm the long way
    # round. q and -q are the same orientation but interpolate oppositely, so
    # each key is also sign-matched to the one before it.
    previous_quaternion = {}

    # A "_start" clip exists to hand off into its loop, so its final key must be
    # the loop's frame zero exactly. Sampling the source's *end* frame is only
    # mathematically equal -- the two evaluate through different F-curve paths
    # and land in adjacent export quantisation buckets, leaving a real seam.
    ends_on_loop_phase_zero = clip_name.endswith("_start")

    for sample_index in range(sample_count + 1):
        progress = sample_index / sample_count
        target_frame = sample_index
        source_frame = source_start + progress * source_duration
        if ends_on_loop_phase_zero and sample_index == sample_count:
            source_frame = source_start
        source_integer_frame = math.floor(source_frame)
        scene.frame_set(source_integer_frame, subframe=source_frame - source_integer_frame)
        bpy.context.view_layer.update()

        # Everything below is computed in armature space in plain mathutils and
        # only written to the rig at the end. Assigning `pose_bone.matrix` and
        # reading it straight back returns a value recomputed from the *stale*
        # parent evaluation, which silently corrupted whole limbs; keeping our
        # own authoritative matrices also makes the bake deterministic, which
        # `npm run art:determinism` requires.
        target_pose_matrices = {}

        # --- 1. Orientation transfer, undamped, parent-first ---
        for target_name in UAL1_TARGET_ORDER:
            source_name, _source_parent_name = UAL1_TARGET_TO_SOURCE[target_name]
            source_pose_orientation = source_pose_bones[source_name].matrix.to_quaternion()
            target_pose_orientation = (
                rest_orientation_corrections[target_name] @ source_pose_orientation
            ).normalized()
            target_parent_name = target_parent_by_name[target_name]
            target_parent_pose = (
                target_pose_matrices[target_parent_name]
                if target_parent_name is not None and target_parent_name in target_pose_matrices
                else Matrix.Identity(4)
            )
            target_local_orientation = (
                target_parent_pose.to_quaternion().inverted() @ target_pose_orientation
            ).normalized()
            target_relative_pose = Matrix.Translation(
                target_rest_relative_by_name[target_name].to_translation()
            ) @ target_local_orientation.to_matrix().to_4x4()
            target_pose_matrix = target_parent_pose @ target_relative_pose

            # --- 2. Pelvis translation, scaled to Neva's hip height ---
            if target_name == "rig_pelvis":
                source_delta = (
                    source_pose_bones[source_name].matrix.translation
                    - source_reference_positions[source_name]
                )
                target_pose_matrix = Matrix.Translation(source_delta * hip_scale) @ target_pose_matrix

            target_pose_matrices[target_name] = target_pose_matrix

        # --- 3. Leg IK against the scaled source foot trajectory ---
        if plant_feet:
            for side in ("left", "right"):
                thigh_name = f"rig_thigh_{side}"
                shin_name = f"rig_shin_{side}"
                foot_name = f"rig_foot_{side}"
                toe_name = f"rig_toe_{side}"

                source_hip = source_pose_bones[UAL1_TARGET_TO_SOURCE[thigh_name][0]].matrix.translation
                source_ankle = source_pose_bones[UAL1_TARGET_TO_SOURCE[foot_name][0]].matrix.translation
                offset = (source_ankle - source_hip) * limb_scale
                # Stride gain widens the step without lengthening the drop, so a
                # shorter leg can still cover the travel the gait speed needs.
                offset.x *= stride_gain
                offset.y *= stride_gain

                hip_position = target_pose_matrices[thigh_name].to_translation()
                knee_position = target_pose_matrices[shin_name].to_translation()
                ankle_position = target_pose_matrices[foot_name].to_translation()
                thigh_length, shin_length = leg_lengths[side]

                target_ankle = hip_position + offset
                # Height is measured from the floor, not from the hip. Deriving
                # it from the hip compounds the pelvis offset with the limb
                # scale and leaves the whole gait hovering; anchoring it to the
                # ground plane makes a planted source foot land planted here.
                target_ankle.z = (
                    ankle_rest_height
                    + (source_ankle.z - source_ankle_rest_heights[side]) * limb_scale
                )
                reach = (target_ankle - hip_position).length
                limit = (thigh_length + shin_length) * 0.985
                if reach > limit:
                    target_ankle = hip_position + (target_ankle - hip_position) * (limit / reach)

                # Knees resolve forward. Blender -Y is the character's facing.
                pole = Vector((0.0, -1.0, 0.0))
                solved_knee, solved_ankle = _solve_two_bone_chain(
                    hip_position, knee_position, ankle_position, target_ankle, pole,
                    thigh_length, shin_length,
                )

                thigh_matrix = target_pose_matrices[thigh_name]
                thigh_delta = (knee_position - hip_position).normalized().rotation_difference(
                    (solved_knee - hip_position).normalized()
                )
                target_pose_matrices[thigh_name] = (
                    Matrix.Translation(hip_position)
                    @ (thigh_delta @ thigh_matrix.to_quaternion()).to_matrix().to_4x4()
                )

                # The shin rides the thigh, so its pre-IK direction has already
                # been turned by thigh_delta before we aim it at the ankle.
                carried_ankle = hip_position + thigh_delta @ (ankle_position - hip_position)
                shin_matrix = target_pose_matrices[shin_name]
                shin_delta = (carried_ankle - solved_knee).normalized().rotation_difference(
                    (solved_ankle - solved_knee).normalized()
                )
                target_pose_matrices[shin_name] = (
                    Matrix.Translation(solved_knee)
                    @ ((shin_delta @ thigh_delta) @ shin_matrix.to_quaternion()).to_matrix().to_4x4()
                )

                # The IK moved thigh and shin, so re-establish the foot's world
                # orientation from the source or the sole tips off the ground.
                foot_orientation = (
                    rest_orientation_corrections[foot_name]
                    @ source_pose_bones[UAL1_TARGET_TO_SOURCE[foot_name][0]].matrix.to_quaternion()
                ).normalized()
                target_pose_matrices[foot_name] = (
                    Matrix.Translation(solved_ankle) @ foot_orientation.to_matrix().to_4x4()
                )

                if toe_name in target_pose_matrices:
                    toe_orientation = (
                        rest_orientation_corrections[toe_name]
                        @ source_pose_bones[UAL1_TARGET_TO_SOURCE[toe_name][0]].matrix.to_quaternion()
                    ).normalized()
                    ball_offset = foot_orientation @ (
                        target_rest_relative_by_name[toe_name].to_translation()
                    )
                    target_pose_matrices[toe_name] = (
                        Matrix.Translation(solved_ankle + ball_offset)
                        @ toe_orientation.to_matrix().to_4x4()
                    )

        # --- 3b. Floor guard ---
        # The source skeleton is taller, so even a correctly scaled pelvis can
        # drop a foot below Neva's ground plane on clips that are not foot
        # planted (a jump crouch is the usual offender). Lift the whole body by
        # the deficit rather than bending the legs: the pose stays the source's,
        # it just stops sinking. rig_root is excluded because it is the pelvis's
        # parent and must not move with it.
        lowest_ankle = min(
            target_pose_matrices[f"rig_foot_{side}"].to_translation().z
            for side in ("left", "right")
        )
        deficit = ankle_rest_height - lowest_ankle
        if deficit > 1e-5:
            lift = Matrix.Translation(Vector((0.0, 0.0, deficit)))
            for name in target_pose_matrices:
                if name == "rig_root":
                    continue
                target_pose_matrices[name] = lift @ target_pose_matrices[name]

        # --- 4. Write the frame ---
        rig.animation_data.action = action
        for target_name in UAL1_TARGET_ORDER:
            target_parent_name = target_parent_by_name[target_name]
            target_parent_pose = (
                target_pose_matrices[target_parent_name]
                if target_parent_name is not None and target_parent_name in target_pose_matrices
                else Matrix.Identity(4)
            )
            # matrix_basis is parent-relative and rest-relative, so it can be
            # written without the depsgraph having evaluated anything.
            basis = (
                target_parent_pose @ target_rest_relative_by_name[target_name]
            ).inverted() @ target_pose_matrices[target_name]

            pose_bone = target_pose_bones[target_name]
            pose_bone.rotation_mode = "QUATERNION"
            pose_bone.matrix_basis = basis
            previous = previous_quaternion.get(target_name)
            if previous is not None and pose_bone.rotation_quaternion.dot(previous) < 0.0:
                pose_bone.rotation_quaternion.negate()
            previous_quaternion[target_name] = pose_bone.rotation_quaternion.copy()
            pose_bone.keyframe_insert(data_path="rotation_quaternion", frame=target_frame, group=target_name)
            if target_name in keyed_translation_bones:
                pose_bone.keyframe_insert(data_path="location", frame=target_frame, group=target_name)
        rig.animation_data.action = None

    action.use_fake_user = True
    rig.animation_data.action = None
    source_rig.animation_data.action = None
    scene.frame_set(original_frame)


def _retarget_catalog_animation_clips(spec: dict, rig: bpy.types.Object) -> list[str]:
    """Replace selected generic Neva clips with catalog-declared UAL1 motion."""
    clip_map = NPC_UAL1_CLIP_MAP if spec.get("generator") == "npc_character" else UAL1_CLIP_MAP
    if not clip_map:
        return []
    source_path = _resolve_animation_source(spec)
    if source_path is None:
        return []
    clip_specs = {clip["name"]: clip for clip in _animation_clips(spec)}
    source_rig = None
    imported_objects = []
    imported_actions = []
    used_clips = []
    try:
        source_rig, imported_objects, imported_actions = _import_animation_source(source_path)
        reference_action = _find_source_action(imported_actions, "Idle_Loop")
        if reference_action is None:
            raise RuntimeError(f"{spec['id']}: animation source is missing Idle_Loop calibration")
        scene = bpy.context.scene
        original_frame = scene.frame_current
        source_rig.animation_data_create()
        source_rig.animation_data.action = reference_action
        reference_frame = float(reference_action.frame_range[0])
        reference_integer_frame = math.floor(reference_frame)
        scene.frame_set(reference_integer_frame, subframe=reference_frame - reference_integer_frame)
        bpy.context.view_layer.update()
        source_reference_orientations = {
            source_name: source_rig.pose.bones[source_name].matrix.to_quaternion().copy()
            for source_name, _source_parent_name in UAL1_TARGET_TO_SOURCE.values()
        }
        source_reference_positions = {
            source_name: source_rig.pose.bones[source_name].matrix.translation.copy()
            for source_name, _source_parent_name in UAL1_TARGET_TO_SOURCE.values()
        }
        source_rig.animation_data.action = None
        scene.frame_set(original_frame)

        # Proportion ratios drive both the pelvis translation and the foot
        # trajectory. Measured from the two rigs rather than hardcoded, so the
        # retarget stays correct if either skeleton is re-proportioned.
        source_bones = source_rig.data.bones
        source_leg = (
            (source_bones["calf_l"].head_local - source_bones["thigh_l"].head_local).length
            + (source_bones["foot_l"].head_local - source_bones["calf_l"].head_local).length
        )
        target_bones = rig.data.bones
        target_leg = (
            (target_bones["rig_shin_left"].head_local - target_bones["rig_thigh_left"].head_local).length
            + (target_bones["rig_foot_left"].head_local - target_bones["rig_shin_left"].head_local).length
        )
        source_hip_height = source_bones["thigh_l"].head_local.z
        target_hip_height = target_bones["rig_thigh_left"].head_local.z
        retarget_scales = {
            "limb": target_leg / source_leg if source_leg > 1e-6 else 1.0,
            "hip": target_hip_height / source_hip_height if source_hip_height > 1e-6 else 1.0,
        }
        print(
            f"[NEVA RETARGET] {spec['id']}: limb scale {retarget_scales['limb']:.4f}, "
            f"hip scale {retarget_scales['hip']:.4f} "
            f"(source leg {source_leg:.3f} -> target leg {target_leg:.3f})"
        )
        for target_clip, source_clip in clip_map.items():
            clip_spec = clip_specs.get(target_clip)
            source_action = _find_source_action(imported_actions, source_clip)
            if clip_spec is None or source_action is None:
                continue
            _retarget_ual1_clip(
                rig,
                source_rig,
                source_action,
                source_reference_orientations,
                source_reference_positions,
                retarget_scales,
                target_clip,
                clip_spec,
            )
            used_clips.append(target_clip)
    finally:
        if source_rig is not None and source_rig.animation_data is not None:
            source_rig.animation_data.action = None
        for obj in imported_objects:
            if obj.name in bpy.data.objects:
                bpy.data.objects.remove(obj, do_unlink=True)
        for action in imported_actions:
            if action.name in bpy.data.actions:
                bpy.data.actions.remove(action)
    return used_clips


def _locomotion_cycle(
    duration,
    *,
    stride,
    knee_tuck,
    arm_swing,
    spine_pitch,
    root_low,
    root_high,
    pelvis_drop,
    sub_poses=4,
    running=False,
    extra=None,
):
    """Build a four-pose walk/run cycle: contact, down, pass, up, per step.

    The old two-pose cycles (contact/pass only) had no weight in them. A readable
    gait needs the *down* pose where the stance knee absorbs the landing and the
    body reaches its lowest point, and the *up* pose where it pushes off and rides
    highest. Eight keys per cycle. Normalized key times are snapped to the 30 fps
    frame grid so the phase can be authored at any frame-aligned duration without
    letting Blender resample fractional frames.

    Phase tables are fractions of the caller's amplitudes, so walk and run share one
    shape and differ only in how far they push it. Arm extremes deliberately lag the
    leg extremes by one key: that offset is what reads as follow-through.

    The stance leg's toe-off is still captured, because at the following contact
    that leg becomes the swing leg at full push-off.
    """
    # Four biomechanical beats per step. Walking keeps a planted support leg;
    # running replaces the walk's passing beat with recovery/flight and folds
    # the trailing knee toward the body before reaching for the next contact.
    if running:
        # Contact -> compression -> flight/recovery -> reach. Both knees stay
        # unlocked at contact, and the trailing leg folds before it reaches.
        # That is the distinction the old fast-walk-shaped run was missing.
        stance_thigh = (0.62, 0.38, -0.22, -0.60)
        stance_shin = (0.20, 0.48, 0.78, 0.88)
        stance_foot = (-0.32, -0.06, 0.38, 0.55)
        swing_thigh = (-0.60, -0.38, 0.12, 0.62)
        swing_shin = (0.88, 1.05, 0.88, 0.42)
        swing_foot = (0.58, 0.38, 0.08, -0.32)
        arm_phase = (-0.92, -0.68, 0.24, 0.84)
        elbow_base = 56.0
        elbow_follow = 8.0
        # Pelvis/spine bones point up while limbs point down. _key_rig_pose's
        # authored limb convention negates local X, so a forward torso pitch
        # must be authored negative or it visibly leans against travel.
        pelvis_pitch = -4.5
        root_phase = (0.0, root_low, root_high, root_high * 0.42)
    else:
        # Heel contact -> knee absorption -> passing -> toe push. Never drive
        # the stance knee through zero: the former negative values created the
        # locked, backward-kneed mannequin silhouette visible in the recording.
        stance_thigh = (0.72, 0.42, -0.08, -0.52)
        stance_shin = (0.10, 0.42, 0.26, 0.12)
        stance_foot = (-0.48, -0.08, 0.18, 0.72)
        swing_thigh = (-0.58, -0.42, 0.10, 0.66)
        swing_shin = (0.42, 0.82, 1.08, 0.52)
        swing_foot = (0.64, 0.42, 0.04, -0.48)
        arm_phase = (-0.76, -0.56, 0.10, 0.68)
        elbow_base = 18.0
        elbow_follow = 6.0
        pelvis_pitch = 0.0
        root_phase = (0.0, root_low, 0.0, root_high)
    pelvis_phase = (0.18, 1.00, 0.46, 0.14)
    spine_phase = (0.82, 0.72, 0.62, 0.74)

    total = sub_poses * 2
    keys = []
    for index in range(total + 1):
        phase = index % total
        half = phase // sub_poses  # 0 = left stance, 1 = right stance
        step = phase % sub_poses   # contact, down, pass, (up)
        sign = 1.0 if half == 0 else -1.0
        stance, swing = ("left", "right") if half == 0 else ("right", "left")

        rotations = {
            f"rig_thigh_{stance}": (stride * stance_thigh[step], 0, 0),
            f"rig_shin_{stance}": (knee_tuck * stance_shin[step], 0, 0),
            f"rig_foot_{stance}": (knee_tuck * stance_foot[step] * 0.52, 0, 0),
            f"rig_thigh_{swing}": (stride * swing_thigh[step], 0, 0),
            f"rig_shin_{swing}": (knee_tuck * swing_shin[step], 0, 0),
            f"rig_foot_{swing}": (knee_tuck * swing_foot[step] * 0.52, 0, 0),
            # the pelvis drops on the unsupported side; this is the weight cue
            "rig_pelvis": (pelvis_pitch, sign * 2.8 * pelvis_phase[step], sign * pelvis_drop * pelvis_phase[step]),
            "rig_spine": (spine_pitch * spine_phase[step], 0, 0),
            "rig_chest": (spine_pitch * spine_phase[step] * 0.62, -sign * 2.2 * pelvis_phase[step], -sign * pelvis_drop * 0.22),
            "rig_neck": (-spine_pitch * spine_phase[step] * 0.24, 0, sign * pelvis_drop * 0.12),
            "rig_head": (-spine_pitch * spine_phase[step] * 0.18, sign * 0.5 * pelvis_phase[step], sign * pelvis_drop * 0.08),
            f"rig_upper_arm_{stance}": (arm_swing * arm_phase[step], 0, 0),
            f"rig_upper_arm_{swing}": (-arm_swing * arm_phase[step], 0, 0),
            f"rig_forearm_{stance}": (-elbow_base - max(0.0, -arm_phase[step]) * elbow_follow, 0, sign * 1.2),
            f"rig_forearm_{swing}": (-elbow_base - max(0.0, arm_phase[step]) * elbow_follow, 0, -sign * 1.2),
            f"rig_clavicle_{stance}": (0, 0, sign * 0.8),
            f"rig_clavicle_{swing}": (0, 0, -sign * 0.8),
            # Loaded accessories are part of the silhouette. Give them a small
            # delayed counter-roll so the backpack and canteens have inertia
            # without becoming a second, decorative bob system at runtime.
            "rig_backpack": (-spine_pitch * 0.12, 0, -sign * pelvis_drop * 0.16),
            "rig_canteen_left": (-arm_phase[step] * (1.8 if running else 1.0), 0, sign * 0.7),
            "rig_canteen_right": (arm_phase[step] * (1.6 if running else 0.9), 0, -sign * 0.7),
            "rig_hat_brim": (0, 0, -sign * pelvis_drop * 0.06),
        }
        if extra:
            rotations.update(extra)
        keys.append((
            _frame_time_for_fraction(duration, index / total),
            rotations,
            {"rig_root": (0, round(root_phase[step], 4), 0)},
        ))
    return keys


def _breathing_cycle(
    duration,
    base,
    *,
    locations=None,
    pitch=1.8,
    sway=1.0,
    lift=0.005,
    sub_keys=4,
):
    """Overlay a breath and a slow weight shift on an otherwise held pose.

    Several idles were authored as two identical keys, which exports as a
    frozen statue -- the single most visible defect in the shipped character,
    since standing still is what the player sees most. The overlay is additive
    on top of the authored pose, so the pose's meaning (hands on reins, rod
    braced) is untouched; only the stillness is.

    The weight shift trails the breath by a third of a cycle so the two never
    peak together, which is what keeps it from reading as a mechanical pulse.
    """
    base_locations = dict(locations or {})
    keys = []
    for index in range(sub_keys + 1):
        phase = index / sub_keys
        breath = math.sin(phase * 2.0 * math.pi)
        shift = math.sin(phase * 2.0 * math.pi - math.pi / 3.0)

        overlay = dict(base)

        def add(bone_name, delta):
            current = overlay.get(bone_name, (0.0, 0.0, 0.0))
            overlay[bone_name] = (
                current[0] + delta[0],
                current[1] + delta[1],
                current[2] + delta[2],
            )

        add("rig_spine", (-pitch * breath, 0.0, sway * 0.35 * shift))
        add("rig_spine_02", (-pitch * 0.70 * breath, 0.0, sway * 0.30 * shift))
        add("rig_chest", (-pitch * 0.55 * breath, 0.0, sway * 0.50 * shift))
        add("rig_neck", (pitch * 0.35 * breath, 0.0, -sway * 0.30 * shift))
        add("rig_head", (pitch * 0.50 * breath, sway * 0.25 * shift, -sway * 0.40 * shift))
        add("rig_pelvis", (0.0, sway * 0.30 * shift, sway * 0.45 * shift))

        clip_locations = dict(base_locations)
        root = clip_locations.get("rig_root", (0.0, 0.0, 0.0))
        clip_locations["rig_root"] = (root[0], root[1] + lift * breath, root[2])
        keys.append((_frame_time_for_fraction(duration, phase), overlay, clip_locations))
    return keys


def _mirror_character_keyframes(keyframes):
    """Mirror a one-sided action across the character sagittal plane."""
    mirrored = []
    for seconds, rotations, locations in keyframes:
        mirrored_rotations = {}
        for bone_name, (x_degrees, y_degrees, z_degrees) in rotations.items():
            if bone_name.endswith("_left"):
                target_name = f"{bone_name[:-5]}right"
            elif bone_name.endswith("_right"):
                target_name = f"{bone_name[:-6]}left"
            else:
                target_name = bone_name
            mirrored_rotations[target_name] = (x_degrees, -y_degrees, -z_degrees)
        mirrored_locations = {
            bone_name: (-location[0], location[1], location[2])
            for bone_name, location in locations.items()
        }
        mirrored.append((seconds, mirrored_rotations, mirrored_locations))
    return mirrored


def _author_character_actions(spec: dict, rig: bpy.types.Object) -> None:
    clip_specs = {clip["name"]: clip for clip in _animation_clips(spec)}
    idle_duration = float(clip_specs.get("idle", {}).get("durationSeconds", 1.6))
    mounted_idle_duration = float(clip_specs.get("mounted_idle", {}).get("durationSeconds", 1.6))
    carry_idle_duration = float(clip_specs.get("carry_idle", {}).get("durationSeconds", 1.6))
    fishing_idle_duration = float(clip_specs.get("fishing_idle", {}).get("durationSeconds", 1.6))
    walk_duration = float(clip_specs.get("walk", {}).get("durationSeconds", 1.0))
    run_duration = float(clip_specs.get("run", {}).get("durationSeconds", 0.733333))
    talk_duration = float(clip_specs.get("talk_gesture", {}).get("durationSeconds", 2.933333))
    is_player = spec.get("id") == "char_player_a"
    mounted_walk_duration = float(clip_specs.get("mounted_walk", {}).get("durationSeconds", 0.44))
    mounted_trot_duration = float(clip_specs.get("mounted_trot", {}).get("durationSeconds", 0.24))
    mounted_gallop_duration = float(clip_specs.get("mounted_gallop", {}).get("durationSeconds", 0.30))
    arms_forward = {
        "rig_clavicle_left": (-4, 0, -3),
        "rig_upper_arm_left": (-52, 0, -6),
        "rig_forearm_left": (-46, 0, 4),
        "rig_clavicle_right": (-4, 0, 3),
        "rig_upper_arm_right": (-52, 0, 6),
        "rig_forearm_right": (-46, 0, -4),
    }
    # Carry Idle uses a small shoulder raise and a deeper elbow fold
    # so the palms meet in front of the navel/belly.
    arms_carry = {
        "rig_clavicle_left": (-2, 0, -4),
        "rig_upper_arm_left": (-22, 0, -12),
        "rig_forearm_left": (-80, 0, 10),
        "rig_hand_left": (10, 0, 10),
        "rig_clavicle_right": (-2, 0, 4),
        "rig_upper_arm_right": (-22, 0, 12),
        "rig_forearm_right": (-80, 0, -10),
        "rig_hand_right": (10, 0, -10),
    }
    # Mitten hands have no finger bones. A small hand-bone cup is the grip
    # when a tool is in tool_socket; idle without a tool stays open.
    hand_grip_right = {"rig_hand_right": (22, 6, 14)}
    arms_tool_hold = {
        "rig_clavicle_right": (-3, 0, 3),
        "rig_upper_arm_right": (-26, 0, 8),
        "rig_forearm_right": (-24, 0, -5),
        **hand_grip_right,
    }
    seated_lower = {
        "rig_thigh_left": (74, 0, -3),
        "rig_thigh_right": (74, 0, 3),
        "rig_shin_left": (-82, 0, 0),
        "rig_shin_right": (-82, 0, 0),
        "rig_foot_left": (12, 0, 0),
        "rig_foot_right": (12, 0, 0),
    }
    # The knees advance in front of the hips and open around the barrel; the
    # lower legs then fold back and down to the stirrups. This gives the solver
    # a forward pole instead of a chair squat or a backward knee.
    mounted_lower = {
        "rig_thigh_left": (46, 0, -20),
        "rig_thigh_right": (46, 0, 20),
        "rig_shin_left": (-66, 0, 6),
        "rig_shin_right": (-66, 0, -6),
        "rig_foot_left": (-8, 0, 4),
        "rig_foot_right": (-8, 0, -4),
    }
    # Fixed-seat rowing keeps the pelvis on the bench, advances both knees in
    # front of the hips, and sends the ankles forward to the foot stretcher.
    rowing_lower = {
        "rig_thigh_left": (62, 0, -8),
        "rig_thigh_right": (62, 0, 8),
        "rig_shin_left": (-34, 0, 3),
        "rig_shin_right": (-34, 0, -3),
        "rig_foot_left": (-10, 0, 3),
        "rig_foot_right": (-10, 0, -3),
    }
    standing_helm_lower = {
        "rig_pelvis": (-2, 0, 0),
        "rig_thigh_left": (9, 0, -9),
        "rig_thigh_right": (6, 0, 9),
        "rig_shin_left": (-14, 0, 3),
        "rig_shin_right": (-11, 0, -3),
        "rig_foot_left": (5, 0, 3),
        "rig_foot_right": (3, 0, -3),
    }
    resting_oar_hold = {
        **rowing_lower,
        "rig_spine": (-3, 0, 0),
        "rig_chest": (-3, 0, 0),
        "rig_clavicle_left": (-4, 0, -4),
        "rig_upper_arm_left": (-48, 0, -14),
        "rig_forearm_left": (-62, 0, 8),
        "rig_hand_left": (-8, 0, 4),
        "rig_clavicle_right": (-4, 0, 4),
        "rig_upper_arm_right": (-48, 0, 14),
        "rig_forearm_right": (-62, 0, -8),
        "rig_hand_right": (-8, 0, -4),
    }
    mounted_reins = {
        **mounted_lower,
        "rig_spine": (-2, 0, 0),
        "rig_chest": (-2, 0, 0),
        "rig_neck": (1, 0, 0),
        "rig_head": (2, 0, 0),
        # Reins are held close to the midline, above the withers. The previous
        # pose splayed both upper arms 13 degrees outward and kept the forearms
        # low, which dropped the hands level with the barrel and buried them in
        # the animal. Elbows tuck in, forearms lift, hands meet over the neck.
        "rig_clavicle_left": (-2, 0, -2),
        "rig_upper_arm_left": (-34, 0, -7),
        "rig_forearm_left": (-62, 0, 14),
        "rig_hand_left": (14, 0, 8),
        "rig_clavicle_right": (-2, 0, 2),
        "rig_upper_arm_right": (-34, 0, 7),
        "rig_forearm_right": (-62, 0, -14),
        "rig_hand_right": (14, 0, -8),
    }
    walk_cycle = _locomotion_cycle(
        walk_duration,
        stride=30 if is_player else 28,
        knee_tuck=32,
        arm_swing=16 if is_player else 13,
        spine_pitch=-1.8 if is_player else -1.2,
        root_low=-0.014 if is_player else -0.012,
        root_high=0.016 if is_player else 0.014,
        pelvis_drop=2.2 if is_player else 2.0,
    )
    run_cycle = _locomotion_cycle(
        run_duration,
        stride=46,
        knee_tuck=58,
        arm_swing=29,
        spine_pitch=-5.0,
        root_low=-0.022,
        root_high=0.048,
        pelvis_drop=3.0,
        running=True,
    )
    walk_start_duration = float(clip_specs.get("walk_start", {}).get("durationSeconds", 0.233333))
    run_start_duration = float(clip_specs.get("run_start", {}).get("durationSeconds", 0.233333))
    poses = {
        # Idle is a load-bearing neutral pose, not a procedural breathing rig.
        # Look/talk clips own visible fidgets; neutral feet, pelvis and root stay
        # exactly at rest so terrain presentation cannot amplify tiny motion.
        "idle": [(0.0, {}, {}), (idle_duration, {}, {})],
        "walk": walk_cycle,
        "walk_start": [
            (0.0, {}, {}),
            (_frame_time_for_fraction(walk_start_duration, 0.50), {"rig_pelvis": (-2, 2, 1), "rig_spine": (-2, 0, 0), "rig_chest": (-2, -2, -1), "rig_thigh_left": (12, 0, 0), "rig_shin_left": (12, 0, 0), "rig_thigh_right": (-8, 0, 0), "rig_shin_right": (18, 0, 0)}, {"rig_root": (0, -0.018, 0)}),
            (walk_start_duration, dict(walk_cycle[0][1]), dict(walk_cycle[0][2])),
        ],
        "run_start": [
            (0.0, {}, {}),
            (_frame_time_for_fraction(run_start_duration, 0.50), {"rig_pelvis": (-4, 3, 2), "rig_spine": (-5, 0, 0), "rig_chest": (-5, -3, -2), "rig_thigh_left": (20, 0, 0), "rig_shin_left": (20, 0, 0), "rig_thigh_right": (-14, 0, 0), "rig_shin_right": (30, 0, 0)}, {"rig_root": (0, -0.028, 0)}),
            (run_start_duration, dict(run_cycle[0][1]), dict(run_cycle[0][2])),
        ],
        "run": run_cycle,
        "stop": [
            (0.0, {"rig_spine": (-4, 0, 0), "rig_chest": (-4, 0, 0), "rig_upper_arm_left": (-15, 0, 0), "rig_forearm_left": (-9, 0, 0), "rig_upper_arm_right": (15, 0, 0), "rig_forearm_right": (-16, 0, 0), "rig_thigh_left": (32, 0, 0), "rig_thigh_right": (-24, 0, 0), "rig_foot_left": (-14, 0, 0), "rig_foot_right": (22, 0, 0)}, {}),
            (0.16, {"rig_spine": (-3, 0, 0), "rig_chest": (-4, 0, 0), "rig_upper_arm_left": (6, 0, 0), "rig_upper_arm_right": (-6, 0, 0), "rig_thigh_left": (10, 0, 0), "rig_thigh_right": (14, 0, 0), "rig_shin_left": (-14, 0, 0), "rig_shin_right": (-12, 0, 0), "rig_foot_left": (-6, 0, 0), "rig_foot_right": (-4, 0, 0)}, {"rig_root": (0, -0.016, 0)}),
            (0.32, {}, {}),
        ],
        "turn_left": [
            (0.0, {}, {}),
            (0.2, {"rig_pelvis": (0, -10, -4), "rig_spine": (0, -10, -4), "rig_chest": (0, -12, -5), "rig_neck": (0, 6, 2), "rig_head": (0, 10, 3), "rig_thigh_left": (13, 0, 0), "rig_thigh_right": (-8, 0, 0)}, {"rig_root": (0, -0.012, 0)}),
            (0.4, {}, {}),
        ],
        "turn_right": [
            (0.0, {}, {}),
            (0.2, {"rig_pelvis": (0, 10, 4), "rig_spine": (0, 10, 4), "rig_chest": (0, 12, 5), "rig_neck": (0, -6, -2), "rig_head": (0, -10, -3), "rig_thigh_left": (-8, 0, 0), "rig_thigh_right": (13, 0, 0)}, {"rig_root": (0, -0.012, 0)}),
            (0.4, {}, {}),
        ],
        "jump_start": [
            (0.0, {"rig_spine": (-2, 0, 0), "rig_chest": (-3, 0, 0), "rig_thigh_left": (12, 0, 0), "rig_thigh_right": (12, 0, 0), "rig_shin_left": (-18, 0, 0), "rig_shin_right": (-18, 0, 0)}, {"rig_root": (0, -0.035, 0)}),
            (0.10, {"rig_spine": (4, 0, 0), "rig_chest": (5, 0, 0), "rig_upper_arm_left": (22, 0, -4), "rig_upper_arm_right": (22, 0, 4), "rig_thigh_left": (-12, 0, 0), "rig_thigh_right": (-8, 0, 0)}, {"rig_root": (0, 0.018, 0)}),
            (0.28, {"rig_spine": (3, 0, 0), "rig_chest": (3, 0, 0), "rig_upper_arm_left": (28, 0, -5), "rig_upper_arm_right": (28, 0, 5), "rig_thigh_left": (-22, 0, 0), "rig_thigh_right": (-14, 0, 0), "rig_shin_left": (18, 0, 0), "rig_shin_right": (12, 0, 0)}, {"rig_root": (0, 0.025, 0)}),
        ],
        "fall": [
            (0.0, {"rig_spine": (-2, 0, 0), "rig_chest": (-2, 0, 0), "rig_upper_arm_left": (-8, 0, -18), "rig_upper_arm_right": (-8, 0, 18), "rig_forearm_left": (-18, 0, 8), "rig_forearm_right": (-18, 0, -8), "rig_thigh_left": (-14, 0, 0), "rig_thigh_right": (-8, 0, 0), "rig_shin_left": (20, 0, 0), "rig_shin_right": (14, 0, 0)}, {}),
            (0.30, {"rig_spine": (-3, 0, 0), "rig_chest": (-3, 0, 0), "rig_neck": (2, 0, 0), "rig_head": (3, 0, 0), "rig_upper_arm_left": (-12, 0, -20), "rig_upper_arm_right": (-12, 0, 20), "rig_thigh_left": (-10, 0, 0), "rig_thigh_right": (-14, 0, 0), "rig_shin_left": (16, 0, 0), "rig_shin_right": (20, 0, 0)}, {"rig_root": (0, -0.008, 0)}),
            (0.60, {"rig_spine": (-2, 0, 0), "rig_chest": (-2, 0, 0), "rig_upper_arm_left": (-8, 0, -18), "rig_upper_arm_right": (-8, 0, 18), "rig_forearm_left": (-18, 0, 8), "rig_forearm_right": (-18, 0, -8), "rig_thigh_left": (-14, 0, 0), "rig_thigh_right": (-8, 0, 0), "rig_shin_left": (20, 0, 0), "rig_shin_right": (14, 0, 0)}, {}),
        ],
        "land_soft": [
            (0.0, {"rig_spine": (-5, 0, 0), "rig_chest": (-6, 0, 0), "rig_neck": (2, 0, 0), "rig_upper_arm_left": (10, 0, -6), "rig_upper_arm_right": (10, 0, 6), "rig_thigh_left": (18, 0, 0), "rig_thigh_right": (18, 0, 0), "rig_shin_left": (-28, 0, 0), "rig_shin_right": (-28, 0, 0)}, {"rig_root": (0, -0.055, 0)}),
            (0.12, {"rig_spine": (-3, 0, 0), "rig_chest": (-4, 0, 0), "rig_thigh_left": (12, 0, 0), "rig_thigh_right": (12, 0, 0), "rig_shin_left": (-18, 0, 0), "rig_shin_right": (-18, 0, 0)}, {"rig_root": (0, -0.025, 0)}),
            (0.32, {}, {}),
        ],
        "land_hard": [
            (0.0, {"rig_spine": (-12, 0, 0), "rig_chest": (-14, 0, 0), "rig_neck": (5, 0, 0), "rig_head": (8, 0, 0), "rig_clavicle_left": (-4, 0, -4), "rig_clavicle_right": (-4, 0, 4), "rig_upper_arm_left": (-28, 0, -10), "rig_upper_arm_right": (-28, 0, 10), "rig_forearm_left": (-24, 0, 6), "rig_forearm_right": (-24, 0, -6), "rig_thigh_left": (34, 0, 0), "rig_thigh_right": (34, 0, 0), "rig_shin_left": (-48, 0, 0), "rig_shin_right": (-48, 0, 0)}, {"rig_root": (0, -0.11, 0)}),
            (0.16, {"rig_spine": (-7, 0, 0), "rig_chest": (-8, 0, 0), "rig_neck": (3, 0, 0), "rig_head": (5, 0, 0), "rig_upper_arm_left": (-16, 0, -6), "rig_upper_arm_right": (-16, 0, 6), "rig_thigh_left": (22, 0, 0), "rig_thigh_right": (22, 0, 0), "rig_shin_left": (-32, 0, 0), "rig_shin_right": (-32, 0, 0)}, {"rig_root": (0, -0.065, 0)}),
            (0.48, {}, {}),
        ],
        "talk_gesture": [
            (0.0, {}, {}),
            (0.466667, {"rig_pelvis": (0, -1, -0.6), "rig_spine": (-1.5, 0, 1), "rig_chest": (-2, 0, 2), "rig_neck": (1, 0, 1.5), "rig_head": (2, 0, 2.5), "rig_clavicle_right": (-2, 0, 4), "rig_upper_arm_right": (-24, 0, 14), "rig_forearm_right": (-48, 0, -10), "rig_hand_right": (8, 0, 12)}, {"rig_root": (0, 0.004, 0)}),
            (1.0, {"rig_pelvis": (0, -2, -1), "rig_spine": (-2, 0, 1.5), "rig_chest": (-3, 0, 3), "rig_neck": (1, 0, 2), "rig_head": (3, 0, 4), "rig_clavicle_right": (-4, 0, 6), "rig_upper_arm_right": (-38, 0, 20), "rig_forearm_right": (-58, 0, -14), "rig_hand_right": (12, 0, 16), "rig_upper_arm_left": (-8, 0, -4), "rig_forearm_left": (-18, 0, 3)}, {"rig_root": (0, 0.007, 0)}),
            (1.533333, {"rig_spine": (-1, 0, -1), "rig_chest": (-1, 0, -2), "rig_neck": (0, 0, -1), "rig_head": (-1, 0, -2), "rig_clavicle_right": (-2, 0, 3), "rig_upper_arm_right": (-26, 0, 12), "rig_forearm_right": (-50, 0, -8), "rig_upper_arm_left": (-16, 0, -8), "rig_forearm_left": (-34, 0, 6)}, {"rig_root": (0, 0.005, 0)}),
            (2.1, {"rig_pelvis": (0, 1, 0.5), "rig_spine": (-1, 0, 0.5), "rig_chest": (-1, 0, 1), "rig_neck": (1, 0, 1), "rig_head": (2, 0, 2), "rig_clavicle_right": (-1, 0, 2), "rig_upper_arm_right": (-20, 0, 9), "rig_forearm_right": (-38, 0, -6)}, {"rig_root": (0, 0.003, 0)}),
            (2.533333, {"rig_head": (-1, 0, -1), "rig_upper_arm_right": (-8, 0, 3), "rig_forearm_right": (-18, 0, -2)}, {}),
            (talk_duration, {}, {}),
        ],
        "plant": [
            (0.0, {}, {}),
            (0.14, {"rig_spine": (-6, 0, 0), "rig_chest": (-7, 0, 0), **arms_forward}, {}),
            (0.32, {"rig_spine": (-18, 0, 0), "rig_chest": (-20, 0, 0), "rig_neck": (8, 0, 0), "rig_head": (12, 0, 0), "rig_clavicle_left": (-6, 0, -4), "rig_clavicle_right": (-6, 0, 4), "rig_upper_arm_left": (-68, 0, -6), "rig_forearm_left": (-42, 0, 0), "rig_upper_arm_right": (-68, 0, 6), "rig_forearm_right": (-42, 0, 0), "rig_thigh_left": (18, 0, 0), "rig_thigh_right": (10, 0, 0)}, {"rig_root": (0, -0.05, 0)}),
            (0.46, {"rig_spine": (-16, 0, 0), "rig_chest": (-18, 0, 0), "rig_neck": (7, 0, 0), "rig_head": (10, 0, 0), "rig_clavicle_left": (-5, 0, -3), "rig_clavicle_right": (-5, 0, 3), "rig_upper_arm_left": (-64, 0, -5), "rig_forearm_left": (-48, 0, 0), "rig_upper_arm_right": (-64, 0, 5), "rig_forearm_right": (-48, 0, 0)}, {"rig_root": (0, -0.04, 0)}),
            (0.72, {}, {}),
        ],
        "water": [
            (0.0, {**arms_tool_hold}, {}),
            (0.20, {"rig_spine": (-8, 0, 0), "rig_chest": (-9, 0, 0), "rig_clavicle_right": (-4, 0, 4), "rig_upper_arm_right": (-40, 0, 12), "rig_forearm_right": (-40, 0, -8), **hand_grip_right}, {}),
            (0.40, {"rig_spine": (-12, 0, 0), "rig_chest": (-14, 0, 0), "rig_neck": (4, 0, 0), "rig_clavicle_right": (-6, 0, 6), "rig_upper_arm_right": (-54, 0, 15), "rig_forearm_right": (-52, 0, -12), **hand_grip_right, "rig_upper_arm_left": (-18, 0, -10)}, {"rig_root": (0, -0.02, 0)}),
            (0.60, {"rig_spine": (-9, 0, 0), "rig_chest": (-10, 0, 0), "rig_clavicle_right": (-4, 0, 4), "rig_upper_arm_right": (-42, 0, 12), "rig_forearm_right": (-38, 0, -8), **hand_grip_right}, {}),
            (0.84, {**arms_tool_hold}, {}),
        ],
        "harvest": [
            (0.0, {**arms_tool_hold}, {}),
            (0.18, {"rig_spine": (-10, 0, 0), "rig_chest": (-12, 0, 0), "rig_upper_arm_right": (-38, 0, 10), "rig_forearm_right": (-30, 0, 0), **hand_grip_right}, {}),
            (0.36, {"rig_spine": (-20, 0, 0), "rig_chest": (-22, 0, 0), "rig_neck": (9, 0, 0), "rig_head": (14, 0, 0), "rig_clavicle_right": (-6, 0, 6), "rig_upper_arm_right": (-70, 0, 20), "rig_forearm_right": (-65, 0, -18), **hand_grip_right, "rig_clavicle_left": (-4, 0, -4), "rig_upper_arm_left": (-44, 0, -10), "rig_forearm_left": (-36, 0, 8), "rig_thigh_right": (14, 0, 0), "rig_thigh_left": (18, 0, 0)}, {"rig_root": (0, -0.06, 0)}),
            (0.54, {"rig_spine": (-12, 0, 0), "rig_chest": (-14, 0, 0), "rig_upper_arm_right": (-38, 0, 12), "rig_forearm_right": (-32, 0, 0), **hand_grip_right}, {}),
            (0.80, {**arms_tool_hold}, {}),
        ],
        "pickup": [
            (0.0, {}, {}),
            (0.32, {"rig_spine": (-19, 0, 0), "rig_chest": (-21, 0, 0), "rig_neck": (8, 0, 0), "rig_head": (12, 0, 0), **arms_forward, "rig_thigh_left": (16, 0, 0), "rig_thigh_right": (16, 0, 0)}, {"rig_root": (0, -0.05, 0)}),
            (0.64, {}, {}),
        ],
        # Carrying a load: the breath is heavier and the sway wider.
        "carry_idle": _breathing_cycle(
            carry_idle_duration,
            {"rig_spine": (-3, 0, 0), "rig_chest": (-3, 0, 0), **arms_carry},
            pitch=2.2,
            sway=1.2,
            lift=0.007,
        ),
        "carry_walk": _locomotion_cycle(
            walk_duration, stride=34, knee_tuck=36, arm_swing=0, spine_pitch=-2,
            root_low=-0.009, root_high=0.014, pelvis_drop=2.0,
            extra=arms_carry,
        ),
        "carry_run": _locomotion_cycle(
            run_duration, stride=44, knee_tuck=56, arm_swing=0, spine_pitch=-5,
            root_low=-0.016, root_high=0.044, pelvis_drop=3.4,
            running=True, extra=arms_carry,
        ),
        "place": [
            (0.0, {"rig_spine": (-2, 0, 0), "rig_chest": (-2, 0, 0), **arms_forward}, {}),
            (0.52, {"rig_spine": (-18, 0, 0), "rig_chest": (-20, 0, 0), "rig_neck": (8, 0, 0), "rig_head": (12, 0, 0), **arms_forward, "rig_thigh_left": (16, 0, 0), "rig_thigh_right": (16, 0, 0)}, {"rig_root": (0, -0.05, 0)}),
            (0.72, {}, {}),
        ],
        "workstation": [
            (0.0, {**arms_tool_hold}, {}),
            (0.24, {"rig_spine": (-7, 0, 0), "rig_chest": (-8, 0, 0), "rig_clavicle_right": (-3, 0, 3), "rig_upper_arm_right": (-42, 0, 16), "rig_forearm_right": (-45, 0, -10), **hand_grip_right, "rig_upper_arm_left": (-32, 0, -10), "rig_forearm_left": (-38, 0, 8)}, {}),
            (0.52, {"rig_spine": (-9, 0, 0), "rig_chest": (-10, 0, 0), "rig_clavicle_right": (-5, 0, 4), "rig_upper_arm_right": (-54, 0, 10), "rig_forearm_right": (-60, 0, -14), **hand_grip_right, "rig_upper_arm_left": (-38, 0, -12), "rig_forearm_left": (-44, 0, 10)}, {"rig_root": (0, -0.015, 0)}),
            (0.72, {"rig_spine": (-6, 0, 0), "rig_chest": (-7, 0, 0), "rig_clavicle_right": (-3, 0, 3), "rig_upper_arm_right": (-38, 0, 18), "rig_forearm_right": (-35, 0, -8), **hand_grip_right}, {}),
            (0.92, {**arms_tool_hold}, {}),
        ],
        "cast": [
            (0.0, {**arms_tool_hold}, {}),
            (0.28, {"rig_spine": (6, 0, 0), "rig_chest": (7, 0, 0), "rig_clavicle_right": (3, 0, 2), "rig_upper_arm_right": (38, 0, 10), "rig_forearm_right": (-18, 0, 0), **hand_grip_right}, {}),
            (0.58, {"rig_spine": (-12, 0, 0), "rig_chest": (-14, 0, 0), "rig_neck": (4, 0, 0), "rig_clavicle_right": (-6, 0, 4), "rig_upper_arm_right": (-70, 0, 6), "rig_forearm_right": (-52, 0, 0), **hand_grip_right, "rig_upper_arm_left": (-22, 0, -8)}, {"rig_root": (0, -0.02, 0)}),
            (0.92, {"rig_spine": (-4, 0, 0), "rig_chest": (-5, 0, 0), "rig_upper_arm_right": (-42, 0, 10), "rig_forearm_right": (-35, 0, 0), **hand_grip_right}, {}),
        ],
        "hookset": [
            (0.0, {"rig_spine": (4, 0, 0), "rig_chest": (5, 0, 0), "rig_neck": (-2, 0, 0), "rig_upper_arm_right": (-32, 0, 10), "rig_forearm_right": (-28, 0, -3), **hand_grip_right, "rig_upper_arm_left": (-25, 0, -8), "rig_forearm_left": (-34, 0, 7)}, {}),
            (0.16, {"rig_spine": (-16, 0, 0), "rig_chest": (-19, 0, 0), "rig_neck": (7, 0, 0), "rig_head": (8, 0, 0), "rig_clavicle_right": (-7, 0, 5), "rig_upper_arm_right": (-72, 0, 15), "rig_forearm_right": (-62, 0, -10), **hand_grip_right, "rig_clavicle_left": (-5, 0, -5), "rig_upper_arm_left": (-55, 0, -15), "rig_forearm_left": (-60, 0, 12)}, {"rig_root": (0, -0.025, 0)}),
            (0.34, {"rig_spine": (-12, 0, 0), "rig_chest": (-14, 0, 0), "rig_neck": (5, 0, 0), "rig_head": (6, 0, 0), "rig_upper_arm_right": (-62, 0, 14), "rig_forearm_right": (-56, 0, -8), **hand_grip_right, "rig_upper_arm_left": (-48, 0, -13), "rig_forearm_left": (-54, 0, 10)}, {"rig_root": (0, -0.018, 0)}),
            (0.56, {"rig_spine": (-7, 0, 0), "rig_chest": (-8, 0, 0), "rig_neck": (3, 0, 0), "rig_upper_arm_right": (-50, 0, 12), "rig_forearm_right": (-46, 0, -6), **hand_grip_right, "rig_upper_arm_left": (-38, 0, -10), "rig_forearm_left": (-46, 0, 8)}, {}),
        ],
        # Waiting on a bite: the calmest breath in the set.
        "fishing_idle": _breathing_cycle(
            fishing_idle_duration,
            {
                "rig_spine": (-3, 0, 0), "rig_chest": (-3, 0, 0),
                "rig_upper_arm_right": (-42, 0, 10), "rig_forearm_right": (-40, 0, -4),
                **hand_grip_right,
                "rig_upper_arm_left": (-30, 0, -8), "rig_forearm_left": (-38, 0, 6),
            },
            pitch=1.5,
            sway=0.8,
        ),
        "reel": [
            (0.0, {"rig_spine": (-4, 0, 0), "rig_chest": (-4, 0, 0), "rig_upper_arm_right": (-45, 0, 10), "rig_forearm_right": (-45, 0, -4), **hand_grip_right, "rig_upper_arm_left": (-34, 0, -10), "rig_forearm_left": (-45, 0, 10)}, {}),
            (0.24, {"rig_spine": (-5, 0, 0), "rig_chest": (-5, 0, 0), **hand_grip_right, "rig_upper_arm_left": (-40, 0, -16), "rig_forearm_left": (-60, 0, 14)}, {}),
            (0.48, {"rig_spine": (-4, 0, 0), "rig_chest": (-4, 0, 0), **hand_grip_right, "rig_upper_arm_left": (-28, 0, -6), "rig_forearm_left": (-35, 0, 4)}, {}),
            (0.72, {"rig_spine": (-4, 0, 0), "rig_chest": (-4, 0, 0), "rig_upper_arm_right": (-45, 0, 10), "rig_forearm_right": (-45, 0, -4), **hand_grip_right, "rig_upper_arm_left": (-34, 0, -10), "rig_forearm_left": (-45, 0, 10)}, {}),
        ],
        "slack": [
            (0.0, {"rig_spine": (2, 0, 0), "rig_chest": (3, 0, 0), "rig_upper_arm_right": (-24, 0, 10), "rig_forearm_right": (-20, 0, 0), **hand_grip_right, "rig_upper_arm_left": (-16, 0, -6)}, {}),
            (0.4, {"rig_spine": (3, 0, 0), "rig_chest": (4, 0, 0), "rig_upper_arm_right": (-16, 0, 12), "rig_forearm_right": (-15, 0, 0), **hand_grip_right}, {"rig_root": (0, 0.005, 0)}),
            (0.8, {"rig_spine": (2, 0, 0), "rig_chest": (3, 0, 0), "rig_upper_arm_right": (-24, 0, 10), "rig_forearm_right": (-20, 0, 0), **hand_grip_right, "rig_upper_arm_left": (-16, 0, -6)}, {}),
        ],
        "brace": [
            (0.0, {"rig_spine": (-9, 0, 0), "rig_chest": (-10, 0, 0), "rig_neck": (4, 0, 0), "rig_head": (5, 0, 0), "rig_clavicle_right": (-4, 0, 4), "rig_upper_arm_right": (-58, 0, 14), "rig_forearm_right": (-58, 0, -8), **hand_grip_right, "rig_clavicle_left": (-4, 0, -4), "rig_upper_arm_left": (-48, 0, -14), "rig_forearm_left": (-55, 0, 10), "rig_thigh_left": (8, 0, 0), "rig_thigh_right": (-6, 0, 0)}, {"rig_root": (0, -0.02, 0)}),
            (0.4, {"rig_spine": (-11, 0, 0), "rig_chest": (-12, 0, 0), "rig_neck": (5, 0, 0), "rig_head": (6, 0, 0), "rig_clavicle_right": (-5, 0, 5), "rig_upper_arm_right": (-62, 0, 16), "rig_forearm_right": (-62, 0, -10), **hand_grip_right, "rig_clavicle_left": (-5, 0, -5), "rig_upper_arm_left": (-52, 0, -16), "rig_forearm_left": (-58, 0, 12)}, {"rig_root": (0, -0.025, 0)}),
            (0.8, {"rig_spine": (-9, 0, 0), "rig_chest": (-10, 0, 0), "rig_neck": (4, 0, 0), "rig_head": (5, 0, 0), "rig_clavicle_right": (-4, 0, 4), "rig_upper_arm_right": (-58, 0, 14), "rig_forearm_right": (-58, 0, -8), **hand_grip_right, "rig_clavicle_left": (-4, 0, -4), "rig_upper_arm_left": (-48, 0, -14), "rig_forearm_left": (-55, 0, 10), "rig_thigh_left": (8, 0, 0), "rig_thigh_right": (-6, 0, 0)}, {"rig_root": (0, -0.02, 0)}),
        ],
        "board": [
            (0.0, {}, {}),
            (0.24, {"rig_spine": (-7, 0, 0), "rig_chest": (-8, 0, 0), "rig_neck": (4, 0, 0), "rig_clavicle_left": (-5, 0, -8), "rig_upper_arm_left": (-30, 0, -34), "rig_forearm_left": (-30, 0, 14), "rig_clavicle_right": (-5, 0, 8), "rig_upper_arm_right": (-26, 0, 34), "rig_forearm_right": (-28, 0, -14), "rig_thigh_right": (74, 0, 12), "rig_shin_right": (-64, 0, 0), "rig_foot_right": (-12, 0, 0), "rig_thigh_left": (10, 0, -4)}, {"rig_root": (0, -0.14, 0.05)}),
            (0.48, {"rig_spine": (-11, 0, 0), "rig_chest": (-12, 0, 0), "rig_neck": (5, 0, 0), "rig_clavicle_left": (-4, 0, -6), "rig_upper_arm_left": (-34, 0, -26), "rig_forearm_left": (-34, 0, 12), "rig_clavicle_right": (-4, 0, 6), "rig_upper_arm_right": (-30, 0, 26), "rig_forearm_right": (-32, 0, -12), "rig_thigh_right": (44, 0, 10), "rig_shin_right": (-40, 0, 0), "rig_thigh_left": (40, 0, -8), "rig_shin_left": (-34, 0, 0)}, {"rig_root": (0, -0.30, -0.02)}),
            (0.68, {**rowing_lower, "rig_spine": (-9, 0, 0), "rig_chest": (-10, 0, 0), "rig_neck": (4, 0, 0), "rig_upper_arm_left": (-40, 0, -18), "rig_forearm_left": (-46, 0, 8), "rig_upper_arm_right": (-40, 0, 18), "rig_forearm_right": (-46, 0, -8), "rig_thigh_left": (70, 0, -12), "rig_thigh_right": (70, 0, 12)}, {"rig_root": (0, -0.40, -0.09)}),
            (0.88, resting_oar_hold, {"rig_root": (0, -0.42, -0.06)}),
        ],
        "dock": [
            (0.0, resting_oar_hold, {"rig_root": (0, -0.42, -0.06)}),
            (0.24, {**rowing_lower, "rig_spine": (-10, 0, 0), "rig_chest": (-11, 0, 0), "rig_neck": (5, 0, 0), "rig_upper_arm_left": (-42, 0, -20), "rig_forearm_left": (-46, 0, 9), "rig_upper_arm_right": (-42, 0, 20), "rig_forearm_right": (-46, 0, -9), "rig_thigh_left": (72, 0, -12), "rig_thigh_right": (72, 0, 12)}, {"rig_root": (0, -0.38, -0.10)}),
            (0.48, {"rig_spine": (-9, 0, 0), "rig_chest": (-10, 0, 0), "rig_neck": (4, 0, 0), "rig_clavicle_left": (-4, 0, -6), "rig_upper_arm_left": (-32, 0, -26), "rig_forearm_left": (-32, 0, 12), "rig_clavicle_right": (-4, 0, 6), "rig_upper_arm_right": (-28, 0, 26), "rig_forearm_right": (-30, 0, -12), "rig_thigh_left": (46, 0, -8), "rig_shin_left": (-38, 0, 0), "rig_thigh_right": (38, 0, 8), "rig_shin_right": (-32, 0, 0)}, {"rig_root": (0, -0.24, 0.00)}),
            (0.68, {"rig_spine": (-5, 0, 0), "rig_chest": (-5, 0, 0), "rig_upper_arm_left": (-16, 0, -12), "rig_upper_arm_right": (-14, 0, 12), "rig_thigh_left": (66, 0, -6), "rig_shin_left": (-52, 0, 0), "rig_foot_left": (-12, 0, 0), "rig_thigh_right": (16, 0, 4)}, {"rig_root": (0, -0.10, 0.04)}),
            (0.92, {}, {}),
        ],
        "board_skiff": [
            (0.0, {}, {}),
            (0.20, {"rig_pelvis": (-3, -2, -2), "rig_spine": (-6, 0, -1), "rig_chest": (-7, 0, -1), "rig_thigh_left": (34, 0, -8), "rig_shin_left": (-24, 0, 3), "rig_thigh_right": (-8, 0, 6), "rig_shin_right": (24, 0, -3), "rig_upper_arm_left": (-14, 0, -10), "rig_upper_arm_right": (12, 0, 10)}, {}),
            (0.46, {"rig_pelvis": (-5, 2, 2), "rig_spine": (-8, 0, 1), "rig_chest": (-8, 0, 1), "rig_thigh_left": (12, 0, -8), "rig_shin_left": (-18, 0, 3), "rig_thigh_right": (58, 0, 12), "rig_shin_right": (-54, 0, -4), "rig_foot_right": (-10, 0, -3), "rig_upper_arm_left": (-22, 0, -12), "rig_upper_arm_right": (-16, 0, 14)}, {}),
            (0.66, {**standing_helm_lower, "rig_pelvis": (-5, 0, 1), "rig_spine": (-6, 0, 0.5), "rig_chest": (-6, 0, 0.5), "rig_thigh_left": (16, 0, -10), "rig_shin_left": (-22, 0, 3), "rig_thigh_right": (12, 0, 10), "rig_shin_right": (-18, 0, -3)}, {}),
            (0.866667, {**standing_helm_lower, "rig_spine": (-2, 0, 0), "rig_chest": (-2, 0, 0)}, {}),
        ],
        "dock_skiff": [
            (0.0, {**standing_helm_lower, "rig_spine": (-2, 0, 0), "rig_chest": (-2, 0, 0)}, {}),
            (0.22, {**standing_helm_lower, "rig_pelvis": (-5, 0, -1), "rig_spine": (-6, 0, -0.5), "rig_chest": (-6, 0, -0.5), "rig_thigh_right": (16, 0, 10), "rig_shin_right": (-22, 0, -3)}, {}),
            (0.48, {"rig_pelvis": (-4, -2, -2), "rig_spine": (-7, 0, -1), "rig_chest": (-8, 0, -1), "rig_thigh_left": (54, 0, -12), "rig_shin_left": (-50, 0, 4), "rig_foot_left": (-10, 0, 3), "rig_thigh_right": (10, 0, 8), "rig_shin_right": (-16, 0, -3), "rig_upper_arm_left": (-20, 0, -14), "rig_upper_arm_right": (-14, 0, 12)}, {}),
            (0.70, {"rig_pelvis": (-3, 2, 2), "rig_spine": (-5, 0, 1), "rig_chest": (-5, 0, 1), "rig_thigh_left": (24, 0, -8), "rig_shin_left": (-18, 0, 3), "rig_thigh_right": (-6, 0, 6), "rig_shin_right": (20, 0, -3)}, {}),
            (0.933333, {}, {}),
        ],
        "rowboat_idle": [
            (0.0, resting_oar_hold, {}),
            (0.4, {**resting_oar_hold, "rig_spine": (-2, 0, 0.6), "rig_chest": (-2, 0, 0.8), "rig_head": (0.5, 0, -0.6)}, {}),
            (0.8, {**resting_oar_hold, "rig_spine": (-2.5, 0, 0), "rig_chest": (-2.5, 0, 0)}, {}),
            (1.2, {**resting_oar_hold, "rig_spine": (-2, 0, -0.6), "rig_chest": (-2, 0, -0.8), "rig_head": (0.5, 0, 0.6)}, {}),
            (1.6, resting_oar_hold, {}),
        ],
        "row": [
            (0.0, {**rowing_lower, "rig_spine": (-14, 0, 0), "rig_chest": (-15, 0, 0), "rig_neck": (6, 0, 0), "rig_head": (4, 0, 0), "rig_clavicle_left": (-5, 0, -5), "rig_upper_arm_left": (-68, 0, -16), "rig_forearm_left": (-30, 0, 6), "rig_clavicle_right": (-5, 0, 5), "rig_upper_arm_right": (-68, 0, 16), "rig_forearm_right": (-30, 0, -6), "rig_thigh_left": (58, 0, -10), "rig_thigh_right": (58, 0, 10), "rig_shin_left": (-48, 0, 4), "rig_shin_right": (-48, 0, -4)}, {}),
            (0.2, {**rowing_lower, "rig_spine": (-6, 0, 0), "rig_chest": (-6, 0, 0), "rig_neck": (3, 0, 0), "rig_clavicle_left": (-3, 0, -3), "rig_upper_arm_left": (-50, 0, -14), "rig_forearm_left": (-48, 0, 8), "rig_clavicle_right": (-3, 0, 3), "rig_upper_arm_right": (-50, 0, 14), "rig_forearm_right": (-48, 0, -8), "rig_thigh_left": (54, 0, -9), "rig_thigh_right": (54, 0, 9), "rig_shin_left": (-42, 0, 4), "rig_shin_right": (-42, 0, -4)}, {}),
            (0.48, {**rowing_lower, "rig_spine": (11, 0, 0), "rig_chest": (12, 0, 0), "rig_neck": (-4, 0, 0), "rig_head": (-3, 0, 0), "rig_upper_arm_left": (-14, 0, -12), "rig_forearm_left": (-88, 0, 12), "rig_upper_arm_right": (-14, 0, 12), "rig_forearm_right": (-88, 0, -12), "rig_thigh_left": (46, 0, -8), "rig_thigh_right": (46, 0, 8), "rig_shin_left": (-30, 0, 3), "rig_shin_right": (-30, 0, -3)}, {}),
            (0.72, {**rowing_lower, "rig_spine": (2, 0, 0), "rig_chest": (3, 0, 0), "rig_upper_arm_left": (-38, 0, -12), "rig_forearm_left": (-66, 0, 10), "rig_upper_arm_right": (-38, 0, 12), "rig_forearm_right": (-66, 0, -10), "rig_thigh_left": (52, 0, -9), "rig_thigh_right": (52, 0, 9), "rig_shin_left": (-38, 0, 3), "rig_shin_right": (-38, 0, -3)}, {}),
            (0.96, {**rowing_lower, "rig_spine": (-14, 0, 0), "rig_chest": (-15, 0, 0), "rig_neck": (6, 0, 0), "rig_head": (4, 0, 0), "rig_clavicle_left": (-5, 0, -5), "rig_upper_arm_left": (-68, 0, -16), "rig_forearm_left": (-30, 0, 6), "rig_clavicle_right": (-5, 0, 5), "rig_upper_arm_right": (-68, 0, 16), "rig_forearm_right": (-30, 0, -6), "rig_thigh_left": (58, 0, -10), "rig_thigh_right": (58, 0, 10), "rig_shin_left": (-48, 0, 4), "rig_shin_right": (-48, 0, -4)}, {}),
        ],
        "skiff_idle": [
            (0.0, {**standing_helm_lower, "rig_spine": (-2, 0, 0), "rig_chest": (-2, 0, 0), "rig_upper_arm_left": (-18, 0, -8), "rig_forearm_left": (-38, 0, 6), "rig_upper_arm_right": (-34, 0, 14), "rig_forearm_right": (-52, 0, -10), **hand_grip_right}, {}),
            (0.8, {**standing_helm_lower, "rig_pelvis": (-3, 0, 1), "rig_spine": (-2, 0, 0.8), "rig_chest": (-2, 0, 1), "rig_neck": (1, 0, -0.6), "rig_head": (1, 0, -0.6), "rig_thigh_left": (10, 0, -10), "rig_shin_left": (-15, 0, 3), "rig_upper_arm_left": (-17, 0, -8), "rig_forearm_left": (-37, 0, 6), "rig_upper_arm_right": (-33, 0, 14), "rig_forearm_right": (-51, 0, -10), **hand_grip_right}, {}),
            (1.6, {**standing_helm_lower, "rig_spine": (-2, 0, 0), "rig_chest": (-2, 0, 0), "rig_upper_arm_left": (-18, 0, -8), "rig_forearm_left": (-38, 0, 6), "rig_upper_arm_right": (-34, 0, 14), "rig_forearm_right": (-52, 0, -10), **hand_grip_right}, {}),
        ],
        "skiff_fishing": [
            (0.0, {"rig_pelvis": (-2, 0, 0), "rig_thigh_left": (9, 0, -12), "rig_shin_left": (-12, 0, 4), "rig_foot_left": (3, 0, 4), "rig_thigh_right": (9, 0, 12), "rig_shin_right": (-12, 0, -4), "rig_foot_right": (3, 0, -4)}, {"rig_root": (0, -0.018, 0)}),
            (0.6, {"rig_pelvis": (-3, 0, 1), "rig_thigh_left": (11, 0, -13), "rig_shin_left": (-14, 0, 4), "rig_foot_left": (4, 0, 4), "rig_thigh_right": (8, 0, 11), "rig_shin_right": (-11, 0, -4), "rig_foot_right": (3, 0, -4)}, {"rig_root": (0.012, -0.022, 0)}),
            (1.2, {"rig_pelvis": (-2, 0, 0), "rig_thigh_left": (9, 0, -12), "rig_shin_left": (-12, 0, 4), "rig_foot_left": (3, 0, 4), "rig_thigh_right": (9, 0, 12), "rig_shin_right": (-12, 0, -4), "rig_foot_right": (3, 0, -4)}, {"rig_root": (0, -0.018, 0)}),
        ],
        "skiff_drive": [
            (0.0, {**standing_helm_lower, "rig_pelvis": (-3, 0, -1.5), "rig_spine": (-4, 0, -1), "rig_chest": (-4, 0, -1.5), "rig_neck": (1, 0, 1), "rig_head": (2, 0, 1.5), "rig_thigh_left": (12, 0, -10), "rig_shin_left": (-18, 0, 3), "rig_upper_arm_left": (-24, 0, -12), "rig_forearm_left": (-44, 0, 8), "rig_upper_arm_right": (-42, 0, 16), "rig_forearm_right": (-58, 0, -12), **hand_grip_right}, {}),
            (0.4, {**standing_helm_lower, "rig_pelvis": (-4, 0, 1.5), "rig_spine": (-5, 0, 1), "rig_chest": (-5, 0, 1.5), "rig_neck": (1, 0, -1), "rig_head": (2, 0, -1.5), "rig_thigh_right": (9, 0, 10), "rig_shin_right": (-15, 0, -3), "rig_upper_arm_left": (-28, 0, -14), "rig_forearm_left": (-48, 0, 10), "rig_upper_arm_right": (-46, 0, 18), "rig_forearm_right": (-62, 0, -14), **hand_grip_right}, {}),
            (0.8, {**standing_helm_lower, "rig_pelvis": (-3, 0, -1.5), "rig_spine": (-4, 0, -1), "rig_chest": (-4, 0, -1.5), "rig_neck": (1, 0, 1), "rig_head": (2, 0, 1.5), "rig_thigh_left": (12, 0, -10), "rig_shin_left": (-18, 0, 3), "rig_upper_arm_left": (-24, 0, -12), "rig_forearm_left": (-44, 0, 8), "rig_upper_arm_right": (-42, 0, 16), "rig_forearm_right": (-58, 0, -12), **hand_grip_right}, {}),
        ],
        # Seated on a moving animal, so the breath is shallower and the sway
        # smaller than on foot -- but never zero.
        "mounted_idle": _breathing_cycle(
            mounted_idle_duration, mounted_reins, pitch=1.1, sway=0.7, lift=0.003
        ),
        "mounted_walk": [
            # The player is parented to the donkey motion root. These relative
            # offsets therefore absorb part of the saddle rise instead of
            # adding a second bounce on top of the animal's body track.
            (0.0, {**mounted_reins, "rig_pelvis": (0.8, 0, -1.2), "rig_spine": (-2.6, 0, -0.8), "rig_chest": (-2.6, 0, -0.8), "rig_neck": (1, 0, 0.6), "rig_shin_left": (-68, 0, 6), "rig_shin_right": (-64, 0, -6)}, {}),
            (_frame_time_for_fraction(mounted_walk_duration, 0.25), {**mounted_reins, "rig_pelvis": (-0.4, 0, 0), "rig_spine": (-1.4, 0, 0.4), "rig_chest": (-1.4, 0, 0.4), "rig_shin_left": (-65, 0, 6), "rig_shin_right": (-68, 0, -6)}, {}),
            (_frame_time_for_fraction(mounted_walk_duration, 0.50), {**mounted_reins, "rig_pelvis": (0.8, 0, 1.2), "rig_spine": (-2.6, 0, 0.8), "rig_chest": (-2.6, 0, 0.8), "rig_neck": (1, 0, -0.6), "rig_shin_left": (-64, 0, 6), "rig_shin_right": (-68, 0, -6)}, {}),
            (_frame_time_for_fraction(mounted_walk_duration, 0.75), {**mounted_reins, "rig_pelvis": (-0.4, 0, 0), "rig_spine": (-1.4, 0, -0.4), "rig_chest": (-1.4, 0, -0.4), "rig_shin_left": (-68, 0, 6), "rig_shin_right": (-65, 0, -6)}, {}),
            (_frame_time_for_fraction(mounted_walk_duration, 1.0), {**mounted_reins, "rig_pelvis": (0.8, 0, -1.2), "rig_spine": (-2.6, 0, -0.8), "rig_chest": (-2.6, 0, -0.8), "rig_neck": (1, 0, 0.6), "rig_shin_left": (-68, 0, 6), "rig_shin_right": (-64, 0, -6)}, {}),
        ],
        "mounted_trot": [
            (0.0, {**mounted_reins, "rig_pelvis": (1.8, 0, -1.8), "rig_spine": (-4, 0, -1.2), "rig_chest": (-4, 0, -1.2), "rig_neck": (2, 0, 0.8), "rig_shin_left": (-70, 0, 6), "rig_shin_right": (-64, 0, -6), "rig_forearm_left": (-58, 0, 10), "rig_forearm_right": (-58, 0, -10)}, {}),
            (_frame_time_for_fraction(mounted_trot_duration, 0.25), {**mounted_reins, "rig_pelvis": (-1, 0, 0), "rig_spine": (-1.5, 0, 0.5), "rig_chest": (-1.5, 0, 0.5), "rig_shin_left": (-64, 0, 6), "rig_shin_right": (-69, 0, -6)}, {}),
            (_frame_time_for_fraction(mounted_trot_duration, 0.50), {**mounted_reins, "rig_pelvis": (1.8, 0, 1.8), "rig_spine": (-4, 0, 1.2), "rig_chest": (-4, 0, 1.2), "rig_neck": (2, 0, -0.8), "rig_shin_left": (-64, 0, 6), "rig_shin_right": (-70, 0, -6), "rig_forearm_left": (-58, 0, 10), "rig_forearm_right": (-58, 0, -10)}, {}),
            (_frame_time_for_fraction(mounted_trot_duration, 0.75), {**mounted_reins, "rig_pelvis": (-1, 0, 0), "rig_spine": (-1.5, 0, -0.5), "rig_chest": (-1.5, 0, -0.5), "rig_shin_left": (-69, 0, 6), "rig_shin_right": (-64, 0, -6)}, {}),
            (_frame_time_for_fraction(mounted_trot_duration, 1.0), {**mounted_reins, "rig_pelvis": (1.8, 0, -1.8), "rig_spine": (-4, 0, -1.2), "rig_chest": (-4, 0, -1.2), "rig_neck": (2, 0, 0.8), "rig_shin_left": (-70, 0, 6), "rig_shin_right": (-64, 0, -6), "rig_forearm_left": (-58, 0, 10), "rig_forearm_right": (-58, 0, -10)}, {}),
        ],
        "mounted_gallop": [
            (0.0, {**mounted_reins, "rig_pelvis": (2.8, 0, -2.2), "rig_spine": (-5.2, 0, -1.4), "rig_chest": (-5.2, 0, -1.4), "rig_neck": (2.4, 0, 0.9), "rig_shin_left": (-71, 0, 6), "rig_shin_right": (-63, 0, -6), "rig_forearm_left": (-57, 0, 10), "rig_forearm_right": (-57, 0, -10)}, {}),
            (_frame_time_for_fraction(mounted_gallop_duration, 0.25), {**mounted_reins, "rig_pelvis": (-1.6, 0, 0), "rig_spine": (-2.0, 0, 0.7), "rig_chest": (-2.0, 0, 0.7), "rig_shin_left": (-63, 0, 6), "rig_shin_right": (-71, 0, -6)}, {}),
            (_frame_time_for_fraction(mounted_gallop_duration, 0.50), {**mounted_reins, "rig_pelvis": (3.4, 0, 2.2), "rig_spine": (-5.8, 0, 1.4), "rig_chest": (-5.8, 0, 1.4), "rig_neck": (2.6, 0, -0.9), "rig_shin_left": (-63, 0, 6), "rig_shin_right": (-72, 0, -6), "rig_forearm_left": (-57, 0, 10), "rig_forearm_right": (-57, 0, -10)}, {}),
            (_frame_time_for_fraction(mounted_gallop_duration, 0.75), {**mounted_reins, "rig_pelvis": (-1.6, 0, 0), "rig_spine": (-2.0, 0, -0.7), "rig_chest": (-2.0, 0, -0.7), "rig_shin_left": (-71, 0, 6), "rig_shin_right": (-63, 0, -6)}, {}),
            (_frame_time_for_fraction(mounted_gallop_duration, 1.0), {**mounted_reins, "rig_pelvis": (2.8, 0, -2.2), "rig_spine": (-5.2, 0, -1.4), "rig_chest": (-5.2, 0, -1.4), "rig_neck": (2.4, 0, 0.9), "rig_shin_left": (-71, 0, 6), "rig_shin_right": (-63, 0, -6), "rig_forearm_left": (-57, 0, 10), "rig_forearm_right": (-57, 0, -10)}, {}),
        ],
        "mount": [
            (0.0, {}, {}),
            (0.16, {"rig_spine": (-9, 0, 0), "rig_chest": (-10, 0, 0), "rig_neck": (5, 0, 0), "rig_clavicle_left": (-5, 0, -6), "rig_upper_arm_left": (-62, 0, -18), "rig_forearm_left": (-52, 0, 10), "rig_clavicle_right": (-5, 0, 6), "rig_upper_arm_right": (-58, 0, 18), "rig_forearm_right": (-48, 0, -10), "rig_thigh_left": (16, 0, -4), "rig_shin_left": (-22, 0, 0), "rig_thigh_right": (26, 0, 6), "rig_shin_right": (-40, 0, 0)}, {"rig_root": (0, -0.03, 0.10)}),
            (0.36, {"rig_spine": (-12, 0, 2), "rig_chest": (-13, 0, 3), "rig_neck": (6, 0, 0), "rig_clavicle_left": (-6, 0, -7), "rig_upper_arm_left": (-70, 0, -20), "rig_forearm_left": (-58, 0, 12), "rig_clavicle_right": (-6, 0, 7), "rig_upper_arm_right": (-66, 0, 20), "rig_forearm_right": (-54, 0, -12), "rig_thigh_left": (10, 0, -6), "rig_shin_left": (-14, 0, 0), "rig_thigh_right": (80, 0, 36), "rig_shin_right": (-88, 0, 12), "rig_foot_right": (-14, 0, 8)}, {"rig_root": (0, 0.16, 0.04)}),
            (0.56, {**mounted_lower, "rig_spine": (-7, 0, 1), "rig_chest": (-8, 0, 1), "rig_clavicle_left": (-4, 0, -5), "rig_upper_arm_left": (-54, 0, -16), "rig_forearm_left": (-50, 0, 9), "rig_clavicle_right": (-4, 0, 5), "rig_upper_arm_right": (-50, 0, 16), "rig_forearm_right": (-48, 0, -9), "rig_thigh_right": (62, 0, 32), "rig_shin_right": (-70, 0, 10), "rig_thigh_left": (36, 0, -18), "rig_shin_left": (-44, 0, 6)}, {"rig_root": (0, 0.10, 0.02)}),
            (0.72, {**mounted_reins, "rig_spine": (-3, 0, 0), "rig_chest": (-3, 0, 0)}, {"rig_root": (0, 0.02, 0)}),
            (0.8, mounted_reins, {}),
        ],
        "dismount": [
            (0.0, mounted_reins, {}),
            (0.16, {**mounted_reins, "rig_spine": (-6, 0, 0), "rig_chest": (-7, 0, 0), "rig_neck": (3, 0, 0), "rig_clavicle_left": (-4, 0, -5), "rig_upper_arm_left": (-54, 0, -16), "rig_forearm_left": (-50, 0, 9)}, {"rig_root": (0, 0.03, -0.02)}),
            (0.36, {**mounted_lower, "rig_spine": (-11, 0, -2), "rig_chest": (-12, 0, -3), "rig_neck": (6, 0, 0), "rig_clavicle_left": (-6, 0, -7), "rig_upper_arm_left": (-68, 0, -20), "rig_forearm_left": (-56, 0, 12), "rig_clavicle_right": (-6, 0, 7), "rig_upper_arm_right": (-64, 0, 20), "rig_forearm_right": (-52, 0, -12), "rig_thigh_right": (76, 0, 36), "rig_shin_right": (-86, 0, 12), "rig_foot_right": (-14, 0, 8), "rig_thigh_left": (34, 0, -16)}, {"rig_root": (0, 0.15, -0.04)}),
            (0.56, {"rig_spine": (-8, 0, 0), "rig_chest": (-9, 0, 0), "rig_clavicle_left": (-4, 0, -5), "rig_upper_arm_left": (-50, 0, -15), "rig_forearm_left": (-44, 0, 8), "rig_clavicle_right": (-4, 0, 5), "rig_upper_arm_right": (-46, 0, 15), "rig_forearm_right": (-40, 0, -8), "rig_thigh_left": (30, 0, -8), "rig_shin_left": (-40, 0, 0), "rig_thigh_right": (40, 0, 10), "rig_shin_right": (-48, 0, 0), "rig_foot_left": (-8, 0, 0), "rig_foot_right": (-8, 0, 0)}, {"rig_root": (0, 0.06, -0.10)}),
            (0.68, {"rig_spine": (-5, 0, 0), "rig_chest": (-5, 0, 0), "rig_thigh_left": (16, 0, -4), "rig_shin_left": (-22, 0, 0), "rig_thigh_right": (14, 0, 4), "rig_shin_right": (-20, 0, 0)}, {"rig_root": (0, -0.02, -0.06)}),
            (0.8, {}, {}),
        ],
    }
    poses["mount_right"] = _mirror_character_keyframes(poses["mount"])
    poses["dismount_right"] = _mirror_character_keyframes(poses["dismount"])

    bpy.context.scene.render.fps = int(FRAME_RATE)
    bpy.context.scene.render.fps_base = 1.0
    spec_clips_by_name = {clip["name"]: clip for clip in _animation_clips(spec)}

    for clip_name, keyframes in poses.items():
        if clip_name not in spec_clips_by_name:
            continue
        clip_spec = spec_clips_by_name[clip_name]
        action = bpy.data.actions.new(name=clip_name)
        action["neva_loop"] = clip_spec.get("loop", False)
        if "commitMarkerSeconds" in clip_spec:
            action["neva_commit_marker_seconds"] = clip_spec["commitMarkerSeconds"]
        if "referenceSpeedMetersPerSecond" in clip_spec:
            action["neva_reference_speed_meters_per_second"] = clip_spec["referenceSpeedMetersPerSecond"]
        rig.animation_data_create()
        rig.animation_data.action = action
        keyed_bones = REEL_UPPER_BODY_BONES if clip_name == "reel" else None
        for seconds, rotations, locations in keyframes:
            _key_rig_pose(rig, _frame_number(seconds), rotations, locations, keyed_bones)
        action.use_fake_user = True
    rig.animation_data.action = None

    retargeted_clips = _retarget_catalog_animation_clips(spec, rig)
    if retargeted_clips:
        rig["neva_retargeted_clips"] = ",".join(retargeted_clips)

    # The rig must leave authoring in the same rotation mode its actions were
    # keyed in, or the exporter reads channels that drive nothing.
    for pose_bone in rig.pose.bones:
        pose_bone.rotation_mode = "QUATERNION"
        pose_bone.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
        pose_bone.location = (0.0, 0.0, 0.0)
        pose_bone.scale = (1.0, 1.0, 1.0)
    bpy.context.view_layer.update()


def _rig_character(spec: dict, root, height: float) -> None:
    rig = _create_character_rig(root, height, spec)
    prefix = _character_prefix(spec)
    sockets = spec.get("socketNodes") or [
        f"{prefix}_hand_socket_left",
        f"{prefix}_hand_socket_right",
        f"{prefix}_tool_socket",
        f"{prefix}_carry_socket",
        f"{prefix}_hip_socket",
    ]
    _bind_character_meshes(root, rig, spec, spec.get("_lodIndex", 0))
    _add_character_sockets(spec, rig, height, sockets)
    _author_character_actions(spec, rig)



def _add_character_sockets(spec: dict, rig, height: float, sockets: list[str]) -> None:
    """Bone-parent gameplay sockets shared by player LOD and every NPC on this rig.

    Axis convention (Blender Z-up authoring, glTF/Three.js Y-up at runtime):
      Sockets keep WORLD IDENTITY rotation at rest (arms hanging).
        glTF +X = right (outward of the right palm)
        glTF +Y = up
        glTF +Z = forward
      Tools are authored with the GRIP at the origin and the handle along
      Blender +Z (= glTF +Y). Shaft tools that should follow the hanging
      fingers use a 180 deg X rotation at attach time; see
      src/render/assets/ToolSocketAttach.ts.

    Palms: tool_socket and both hand_sockets parent to rig_hand_* — never to
    a forearm or wrist bone. Origin is the palm, slightly into the finger pad,
    matching _build_stylized_limbs_and_boots for either the adult or compact
    NPC proportion contract. A handle-at-origin tool therefore sits in the
    mitten, not beside the wrist.

    Carry stays on rig_spine so one stable anchor can sit between both hands.
    The character faces Blender -Y, therefore the anchor must also be at -Y;
    +Y is the backpack side and made carried cargo appear strapped to the back.
    """
    # Palm / finger-pad, not the wrist.
    proportions = _character_proportions(spec)
    palm_x = proportions["wrist_x"]
    palm_y = -0.05
    palm_z = height * (proportions["wrist"] - 0.03)
    _add_bone_socket(sockets[0], (-palm_x, palm_y, palm_z), rig, "rig_hand_left")
    _add_bone_socket(sockets[1], (palm_x, palm_y, palm_z), rig, "rig_hand_right")
    _add_bone_socket(sockets[2], (palm_x, palm_y, palm_z), rig, "rig_hand_right")
    _add_bone_socket(sockets[3], (0.0, -0.36, height * proportions["carry"]), rig, "rig_spine")
    _add_bone_socket(sockets[4], (0.28, 0.02, height * proportions["hip_socket"]), rig, "rig_pelvis")


def _build_stylized_head_and_face(
    root,
    head_center_z: float,
    head_height: float,
    skin_token: str,
    eye_token: str,
    brow_token: str,
    hair_token: str,
    role: str = "player",
    subdivisions: int = 3,
    chibi: bool = False,
    cheek_token: str | None = None,
) -> None:
    """Builds sculpted low-poly faceted skull, expressive inset eyes, planar nose bridge, and brow planes."""
    head_w = head_height * (0.56 if chibi else 0.46)
    head_d = head_height * (0.50 if chibi else 0.44)
    head_h = head_height * (0.60 if chibi else 0.50)

    # 1. Main Sculpted Cranium / Head
    add_ico(
        "character_head",
        (0, -0.005, head_center_z),
        (head_w, head_d, head_h),
        skin_token,
        root,
        subdivisions=subdivisions,
    )
    # The reference-locked NPC face has one soft cheek-to-chin sweep. A box at
    # the jaw reads like a robot muzzle, so the chibi variant uses a denser,
    # tapered lower-face volume while the player keeps the planar chin block.
    if chibi:
        add_ico(
            "character_chin",
            (0, -head_d * 0.20, head_center_z - head_h * 0.46),
            (head_w * 0.74, head_d * 0.66, head_h * 0.46),
            skin_token,
            root,
            subdivisions=max(2, subdivisions - 1),
        )
    else:
        chin_size = (head_w * 0.60, head_d * 0.55, head_h * 0.35)
        add_box(
            "character_chin",
            (0, -head_d * 0.45, head_center_z - head_h * 0.65),
            chin_size,
            skin_token,
            root,
            bevel=min(0.012, min(chin_size) * 0.22),
        )

    face_y = -head_d * (0.92 if chibi else 0.88)

    # 2. The NPC reference uses a small rounded storybook nose; the adult
    # worker keeps the sharper planar wedge.
    if chibi:
        add_ico(
            "character_nose",
            (0, face_y - head_d * 0.08, head_center_z - head_height * 0.025),
            (head_w * 0.18, head_d * 0.13, head_h * 0.15),
            skin_token,
            root,
            subdivisions=2,
        )
    else:
        add_tri_prism(
            "character_nose",
            (0, face_y - 0.015, head_center_z - head_height * 0.02),
            (0.040, 0.038, 0.055),
            skin_token,
            root,
        )

    # 3. Expressive Inset Eyes & Sculpted Brows
    eye_x = head_w * (0.40 if chibi else 0.42)
    eye_z = head_center_z + head_height * (0.055 if chibi else 0.06)
    brow_z = head_center_z + head_height * (0.17 if chibi else 0.16)

    for side, x in (("left", -eye_x), ("right", eye_x)):
        sign = -1.0 if side == "left" else 1.0
        # Warm sclera plus a smaller dark iris keeps the face readable at the
        # gameplay camera while preserving the faceted storybook construction.
        add_ico(
            f"character_eye_white_{side}",
            (x, face_y - 0.004, eye_z),
            (
                head_w * 0.23 if chibi else 0.036,
                head_d * 0.070 if chibi else 0.016,
                head_h * 0.25 if chibi else 0.038,
            ),
            "foam_warm_01",
            root,
            subdivisions=3 if chibi else 2,
        )
        add_ico(
            f"character_eye_{side}",
            # -Y is forward. The iris used to sit 16mm *in front* of the sclera
            # and read as a protruding dark ball; it now nests just proud of it.
            (x, face_y - (0.008 if chibi else 0.006), eye_z),
            (
                head_w * 0.12 if chibi else 0.020,
                head_d * 0.067 if chibi else 0.014,
                head_h * 0.16 if chibi else 0.026,
            ),
            eye_token,
            root,
            subdivisions=3 if chibi else 2,
        )
        if chibi:
            add_ico(
                f"character_eye_glint_{side}",
                (x - sign * head_w * 0.032, face_y - head_d * 0.15, eye_z + head_h * 0.050),
                (head_w * 0.026, head_d * 0.022, head_h * 0.032),
                "foam_warm_01",
                root,
                subdivisions=1,
            )
        # Angled expressive brow ridge
        add_box(
            f"character_brow_{side}",
            (x, face_y - 0.006, brow_z),
            (head_w * 0.25 if chibi else 0.052, 0.018 if chibi else 0.016, head_h * 0.045 if chibi else 0.012),
            brow_token,
            root,
            rotation=(0, 0, sign * math.radians(6)),
            bevel=0.003,
        )
        # Rounded NPC ears preserve the soft outer contour. The player keeps
        # the sharper authored prism.
        if chibi:
            add_ico(
                f"character_ear_{side}",
                (sign * (head_w * 0.98), -0.01, head_center_z),
                (head_w * 0.12, head_d * 0.15, head_h * 0.20),
                skin_token,
                root,
                subdivisions=2,
            )
        else:
            add_tri_prism(
                f"character_ear_{side}",
                (sign * (head_w * 0.98), -0.01, head_center_z),
                (0.026, 0.045, 0.062),
                skin_token,
                root,
                rotation=(0, sign * math.radians(15), sign * math.radians(85)),
            )

        # Small cheek planes keep the face readable under a broad hat without
        # turning it into a smooth or overly expressive cartoon mask.
        add_ico(
            f"character_cheek_{side}",
            (x * (0.72 if chibi else 0.76), face_y + 0.006, head_center_z - head_height * (0.065 if chibi else 0.07)),
            (head_w * (0.20 if chibi else 0.17), head_d * (0.075 if chibi else 0.065), head_h * (0.15 if chibi else 0.13)),
            cheek_token or skin_token,
            root,
            subdivisions=2 if chibi else 1,
        )

    # 4. The reference smile is a primary identity cue, not a tiny neutral
    # dash. Two rising segments read as a warm smile without an ink outline.
    if chibi:
        mouth_center_z = head_center_z - head_height * 0.175
        mouth_half_width = head_w * 0.30
        mouth_y = face_y - head_d * 0.10
        for side, sign in (("left", -1.0), ("right", 1.0)):
            add_beam(
                f"character_mouth_{side}",
                (0, mouth_y, mouth_center_z),
                (sign * mouth_half_width, mouth_y, mouth_center_z + head_h * 0.055),
                max(0.005, head_height * 0.010),
                brow_token,
                root,
                vertices=6,
            )
    else:
        add_box(
            "character_mouth",
            (0, face_y - 0.006, head_center_z - head_height * 0.16),
            (0.046, 0.012, 0.008),
            brow_token,
            root,
            bevel=0.002,
        )

    if chibi:
        # Three asymmetric fringe clumps and curled side locks create the
        # reference's authored hair breaks instead of a helmet-like dome.
        for index, (x, z, sx, sz, rotation) in enumerate((
            (-head_w * 0.28, head_center_z + head_h * 0.67, head_w * 0.29, head_h * 0.24, -10),
            (head_w * 0.04, head_center_z + head_h * 0.72, head_w * 0.34, head_h * 0.27, 7),
            (head_w * 0.32, head_center_z + head_h * 0.62, head_w * 0.24, head_h * 0.22, 16),
        )):
            add_ico(
                f"character_hair_fringe_{index}",
                (x, -head_d * 0.72, z),
                (sx, head_d * 0.20, sz),
                hair_token,
                root,
                subdivisions=max(2, subdivisions - 1),
                rotation=(0, math.radians(rotation), 0),
            )
        for side, sign in (("left", -1.0), ("right", 1.0)):
            for index, z_offset in enumerate((0.02, -0.16)):
                add_ico(
                    f"character_hair_side_{side}_{index}",
                    (
                        sign * head_w * (0.88 + index * 0.015),
                        -head_d * (0.34 + index * 0.18),
                        head_center_z + head_h * z_offset,
                    ),
                    (head_w * 0.13, head_d * 0.16, head_h * 0.18),
                    hair_token,
                    root,
                    subdivisions=max(2, subdivisions - 1),
                    rotation=(math.radians(sign * (12 + index * 10)), 0, math.radians(sign * 12)),
                )


def _build_stylized_limbs_and_boots(
    root,
    height: float,
    hand_scale: float,
    skin_token: str,
    trouser_token: str,
    shirt_token: str,
    boot_token: str,
    cuff_token: str,
    bare_forearms: bool = False,
    spec: dict | None = None,
) -> None:
    """Builds connected tapered limbs, rolled cuffs, readable hands, and grounded boots."""
    lod0 = spec is None or spec.get("_lodIndex", 0) == 0
    chibi = _is_chibi_npc(spec)
    # The lofted-tube rebuild is far cheaper than the beam-plus-sphere clusters
    # it replaced, which left several thousand triangles unspent against the
    # authored budget. Spending them on limb roundness is the visible win.
    tube_sides = (14 if lod0 else 8) if chibi else (12 if lod0 else 6)
    proportions = _character_proportions(spec)
    role = ((spec or {}).get("parameters") or {}).get("role")
    short_trousers = chibi and role in ("gardener", "merchant")
    limb_mass = 1.04 if chibi else 1.0
    boot_mass = 1.04 if chibi else 1.0

    # 1. Legs: overlapping rigid thigh/shin masses preserve the faceted shape
    # under deep gait flexion; a small knee cover hides the shared pivot.
    for side, x in (("left", -proportions["leg_x"]), ("right", proportions["leg_x"])):
        knee_x = math.copysign(proportions["knee_x"], x)
        hip = (x, 0.0, height * proportions["hip"])
        knee = (knee_x, -proportions["knee_prebend"], height * proportions["knee"])
        ankle = (knee_x, -0.012, height * proportions["ankle"])
        thigh_upper = (
            x + (knee_x - x) * 0.18,
            -proportions["knee_prebend"] * 0.18,
            height * (proportions["hip"] - (proportions["hip"] - proportions["knee"]) * 0.18),
        )
        add_limb_tube(
            f"character_thigh_{side}",
            (hip, thigh_upper, knee),
            tuple(radius * limb_mass for radius in (0.136, 0.128, 0.104)),
            trouser_token,
            root,
            sides=tube_sides,
        )
        lower_leg_token = skin_token if short_trousers else trouser_token
        add_limb_tube(
            f"character_shin_{side}",
            (knee, ankle),
            tuple(radius * limb_mass for radius in (0.101, 0.079)),
            lower_leg_token,
            root,
            sides=tube_sides,
        )
        add_ico(
            f"character_knee_{side}", knee, tuple(radius * limb_mass for radius in (0.108, 0.105, 0.108)),
            lower_leg_token, root, subdivisions=2 if chibi else 1,
        )
        cuff_z = (
            height * (proportions["knee"] + 0.030)
            if short_trousers
            else height * (proportions["ankle"] + (proportions["knee"] - proportions["ankle"]) * 0.26)
        )
        add_ring(
            f"character_trouser_cuff_{side}",
            (knee_x, -0.012, cuff_z),
            0.102 * limb_mass,
            0.024 * limb_mass,
            trouser_token if short_trousers else cuff_token,
            root,
            major_segments=10 if chibi else 8,
            minor_segments=4,
        )

        # Boot: heel block, sole, and a toe cap that sits under rig_toe_{side}
        # so toe-off rolls the front of the foot rather than pivoting the slab.
        if chibi:
            add_ico(
                f"character_boot_{side}",
                (knee_x, -0.020, 0.105),
                (0.105 * boot_mass, 0.105 * boot_mass, 0.105 * boot_mass),
                boot_token,
                root,
                subdivisions=2,
            )
            add_ico(
                f"character_boot_toe_{side}",
                (knee_x, -0.125 * boot_mass, 0.070),
                (0.112 * boot_mass, 0.145 * boot_mass, 0.075 * boot_mass),
                boot_token,
                root,
                subdivisions=2,
            )
            add_box(
                f"character_boot_sole_{side}",
                (knee_x, -0.075, 0.022),
                (0.225 * boot_mass, 0.315 * boot_mass, 0.040 * boot_mass),
                boot_token,
                root,
                bevel=0.018,
            )
            add_box(f"character_boot_lace_{side}", (knee_x, -0.125, 0.125), (0.110, 0.018, 0.014), cuff_token, root, bevel=0.004)
        else:
            add_box(f"character_boot_{side}", (knee_x, -0.045, 0.078), (0.18 * boot_mass, 0.23 * boot_mass, 0.14 * boot_mass), boot_token, root, bevel=0.026)
            add_box(f"character_boot_sole_{side}", (knee_x, -0.035, 0.018), (0.20 * boot_mass, 0.25 * boot_mass, 0.038 * boot_mass), boot_token, root, bevel=0.012)
            add_box(f"character_boot_toe_{side}", (knee_x, -0.195 * boot_mass, 0.052), (0.17 * boot_mass, 0.13 * boot_mass, 0.078 * boot_mass), boot_token, root, bevel=0.024)
            add_box(f"character_boot_toe_sole_{side}", (knee_x, -0.195 * boot_mass, 0.017), (0.19 * boot_mass, 0.14 * boot_mass, 0.034 * boot_mass), boot_token, root, bevel=0.010)
            add_box(f"character_boot_lace_{side}_0", (knee_x, -0.135 * boot_mass, 0.098), (0.100 * boot_mass, 0.018 * boot_mass, 0.012), cuff_token, root, bevel=0.003)
            add_box(f"character_boot_lace_{side}_1", (knee_x, -0.125 * boot_mass, 0.127), (0.100 * boot_mass, 0.018 * boot_mass, 0.012), cuff_token, root, bevel=0.003)

    # 2. Arms use the same segmented construction so the elbow can fold without
    # dragging vest or sleeve vertices across the torso.
    for side, x in (("left", -proportions["wrist_x"]), ("right", proportions["wrist_x"])):
        sign = -1.0 if side == "left" else 1.0
        forearm_mat = skin_token if bare_forearms else shirt_token
        deltoid = (sign * proportions["deltoid_x"], 0.0, height * (proportions["shoulder"] + 0.020))
        shoulder = (sign * proportions["shoulder_x"], 0.0, height * proportions["shoulder"])
        elbow = (sign * proportions["elbow_x"], -0.006, height * proportions["elbow"])
        wrist = (sign * proportions["wrist_x"], -0.020, height * proportions["wrist"])
        upper_mid = (
            sign * proportions["arm_mid_x"],
            -0.003,
            height * ((proportions["shoulder"] + proportions["elbow"]) * 0.5),
        )
        add_limb_tube(
            f"character_upper_arm_{side}",
            (deltoid, shoulder, upper_mid, elbow),
            tuple(radius * limb_mass for radius in (0.102, 0.116, 0.100, 0.088)),
            shirt_token,
            root,
            sides=tube_sides,
        )
        add_limb_tube(
            f"character_forearm_{side}",
            (elbow, wrist),
            tuple(radius * limb_mass for radius in (0.088, 0.073)),
            forearm_mat,
            root,
            sides=tube_sides,
        )
        add_ico(
            f"character_elbow_{side}", elbow, tuple(radius * limb_mass for radius in (0.091, 0.087, 0.091)),
            forearm_mat, root, subdivisions=1,
        )
        add_ring(
            f"character_sleeve_cuff_{side}", (x - sign * 0.003, -0.018, height * proportions["cuff"]),
            0.078 * limb_mass, 0.018 * limb_mass, cuff_token, root, major_segments=8, minor_segments=4,
        )

        # 3. Hands: a palm slab with a fused finger block and a separate thumb.
        # The old hand was an ico-sphere with four 2 cm nubs behind it, which
        # read as a plain ball at any gameplay distance and gave a held tool
        # nothing to sit against.
        hand_prefix = _character_prefix(spec) if spec else "char_player"
        # The palm hangs directly off the wrist ring. The old ico hand centred at
        # 0.288h and only reached the arm because it was a 9.6 cm sphere; a
        # correctly sized palm at that centre leaves a visible gap.
        palm_width = 0.090 * hand_scale * (1.04 if chibi else 1.0)
        palm_depth = 0.058 * hand_scale * (1.04 if chibi else 1.0)
        palm_height = 0.100 * hand_scale * (1.04 if chibi else 1.0)
        hand_z = height * proportions["wrist"] - palm_height * 0.44
        add_box(
            f"{hand_prefix}_hand_{side}",
            (x, -0.030, hand_z),
            (palm_width, palm_depth, palm_height),
            skin_token,
            root,
            bevel=0.018 * hand_scale,
        )
        if lod0:
            # Fingers fuse into one angled block: readable silhouette, and it
            # curls toward the palm so a gripped tool reads as held.
            add_box(
                f"character_finger_{side}_block",
                (x, -0.052 * hand_scale, hand_z - palm_height * 0.62),
                (palm_width * 0.94, palm_depth * 1.05, palm_height * 0.52),
                skin_token,
                root,
                rotation=(math.radians(15), 0.0, 0.0),
                bevel=0.012 * hand_scale,
            )
            add_box(
                f"character_finger_{side}_thumb",
                (x - sign * palm_width * 0.56, -0.044 * hand_scale, hand_z - palm_height * 0.12),
                (palm_width * 0.34, palm_depth * 0.86, palm_height * 0.44),
                skin_token,
                root,
                rotation=(math.radians(10), 0.0, sign * math.radians(22)),
                bevel=0.010 * hand_scale,
            )


def coastal_worker(spec: dict, root) -> None:
    height = spec["parameters"].get("height", 1.98)
    if spec.get("lodLevels") and spec.get("_lodIndex") is None:
        rig = _create_character_rig(root, height, spec)
        for lod_index, lod_root in create_lod_roots(spec, root):
            lod_spec = {**spec, "parameters": dict(spec["parameters"]), "_lodIndex": lod_index}
            _build_coastal_worker(lod_spec, lod_root)
            _bind_character_meshes(lod_root, rig, lod_spec, lod_index)
        prefix = _character_prefix(spec)
        sockets = spec.get("socketNodes") or [
            f"{prefix}_hand_socket_left",
            f"{prefix}_hand_socket_right",
            f"{prefix}_tool_socket",
            f"{prefix}_carry_socket",
            f"{prefix}_hip_socket",
        ]
        _add_character_sockets(spec, rig, height, sockets)
        _author_character_actions(spec, rig)
        return
    _build_coastal_worker(spec, root)


def _build_coastal_worker(spec: dict, root) -> None:
    palette = spec["palette"]
    skin = palette[0]
    shirt = palette[1]
    dark = palette[2]
    canvas = palette[3] if len(palette) > 3 else palette[1]
    band_color = palette[4] if len(palette) > 4 else dark
    trousers = palette[5] if len(palette) > 5 else dark

    params = spec["parameters"]
    height = params.get("height", 1.98)
    head_ratio = params.get("headRatio", 4.8)
    head_height = height / head_ratio
    head_half_height = head_height * 0.5
    head_half_width = head_height * 0.46
    head_half_depth = head_height * 0.44
    head_center_z = height * 0.82
    hand_scale = params.get("handScale", 1.05)

    detail = spec.get("_lodIndex", 0) == 0
    ico_div = 3 if detail else 1

    # 1. Torso & Pelvis
    add_ico("character_torso", (0, 0, height * 0.58), (0.26, 0.18, 0.38), shirt, root, subdivisions=ico_div)
    # Fills the hip mass between the belt and the raised leg tops.
    add_ico("character_pelvis", (0, 0.01, height * 0.415), (0.255, 0.19, 0.165), trousers, root, subdivisions=ico_div)

    # 2. Conforming Leather Explorer Vest
    add_ico("character_vest_body", (0, -0.02, height * 0.58), (0.28, 0.195, 0.34), canvas, root, subdivisions=ico_div)
    # V-Neck & Lapels
    for side, x in (("left", -0.15), ("right", 0.15)):
        sign = -1.0 if side == "left" else 1.0
        # Shorter and flatter than before: at 0.28 deep these read as horns
        # from any side angle rather than as a lapel lying on the chest.
        add_tri_prism(
            f"character_vest_lapel_{side}",
            (x * 0.92, -0.185, height * 0.615),
            (0.10, 0.022, 0.17),
            canvas,
            root,
            rotation=(0, sign * math.radians(10), 0),
        )
        add_box(f"character_vest_pocket_{side}", (x, -0.21, height * 0.51), (0.11, 0.03, 0.09), canvas, root, bevel=0.012)
        if spec.get("_lodIndex", 0) == 0:
            add_box(f"character_vest_pocket_upper_{side}", (x, -0.21, height * 0.58), (0.10, 0.03, 0.08), canvas, root, bevel=0.012)

    add_box("character_belt", (0, -0.01, height * 0.41), (0.50, 0.30, 0.08), dark, root, bevel=0.015)
    add_box("character_belt_buckle", (0, -0.16, height * 0.41), (0.10, 0.025, 0.09), canvas, root, bevel=0.008)
    if detail:
        add_fasteners(
            "character_vest_button",
            tuple((0, -0.21, height * (0.50 + index * 0.045)) for index in range(4)),
            0.012,
            dark,
            root,
            depth=0.025,
        )

    # 3. Limbs and Boots
    _build_stylized_limbs_and_boots(root, height, hand_scale, skin, trousers, shirt, dark, canvas, spec=spec)

    # 4. Stylized Head & Facial Features
    neck_z = head_center_z - head_half_height * 0.90
    add_cylinder("character_neck", (0, 0, neck_z), 0.085, 0.12, skin, root, vertices=8, bevel=0.012)
    _build_stylized_head_and_face(root, head_center_z, head_height, skin, dark, dark, dark, role="player", subdivisions=ico_div)

    # 5. Sculpted Hair (Swept Explorer Cut conforming to skull)
    hair_z = head_center_z + head_half_height * 0.20
    add_ico("character_hair_cap", (0, 0.02, hair_z), (head_half_width * 1.04, head_half_depth * 1.04, head_half_height * 0.78), dark, root, subdivisions=ico_div)
    if detail:
        add_ico("character_hair_fringe", (0.05, -head_half_depth * 0.78, head_center_z + head_half_height * 0.35), (0.12, 0.06, 0.08), dark, root, subdivisions=3)
        add_ico("character_hair_side_left", (-head_half_width * 0.95, 0.03, head_center_z + head_half_height * 0.18), (0.045, 0.065, 0.075), dark, root, subdivisions=3)
        add_ico("character_hair_side_right", (head_half_width * 0.95, 0.03, head_center_z + head_half_height * 0.18), (0.045, 0.065, 0.075), dark, root, subdivisions=3)

    # 6. Snug Straw Expedition Hat (Correct crown recess seated on hair)
    hat_seat_z = head_center_z + head_half_height * 0.38
    brim_radius = 0.255
    add_cylinder("character_hat_crown", (0, 0.01, hat_seat_z + 0.09), 0.20, 0.14, canvas, root, vertices=10, bevel=0.020, rotation=(math.radians(3), 0, 0))
    add_cylinder("character_hat_brim", (0, -0.01, hat_seat_z + 0.02), brim_radius, 0.035, canvas, root, vertices=12, bevel=0.010, rotation=(math.radians(3), 0, 0))
    if detail:
        add_ring("character_hat_band", (0, 0.01, hat_seat_z + 0.035), 0.205, 0.020, band_color, root, major_segments=10, minor_segments=4, rotation=(math.radians(3), 0, 0))


    # 7. Framed Expedition Backpack (Snug fit to back)
    add_box("character_backpack", (0, 0.18, height * 0.57), (0.40, 0.20, 0.46), canvas, root, bevel=0.045)
    add_cylinder("character_pack_roll", (0, 0.21, height * 0.72), 0.105, 0.36, canvas, root, vertices=8, rotation=(0, math.pi / 2, 0), bevel=0.016)
    if detail:
        add_ring("character_pack_roll_left", (-0.17, 0.21, height * 0.72), 0.110, 0.016, dark, root, major_segments=8, minor_segments=4, rotation=(0, math.pi / 2, 0))
        add_ring("character_pack_roll_right", (0.17, 0.21, height * 0.72), 0.110, 0.016, dark, root, major_segments=8, minor_segments=4, rotation=(0, math.pi / 2, 0))
        for side, x in (("left", -0.17), ("right", 0.17)):
            add_rope_line(
                f"character_pack_strap_{side}",
                [(x, 0.19, height * 0.72), (x * 1.16, -0.13, height * 0.62), (x * 1.04, -0.12, height * 0.47)],
                0.022, dark, root, vertices=6,
            )
            add_ico(f"character_pack_pouch_{side}", (x * 1.18, 0.22, height * 0.49), (0.085, 0.07, 0.115), canvas, root, subdivisions=2)
    add_box("character_pack_flap", (0, 0.29, height * 0.57), (0.34, 0.045, 0.20), dark, root, bevel=0.018)
    add_box("character_pack_buckle", (0, 0.315, height * 0.54), (0.07, 0.018, 0.07), canvas, root, bevel=0.007)
    for side, x in (("left", -0.25), ("right", 0.25)):
        add_cylinder(f"character_pack_canteen_{side}", (x, 0.15, height * 0.50), 0.064, 0.14, dark, root, vertices=8, bevel=0.0)
        if detail:
            add_cylinder(f"character_pack_canteen_cap_{side}", (x, 0.15, height * 0.575), 0.027, 0.035, canvas, root, vertices=6, bevel=0.0)
            add_rope_line(
                f"character_pack_canteen_strap_{side}",
                [(x, 0.20, height * 0.56), (x * 1.04, 0.15, height * 0.50), (x, 0.10, height * 0.47)],
                0.014, dark, root, vertices=5,
            )
    if spec.get("_lodIndex", 0) == 0:
        add_box("character_pack_lower_pocket", (0, 0.29, height * 0.47), (0.20, 0.05, 0.12), canvas, root, bevel=0.014)
        add_box("character_pack_strap_buckle_left", (-0.19, -0.14, height * 0.54), (0.05, 0.03, 0.04), canvas, root, bevel=0.006)
        add_box("character_pack_strap_buckle_right", (0.19, -0.14, height * 0.54), (0.05, 0.03, 0.04), canvas, root, bevel=0.006)
        add_lattice(
            "character_pack_frame",
            (0, 0.28, height * 0.57),
            0.34,
            0.38,
            dark,
            root,
            columns=3,
            rows=3,
            depth=0.018,
        )
        add_box("character_pack_bedroll_ties", (0, 0.21, height * 0.72), (0.38, 0.035, 0.035), dark, root, bevel=0.007)
        for side, x in (("left", -0.14), ("right", 0.14)):
            add_box(f"character_boot_heel_{side}", (x, 0.055, 0.028), (0.16, 0.10, 0.052), dark, root, bevel=0.009)
            add_box(f"character_boot_tongue_{side}", (x, -0.145, 0.105), (0.09, 0.035, 0.085), dark, root, bevel=0.007)
        add_ring(
            "character_hat_under_brim",
            (0, -0.01, hat_seat_z + 0.008),
            0.30, 0.016, canvas, root,
            major_segments=12, minor_segments=4, rotation=(math.radians(3), 0, 0),
        )
        add_ico(
            "character_hat_crown_facet",
            (0, 0.02, hat_seat_z + 0.14),
            (0.16, 0.16, 0.08), canvas, root, subdivisions=3,
            rotation=(math.radians(3), 0, 0),
        )
        add_ico(
            "character_pack_bedroll_end",
            (0.19, 0.21, height * 0.72),
            (0.07, 0.07, 0.07), canvas, root, subdivisions=3,
        )
        add_ico(
            "character_hair_back",
            (0, 0.12, head_center_z + 0.02),
            (0.10, 0.08, 0.10), dark, root, subdivisions=3,
        )
        add_ico(
            "character_pack_body_facet",
            (0, 0.24, height * 0.57),
            (0.16, 0.07, 0.16), canvas, root, subdivisions=3,
        )

    if not spec.get("lodLevels"):
        _rig_character(spec, root, height)


def npc_character(spec: dict, root) -> None:
    """Procedural stylized NPC generator with bespoke role-specific outfits, hairstyles, and accessories."""
    height = spec.get("parameters", {}).get("height", 1.95)
    if spec.get("lodLevels") and spec.get("_lodIndex") is None:
        rig = _create_character_rig(root, height, spec)
        for lod_index, lod_root in create_lod_roots(spec, root):
            lod_spec = {**spec, "parameters": dict(spec["parameters"]), "_lodIndex": lod_index}
            _build_npc_character(lod_spec, lod_root)
            _bind_character_meshes(lod_root, rig, lod_spec, lod_index)
        prefix = _character_prefix(spec)
        sockets = spec.get("socketNodes") or [
            f"{prefix}_hand_socket_left",
            f"{prefix}_hand_socket_right",
            f"{prefix}_tool_socket",
            f"{prefix}_carry_socket",
            f"{prefix}_hip_socket",
        ]
        _add_character_sockets(spec, rig, height, sockets)
        _author_character_actions(spec, rig)
        return
    _build_npc_character(spec, root)


def _build_npc_character(spec: dict, root) -> None:
    palette = spec["palette"]
    skin = palette[0]
    garment_primary = palette[1]
    dark = palette[2]
    garment_secondary = palette[3] if len(palette) > 3 else palette[1]
    accent = palette[4] if len(palette) > 4 else palette[3] if len(palette) > 3 else palette[2]

    params = spec.get("parameters", {})
    role = params.get("role", "gardener")
    chibi = _is_chibi_npc(spec)
    height = params.get("height", 1.95)
    head_ratio = params.get("headRatio", 4.7)
    head_height = height / head_ratio
    head_half_height = head_height * (0.60 if chibi else 0.50)
    head_half_width = head_height * (0.56 if chibi else 0.46)
    head_half_depth = head_height * (0.50 if chibi else 0.44)
    head_center_z = height * (0.76 if chibi else 0.82)
    hand_scale = params.get("handScale", 1.05)
    detail = spec.get("_lodIndex", 0) == 0
    ico_div = 3 if detail else 1
    torso_z = height * (0.51 if chibi else 0.58)
    pelvis_z = height * (0.34 if chibi else 0.38)
    apron_z = height * (0.52 if chibi else 0.58)
    waist_z = height * (0.35 if chibi else 0.40)
    skirt_z = height * (0.33 if chibi else 0.38)
    strap_top_z = height * (0.60 if chibi else 0.65)
    strap_bottom_z = height * (0.57 if chibi else 0.62)
    arm_outer_x = 0.30 if chibi else 0.38
    arm_cuff_radius = 0.074 if chibi else 0.086

    # 1. Base Core Torso & Pelvis
    add_ico(
        "character_torso",
        (0, 0, torso_z),
        (0.29 if chibi else 0.28, 0.205 if chibi else 0.20, 0.31 if chibi else 0.38),
        garment_primary,
        root,
        subdivisions=ico_div,
    )
    add_ico(
        "character_pelvis",
        (0, 0.01, pelvis_z),
        (0.27 if chibi else 0.26, 0.195 if chibi else 0.19, 0.18 if chibi else 0.18),
        dark,
        root,
        subdivisions=ico_div,
    )

    # 2. Base Limbs & Boots
    bare_arms = role in ("handyman", "merchant")
    _build_stylized_limbs_and_boots(root, height, hand_scale, skin, dark, garment_primary, dark, garment_secondary, bare_forearms=bare_arms, spec=spec)

    # 3. Base Stylized Head & Facial Features
    neck_z = head_center_z - head_half_height * 0.90
    add_cylinder(
        "character_neck",
        (0, 0, neck_z),
        0.078 if chibi else 0.085,
        0.11 if chibi else 0.12,
        skin,
        root,
        vertices=8,
        bevel=0.012,
    )
    brow_color = accent if role == "dockmaster" else dark
    _build_stylized_head_and_face(
        root,
        head_center_z,
        head_height,
        skin,
        dark,
        brow_color,
        dark,
        role=role,
        subdivisions=ico_div,
        chibi=chibi,
    )

    # 4. --- ROLE-SPECIFIC BESPOKE OUTFITS, HEADWEAR & ACCESSORIES ---

    if role == "gardener":  # Elspeth: Garden Elder & Baker
        hair_z = head_center_z + head_half_height * (0.36 if chibi else 0.25)
        silver_token = dark if chibi else garment_secondary
        add_ico("character_hair_cap", (0, 0.04 if chibi else 0.02, hair_z), (head_half_width * (0.98 if chibi else 1.04), head_half_depth * (0.94 if chibi else 1.04), head_half_height * (0.82 if chibi else 0.80)), silver_token, root, subdivisions=ico_div)
        if detail:
            add_ico("character_hair_bun", (0, 0.16, hair_z + 0.02), (0.13, 0.12, 0.13), silver_token, root, subdivisions=3)
            add_ico("character_hair_lock_left", (-head_half_width * 0.88, -0.04, head_center_z - 0.01), (0.05, 0.06, 0.10), silver_token, root, subdivisions=3)
            add_ico("character_hair_lock_right", (head_half_width * 0.88, -0.04, head_center_z - 0.01), (0.05, 0.06, 0.10), silver_token, root, subdivisions=3)
            add_ring("character_hair_braid_wrap", (0, 0.16, hair_z + 0.02), 0.14, 0.022, silver_token, root, major_segments=10, minor_segments=4)

        bonnet_z = head_center_z + head_half_height * (0.28 if chibi else 0.32)
        bonnet_radius = head_half_width * (0.78 if chibi else 0.98)
        bonnet_brim_radius = head_half_width * (1.12 if chibi else 1.58)
        bonnet_tilt = math.radians(4 if chibi else 16)
        add_cylinder("character_bonnet_crown", (0, 0.04, bonnet_z + 0.07), bonnet_radius, 0.11 if chibi else 0.14, garment_secondary, root, vertices=10, bevel=0.018, rotation=(bonnet_tilt, 0, 0))
        add_cylinder("character_bonnet_brim", (0, -0.02, bonnet_z + 0.01), bonnet_brim_radius, 0.024 if chibi else 0.035, garment_secondary, root, vertices=12, bevel=0.010, rotation=(bonnet_tilt, 0, 0))
        add_ring("character_bonnet_band", (0, 0.03, bonnet_z + 0.025), bonnet_radius * 1.02, 0.016 if chibi else 0.020, accent, root, major_segments=10, minor_segments=4, rotation=(bonnet_tilt, 0, 0))
        if detail:
            ribbon_x = head_half_width * (0.72 if chibi else 0.76)
            add_rope_line("character_bonnet_ribbon_left", [(-ribbon_x, 0.0, bonnet_z + 0.02), (-ribbon_x * 0.5, -0.08, neck_z), (0, -0.10, neck_z - 0.02)], 0.012, accent, root, vertices=5)
            add_rope_line("character_bonnet_ribbon_right", [(ribbon_x, 0.0, bonnet_z + 0.02), (ribbon_x * 0.5, -0.08, neck_z), (0, -0.10, neck_z - 0.02)], 0.012, accent, root, vertices=5)

        add_ico("character_apron_bib", (0, -0.03, apron_z), (0.30, 0.205, 0.30 if chibi else 0.32), garment_secondary, root, subdivisions=ico_div)
        add_box("character_apron_skirt", (0, -0.10 if chibi else -0.04, waist_z), (0.42, 0.26, 0.25 if chibi else 0.28), garment_secondary, root, bevel=0.025)
        add_box("character_dress_skirt", (0, -0.07 if chibi else 0.0, skirt_z), (0.46, 0.30, 0.28 if chibi else 0.32), garment_primary, root, bevel=0.030)
        for side, x in (("left", -0.14), ("right", 0.14)):
            add_beam(f"character_apron_strap_{side}", (x, -0.16, strap_top_z), (x * 0.9, 0.16, strap_bottom_z), 0.025, garment_secondary, root, vertices=4)
        if detail:
            add_box("character_apron_pocket", (0, -0.18, height * 0.44), (0.20, 0.025, 0.12), accent, root, bevel=0.008)
            add_box("character_apron_buckle_left", (-0.14, -0.18, height * 0.60), (0.04, 0.02, 0.04), dark, root, bevel=0.003)
            add_box("character_apron_buckle_right", (0.14, -0.18, height * 0.60), (0.04, 0.02, 0.04), dark, root, bevel=0.003)
            add_box("character_trowel_holster", (0.24, -0.02, height * 0.41), (0.07, 0.10, 0.16), dark, root, bevel=0.010)
            add_cylinder("character_trowel_handle", (0.24, -0.02, height * 0.51), 0.018, 0.11, garment_primary, root, vertices=6)
            add_tri_prism("character_trowel_blade", (0.24, -0.02, height * 0.35), (0.05, 0.02, 0.09), accent, root)
            add_ring("character_trowel_ring", (0.24, -0.02, height * 0.46), 0.032, 0.008, accent, root, major_segments=8, minor_segments=4)
            # Woven seed foraging pouch & herbal cuttings
            add_ico("character_seed_pouch", (-0.23, -0.02, height * 0.42), (0.09, 0.10, 0.12), accent, root, subdivisions=3)
            add_box("character_seed_pouch_flap", (-0.23, -0.06, height * 0.46), (0.09, 0.04, 0.05), garment_secondary, root, bevel=0.006)
            add_ico("character_herb_cluster", (0.12, -0.16, height * 0.63), (0.06, 0.05, 0.08), accent, root, subdivisions=2)
            add_ring("character_sleeve_guard_left", (-arm_outer_x, -0.02, height * (0.38 if chibi else 0.42)), arm_cuff_radius, 0.022 if chibi else 0.024, garment_secondary, root, major_segments=10, minor_segments=4)
            add_ring("character_sleeve_guard_right", (arm_outer_x, -0.02, height * (0.38 if chibi else 0.42)), arm_cuff_radius, 0.022 if chibi else 0.024, garment_secondary, root, major_segments=10, minor_segments=4)

    elif role == "handyman":  # Barnaby: Craftsman & Handyman
        hair_z = head_center_z + head_half_height * (0.32 if chibi else 0.20)
        add_ico("character_hair_cap", (0, 0.04 if chibi else 0.01, hair_z), (head_half_width * (0.98 if chibi else 1.03), head_half_depth * (0.94 if chibi else 1.03), head_half_height * (0.80 if chibi else 0.75)), dark, root, subdivisions=ico_div)

        cap_z = head_center_z + head_half_height * (0.24 if chibi else 0.28)
        cap_radius = head_half_width * (0.90 if chibi else 1.0)
        add_cylinder("character_hat_cap", (0, 0.02, cap_z + 0.05), cap_radius, 0.075 if chibi else 0.10, garment_secondary, root, vertices=12, bevel=0.018, rotation=(math.radians(3), 0, 0))
        add_box("character_hat_peak", (0, -0.13 if chibi else -0.16, cap_z + 0.01), (0.19 if chibi else 0.22, 0.10 if chibi else 0.12, 0.020 if chibi else 0.022), dark, root, rotation=(math.radians(10 if chibi else 14), 0, 0), bevel=0.006)
        if detail:
            add_ico("character_hat_button", (0, 0.02, cap_z + 0.12), (0.035, 0.035, 0.025), dark, root, subdivisions=2)
            hat_side_x = head_half_width * (0.78 if chibi else 0.82)
            add_ico("character_hat_side_left", (-hat_side_x, 0.02, cap_z + 0.04), (0.06 if chibi else 0.08, 0.13 if chibi else 0.16, 0.05 if chibi else 0.06), garment_secondary, root, subdivisions=3)
            add_ico("character_hat_side_right", (hat_side_x, 0.02, cap_z + 0.04), (0.06 if chibi else 0.08, 0.13 if chibi else 0.16, 0.05 if chibi else 0.06), garment_secondary, root, subdivisions=3)

        add_ico("character_apron_bib", (0, -0.03, apron_z), (0.31 if chibi else 0.32, 0.205 if chibi else 0.21, 0.31 if chibi else 0.34), garment_secondary, root, subdivisions=ico_div)
        add_box("character_apron_skirt", (0, -0.11 if chibi else -0.05, waist_z), (0.44, 0.28, 0.27 if chibi else 0.30), garment_secondary, root, bevel=0.025)
        add_box("character_tool_belt", (0, -0.01, waist_z), (0.52, 0.32, 0.085), dark, root, bevel=0.015)
        add_box("character_belt_buckle", (0, -0.17, waist_z), (0.11, 0.025, 0.085), accent, root, bevel=0.008)
        for side, x in (("left", -0.14), ("right", 0.14)):
            add_beam(f"character_apron_strap_{side}", (x, -0.16, strap_top_z), (x * 0.9, 0.16, strap_bottom_z), 0.028, dark, root, vertices=4)
        if detail:
            add_beam("character_ear_pencil", (head_half_width * 0.95, -0.02, head_center_z + 0.02), (head_half_width * 0.90, -0.14, head_center_z + 0.07), 0.010, accent, root, vertices=6)
            add_box("character_apron_pocket", (0, -0.19, height * 0.54), (0.22, 0.025, 0.12), garment_secondary, root, bevel=0.008)
            add_box("character_ruler_wood", (0.06, -0.20, height * 0.60), (0.03, 0.015, 0.12), garment_primary, root, rotation=(0, 0, math.radians(10)), bevel=0.002)
            add_tri_prism("character_chisel_metal", (-0.06, -0.20, height * 0.61), (0.025, 0.015, 0.10), accent, root, rotation=(0, 0, math.radians(-8)))
            # Hammer holster and detailed toolhead
            add_cylinder("character_hammer_handle", (-0.26, -0.04, height * 0.37), 0.018, 0.26, garment_primary, root, vertices=6)
            add_box("character_hammer_head", (-0.26, -0.04, height * 0.48), (0.05, 0.10, 0.05), accent, root, bevel=0.006)
            add_tri_prism("character_hammer_peen", (-0.26, 0.02, height * 0.48), (0.045, 0.05, 0.045), accent, root, rotation=(math.radians(180), 0, 0))
            add_ring("character_hammer_holster", (-0.26, -0.04, height * 0.44), 0.045, 0.014, dark, root, major_segments=8, minor_segments=4)
            # Fastener pouch on right hip & heavy steel work toecaps
            add_ico("character_nail_pouch", (0.24, -0.02, height * 0.40), (0.10, 0.11, 0.12), dark, root, subdivisions=3)
            add_box("character_nail_pouch_flap", (0.24, -0.06, height * 0.44), (0.10, 0.04, 0.05), garment_secondary, root, bevel=0.006)
            add_ico("character_boot_toecap_left", (-0.14 * 1.02, -0.20, 0.088), (0.11, 0.08, 0.07), accent, root, subdivisions=3)
            add_ico("character_boot_toecap_right", (0.14 * 1.02, -0.20, 0.088), (0.11, 0.08, 0.07), accent, root, subdivisions=3)
            add_fasteners("character_tool_belt_stud", tuple((math.cos(a) * 0.27, math.sin(a) * 0.17 - 0.01, height * 0.41) for a in [-0.8, -0.4, 0.4, 0.8]), 0.010, accent, root, depth=0.015)

    elif role == "dockmaster":  # Old Silas: Harbor Dockmaster
        beard_color = "foam_warm_01"
        face_y = -head_half_depth * 0.88
        add_ico("character_beard_chin", (0, face_y - 0.01, head_center_z - head_height * 0.26), (0.10, 0.09, 0.14), beard_color, root, subdivisions=ico_div)
        add_ico("character_beard_jaw_left", (-head_half_width * 0.65, -0.02, head_center_z - head_height * 0.20), (0.07, 0.09, 0.12), beard_color, root, subdivisions=3 if detail else 1)
        add_ico("character_beard_jaw_right", (head_half_width * 0.65, -0.02, head_center_z - head_height * 0.20), (0.07, 0.09, 0.12), beard_color, root, subdivisions=3 if detail else 1)
        hat_z = head_center_z + head_half_height * 0.30
        add_cylinder("character_hat_souwester_crown", (0, 0.01, hat_z + 0.07), 0.22, 0.13, dark, root, vertices=12, bevel=0.022, rotation=(math.radians(4), 0, 0))
        add_box("character_hat_souwester_front", (0, -0.15, hat_z + 0.02), (0.28, 0.10, 0.025), dark, root, rotation=(math.radians(22), 0, 0), bevel=0.008)
        add_box("character_hat_souwester_rear", (0, 0.16, hat_z - 0.01), (0.32, 0.20, 0.025), dark, root, rotation=(math.radians(-30), 0, 0), bevel=0.008)
        add_ring("character_hat_souwester_band", (0, 0.01, hat_z + 0.03), 0.225, 0.018, garment_primary, root, major_segments=12, minor_segments=4, rotation=(math.radians(4), 0, 0))
        add_ico("character_coat_body", (0, -0.01, apron_z), (0.32 if chibi else 0.33, 0.215 if chibi else 0.22, 0.34 if chibi else 0.40), dark, root, subdivisions=ico_div)
        add_box("character_coat_skirt", (0, -0.02, skirt_z), (0.48, 0.30, 0.28 if chibi else 0.32), dark, root, bevel=0.028)
        if detail:
            add_ico("character_beard_mustache", (0, face_y - 0.018, head_center_z - head_height * 0.10), (0.12, 0.04, 0.05), beard_color, root, subdivisions=2)
            add_ico("character_beard_mustache_tip_left", (-0.07, face_y - 0.02, head_center_z - head_height * 0.11), (0.045, 0.04, 0.045), beard_color, root, subdivisions=3)
            add_ico("character_beard_mustache_tip_right", (0.07, face_y - 0.02, head_center_z - head_height * 0.11), (0.045, 0.04, 0.045), beard_color, root, subdivisions=3)
            add_ico("character_beard_side_left", (-head_half_width * 0.72, -0.04, head_center_z - head_height * 0.14), (0.08, 0.09, 0.11), beard_color, root, subdivisions=3)
            add_ico("character_beard_side_right", (head_half_width * 0.72, -0.04, head_center_z - head_height * 0.14), (0.08, 0.09, 0.11), beard_color, root, subdivisions=3)
            add_cylinder("character_coat_collar", (0, 0, height * (0.66 if chibi else 0.70)), 0.14 if chibi else 0.16, 0.085 if chibi else 0.10, dark, root, vertices=10, bevel=0.016)
            add_tri_prism("character_coat_lapel_left", (-0.13, -0.18, height * (0.58 if chibi else 0.63)), (0.10 if chibi else 0.11, 0.035, 0.21 if chibi else 0.24), dark, root, rotation=(0, -math.radians(12), 0))
            add_tri_prism("character_coat_lapel_right", (0.13, -0.18, height * (0.58 if chibi else 0.63)), (0.10 if chibi else 0.11, 0.035, 0.21 if chibi else 0.24), dark, root, rotation=(0, math.radians(12), 0))
            add_rope_line("character_watch_chain", [(-0.12, -0.19, height * (0.57 if chibi else 0.61)), (0, -0.21, height * (0.53 if chibi else 0.57)), (0.12, -0.19, height * (0.57 if chibi else 0.61))], 0.010, garment_secondary, root, vertices=5)
            add_fasteners("character_coat_button", tuple((sign * 0.07, -0.19, height * ((0.46 if chibi else 0.50) + row * (0.055 if chibi else 0.06))) for row in range(3) for sign in [-1.0, 1.0]), 0.012, garment_secondary, root, depth=0.020)
            add_box("character_coat_pocket_left", (-0.18, -0.20, height * (0.40 if chibi else 0.44)), (0.12, 0.03, 0.09), dark, root, bevel=0.010)
            add_box("character_coat_pocket_right", (0.18, -0.20, height * (0.40 if chibi else 0.44)), (0.12, 0.03, 0.09), dark, root, bevel=0.010)
            # Dock line and spyglass accessories
            add_ring("character_dock_rope", (-0.25, -0.02, height * 0.40), 0.09, 0.022, garment_primary, root, major_segments=16, minor_segments=6, rotation=(math.radians(80), 0, math.radians(20)))
            add_cylinder("character_spyglass_body", (0.24, -0.03, height * 0.42), 0.022, 0.18, garment_secondary, root, vertices=12, bevel=0.006)
            add_ring("character_spyglass_ring", (0.24, -0.03, height * 0.48), 0.026, 0.008, garment_secondary, root, major_segments=12, minor_segments=4)
            add_ring("character_coat_cuff_left", (-arm_outer_x, -0.020, height * (0.32 if chibi else 0.36)), 0.078 if chibi else 0.092, 0.022 if chibi else 0.026, garment_primary, root, major_segments=12, minor_segments=4)
            add_ring("character_coat_cuff_right", (arm_outer_x, -0.020, height * (0.32 if chibi else 0.36)), 0.078 if chibi else 0.092, 0.022 if chibi else 0.026, garment_primary, root, major_segments=12, minor_segments=4)

    elif role == "merchant":  # Maeve: Fishmonger & Market Master
        hair_z = head_center_z + head_half_height * (0.36 if chibi else 0.25)
        add_ico("character_hair_cap", (0, 0.04 if chibi else 0.02, hair_z), (head_half_width * (0.98 if chibi else 1.04), head_half_depth * (0.94 if chibi else 1.04), head_half_height * (0.82 if chibi else 0.80)), dark, root, subdivisions=ico_div)
        add_ico("character_hair_bun", (0, 0.16, hair_z), (0.12, 0.11, 0.12), dark, root, subdivisions=ico_div)
        add_ring("character_neck_scarf", (0, -0.01, neck_z + 0.04), 0.12, 0.028, garment_secondary, root, major_segments=8, minor_segments=4)
        add_ico("character_apron_bib", (0, -0.03, apron_z), (0.295, 0.205, 0.30 if chibi else 0.32), garment_secondary, root, subdivisions=ico_div)
        add_box("character_apron_skirt", (0, -0.10 if chibi else -0.04, waist_z), (0.40, 0.26, 0.25 if chibi else 0.28), garment_secondary, root, bevel=0.022)
        add_box("character_dress_skirt", (0, -0.07 if chibi else 0.0, skirt_z), (0.44, 0.28, 0.28 if chibi else 0.32), garment_primary, root, bevel=0.026)
        if detail:
            add_ring("character_hair_braid", (0, 0.02, hair_z + 0.06), 0.18, 0.024, dark, root, major_segments=10, minor_segments=4, rotation=(math.radians(12), 0, 0))
            add_ico("character_hair_bun_swirl", (0, 0.17, hair_z + 0.05), (0.08, 0.07, 0.08), dark, root, subdivisions=3)
            add_ico("character_hair_lock_left", (-head_half_width * 0.88, -0.04, head_center_z - 0.01), (0.05, 0.06, 0.10), dark, root, subdivisions=3)
            add_ico("character_hair_lock_right", (head_half_width * 0.88, -0.04, head_center_z - 0.01), (0.05, 0.06, 0.10), dark, root, subdivisions=3)
            add_tri_prism("character_scarf_knot", (0, -0.12, neck_z + 0.02), (0.06, 0.03, 0.08), garment_secondary, root)
            add_box("character_scarf_tail_left", (-0.04, -0.14, neck_z - 0.04), (0.05, 0.02, 0.10), garment_secondary, root, rotation=(0, 0, -math.radians(12)), bevel=0.0)
            add_box("character_scarf_tail_right", (0.04, -0.14, neck_z - 0.04), (0.05, 0.02, 0.10), garment_secondary, root, rotation=(0, 0, math.radians(12)), bevel=0.0)
            add_box("character_apron_fold_left", (-0.12, -0.15, height * 0.40), (0.10, 0.02, 0.22), garment_secondary, root, bevel=0.0)
            add_box("character_apron_fold_right", (0.12, -0.15, height * 0.40), (0.10, 0.02, 0.22), garment_secondary, root, bevel=0.0)
            # Balance scale pin brooch
            add_cylinder("character_scale_pin", (-0.10, -0.18, height * 0.63), 0.024, 0.012, accent, root, vertices=6, rotation=(math.pi / 2, 0, 0))
            add_box("character_scale_pin_beam", (-0.10, -0.19, height * 0.64), (0.07, 0.012, 0.010), accent, root, bevel=0.001)
            add_ico("character_scale_pin_pan_left", (-0.13, -0.19, height * 0.62), (0.018, 0.012, 0.012), accent, root, subdivisions=2)
            add_ico("character_scale_pin_pan_right", (-0.07, -0.19, height * 0.62), (0.018, 0.012, 0.012), accent, root, subdivisions=2)
            # Merchant coin pouch, ledger scroll, and market keys
            add_ico("character_coin_pouch_body", (0.23, -0.04, height * 0.41), (0.09, 0.10, 0.11), dark, root, subdivisions=3)
            add_ring("character_coin_pouch_ring", (0.23, -0.04, height * 0.46), 0.035, 0.008, accent, root, major_segments=8, minor_segments=4)
            add_cylinder("character_ledger_scroll", (-0.23, -0.03, height * 0.42), 0.026, 0.17, garment_secondary, root, vertices=8, bevel=0.006, rotation=(math.radians(15), 0, 0))
            add_ring("character_ledger_band", (-0.23, -0.03, height * 0.42), 0.030, 0.010, accent, root, major_segments=8, minor_segments=4)
            add_ring("character_market_keys_ring", (-0.18, -0.12, height * 0.43), 0.025, 0.005, accent, root, major_segments=8, minor_segments=4)
            add_tri_prism("character_market_key_blade", (-0.18, -0.12, height * 0.39), (0.02, 0.01, 0.05), accent, root)

    if not spec.get("lodLevels"):
        _rig_character(spec, root, height)


def fauna_cow(spec: dict, root) -> None:
    """Build a chunky faceted dairy cow matching the isolated farm-animals sheet."""
    params = spec["parameters"]
    white, black, pink, horn_token, bell_token = spec["palette"]
    scale = params.get("scale", 1.0)
    s = scale
    horn_scale = params.get("hornScale", 1.0)

    add_ico("cow_body_main", (0, 0.05 * s, 1.18 * s), (0.52 * s, 0.92 * s, 0.50 * s), white, root, subdivisions=2)
    add_ico("cow_chest", (0, -0.55 * s, 1.16 * s), (0.48 * s, 0.42 * s, 0.48 * s), white, root, subdivisions=2)
    add_ico("cow_haunch", (0, 0.62 * s, 1.20 * s), (0.50 * s, 0.40 * s, 0.50 * s), white, root, subdivisions=2)
    add_box("cow_belly", (0, 0.08 * s, 0.92 * s), (0.72 * s, 1.28 * s, 0.42 * s), white, root, bevel=0.06 * s)

    add_ico("cow_patch_left", (-0.42 * s, 0.18 * s, 1.28 * s), (0.16 * s, 0.38 * s, 0.28 * s), black, root, subdivisions=2)
    add_ico("cow_patch_right", (0.44 * s, -0.22 * s, 1.18 * s), (0.16 * s, 0.42 * s, 0.26 * s), black, root, subdivisions=2)
    add_ico("cow_patch_shoulder", (-0.18 * s, -0.48 * s, 1.38 * s), (0.28 * s, 0.24 * s, 0.18 * s), black, root, subdivisions=2)
    add_ico("cow_patch_eye", (-0.18 * s, -1.22 * s, 1.58 * s), (0.14 * s, 0.12 * s, 0.12 * s), black, root, subdivisions=1)
    add_ico("cow_patch_rump", (0.22 * s, 0.70 * s, 1.36 * s), (0.24 * s, 0.22 * s, 0.18 * s), black, root, subdivisions=2)
    add_ico("cow_patch_flank", (0.46 * s, 0.28 * s, 1.08 * s), (0.12 * s, 0.28 * s, 0.22 * s), black, root, subdivisions=2)
    add_ico("cow_patch_belly", (-0.10 * s, 0.12 * s, 0.98 * s), (0.22 * s, 0.30 * s, 0.14 * s), black, root, subdivisions=2)
    add_ico("cow_patch_neck", (0.16 * s, -0.78 * s, 1.42 * s), (0.16 * s, 0.18 * s, 0.14 * s), black, root, subdivisions=2)
    add_ico("cow_shoulder_left", (-0.38 * s, -0.42 * s, 1.22 * s), (0.20 * s, 0.18 * s, 0.18 * s), white, root, subdivisions=2)
    add_ico("cow_shoulder_right", (0.38 * s, -0.38 * s, 1.20 * s), (0.20 * s, 0.18 * s, 0.18 * s), white, root, subdivisions=2)
    add_ico("cow_dewlap", (0, -0.72 * s, 1.02 * s), (0.16 * s, 0.18 * s, 0.14 * s), white, root, subdivisions=2)
    add_box("cow_forehead", (0, -1.22 * s, 1.68 * s), (0.36 * s, 0.28 * s, 0.16 * s), white, root, bevel=0.03 * s)
    add_ico("cow_hip_left", (-0.40 * s, 0.58 * s, 1.10 * s), (0.18 * s, 0.18 * s, 0.16 * s), white, root, subdivisions=2)
    add_ico("cow_hip_right", (0.40 * s, 0.54 * s, 1.12 * s), (0.18 * s, 0.18 * s, 0.16 * s), white, root, subdivisions=2)
    add_ico("cow_patch_hip", (-0.28 * s, 0.68 * s, 1.32 * s), (0.16 * s, 0.16 * s, 0.14 * s), black, root, subdivisions=2)
    add_ico("cow_muzzle_bridge", (0, -1.42 * s, 1.46 * s), (0.16 * s, 0.12 * s, 0.10 * s), white, root, subdivisions=2)

    leg_coords = (
        ("front_left", -0.30, -0.58),
        ("front_right", 0.30, -0.58),
        ("rear_left", -0.32, 0.62),
        ("rear_right", 0.32, 0.62),
    )
    for leg_name, lx, ly in leg_coords:
        add_box(f"cow_leg_upper_{leg_name}", (lx * s, ly * s, 0.72 * s), (0.26 * s, 0.28 * s, 0.48 * s), white, root, bevel=0.03 * s)
        add_box(f"cow_leg_lower_{leg_name}", (lx * s, ly * s + 0.04 * s, 0.32 * s), (0.22 * s, 0.24 * s, 0.40 * s), white, root, bevel=0.02 * s)
        add_box(f"cow_hoof_{leg_name}", (lx * s, ly * s + 0.05 * s, 0.07 * s), (0.26 * s, 0.30 * s, 0.12 * s), horn_token, root, bevel=0.01 * s)

    add_box("cow_neck", (0, -0.88 * s, 1.34 * s), (0.48 * s, 0.52 * s, 0.52 * s), white, root, rotation=(math.radians(22), 0, 0), bevel=0.05 * s)
    add_box("cow_head", (0, -1.28 * s, 1.50 * s), (0.50 * s, 0.50 * s, 0.46 * s), white, root, rotation=(math.radians(10), 0, 0), bevel=0.04 * s)
    add_box("cow_snout", (0, -1.58 * s, 1.32 * s), (0.40 * s, 0.32 * s, 0.28 * s), pink, root, bevel=0.03 * s)
    add_box("cow_jaw", (0, -1.46 * s, 1.18 * s), (0.34 * s, 0.22 * s, 0.14 * s), pink, root, bevel=0.02 * s)

    for side, sign in (("left", -1), ("right", 1)):
        add_cone(
            f"cow_horn_{side}", (sign * 0.28 * s, -1.18 * s, 1.84 * s),
            0.055 * s, 0.016 * s, 0.26 * s * horn_scale, horn_token, root, vertices=6,
            rotation=(math.radians(-18), 0, sign * math.radians(38)),
        )
        add_tri_prism(
            f"cow_ear_{side}", (sign * 0.38 * s, -1.16 * s, 1.56 * s),
            (0.24 * s, 0.08 * s, 0.16 * s), white, root,
            rotation=(0, sign * math.radians(18), sign * math.radians(78)),
        )

    add_tapered_beam("cow_tail", (0, 0.92 * s, 1.38 * s), (0, 1.12 * s, 0.62 * s), 0.05 * s, 0.03 * s, white, root, vertices=5)
    add_ico("cow_tail_brush", (0, 1.14 * s, 0.54 * s), (0.09 * s, 0.09 * s, 0.16 * s), black, root, subdivisions=2)

    add_ico("cow_udder", (0, 0.42 * s, 0.72 * s), (0.22 * s, 0.20 * s, 0.16 * s), pink, root, subdivisions=2)
    for teat, tx in enumerate((-0.08, -0.03, 0.03, 0.08)):
        add_cone(
            f"cow_teat_{teat}", (tx * s, (0.36 + (teat % 2) * 0.10) * s, 0.58 * s),
            0.025 * s, 0.012 * s, 0.08 * s, pink, root, vertices=5,
        )

    add_box("cow_collar", (0, -0.82 * s, 1.18 * s), (0.56 * s, 0.10 * s, 0.58 * s), black, root, rotation=(math.radians(22), 0, 0), bevel=0.0)
    add_cone("cow_bell", (0, -0.94 * s, 0.92 * s), 0.09 * s, 0.05 * s, 0.14 * s, bell_token, root, vertices=6)

    motion_root = _fauna_motion_node(f"{spec['id']}_motion_root", root)
    head_pivot = _fauna_motion_node(
        f"{spec['id']}_head_pivot", motion_root, (0.0, -0.86 * s, 1.34 * s)
    )
    tail_pivot = _fauna_motion_node(
        f"{spec['id']}_tail_pivot", motion_root, (0.0, 0.88 * s, 1.36 * s)
    )
    head_prefixes = (
        "cow_head", "cow_forehead", "cow_snout", "cow_jaw", "cow_muzzle",
        "cow_horn", "cow_ear", "cow_patch_eye",
    )
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH" or obj.parent is not root:
            continue
        if obj.name.startswith(head_prefixes):
            _reparent_preserving_world(obj, head_pivot)
        elif obj.name.startswith(("cow_tail",)):
            _reparent_preserving_world(obj, tail_pivot)
        else:
            _reparent_preserving_world(obj, motion_root)
    consolidate_lod_level(motion_root, f"{spec['id']}_body")
    consolidate_lod_level(head_pivot, f"{spec['id']}_head")
    consolidate_lod_level(tail_pivot, f"{spec['id']}_tail")
    _author_fauna_action(spec, "idle", motion_root, [
        (0.0, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        (0.8, (math.radians(1.0), 0.0, 0.0), (0.0, 0.0, 0.012 * s)),
        (1.6, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    ])
    _author_fauna_action(spec, "graze", head_pivot, [
        (0.0, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        (0.6, (math.radians(38), 0.0, 0.0), (0.0, -0.05 * s, -0.08 * s)),
        (1.2, (math.radians(43), 0.0, math.radians(-4)), (0.0, -0.07 * s, -0.1 * s)),
        (1.8, (math.radians(38), 0.0, math.radians(4)), (0.0, -0.05 * s, -0.08 * s)),
        (2.4, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    ])
    _author_fauna_action(spec, "look", head_pivot, [
        (0.0, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        (0.45, (math.radians(-4), 0.0, math.radians(-16)), (0.0, 0.0, 0.0)),
        (0.9, (math.radians(-2), 0.0, math.radians(13)), (0.0, 0.0, 0.0)),
        (1.35, (math.radians(-4), 0.0, math.radians(-10)), (0.0, 0.0, 0.0)),
        (1.8, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    ])
    add_collision_primitives(spec, root)


def _build_donkey_lod(spec: dict, lod_root):
    """Build the authored donkey silhouette and return its animated pivots."""
    params = spec["parameters"]
    coat, mealy, dark, leather, teal, brass = spec["palette"]
    lod_index = spec.get("_lodIndex", 0)
    detail = lod_index == 0
    s = params.get("scale", 1.0)
    ear_length = params.get("earLength", 1.0)
    leg_length = params.get("legLength", 1.0)
    suffix = "" if detail else "_lod1"
    prefix = spec["id"]

    def named(part: str) -> str:
        return f"{prefix}_{part}{suffix}"

    # 1. Pivot Hierarchy (Blender Z-up, -Y forward)
    head_pivot = _fauna_motion_node(
        named("head_pivot"), lod_root, (0.0, -0.78 * s, 1.44 * s)
    )
    ear_left_pivot = _fauna_motion_node(
        named("ear_left_pivot"), lod_root, (-0.12 * s, -0.88 * s, 1.70 * s)
    )
    ear_right_pivot = _fauna_motion_node(
        named("ear_right_pivot"), lod_root, (0.12 * s, -0.88 * s, 1.70 * s)
    )
    tail_pivot = _fauna_motion_node(
        named("tail_pivot"), lod_root, (0.0, 0.72 * s, 1.24 * s)
    )

    body_meshes = []

    # 2. Torso / Barrel Anatomy
    body_meshes.append(add_box(
        named("chest"), (0.0, -0.38 * s, 1.12 * s), (0.52 * s, 0.46 * s, 0.46 * s),
        coat, lod_root, bevel=0.06 * s if detail else 0.0,
    ))
    body_meshes.append(add_box(
        named("ribcage"), (0.0, 0.04 * s, 1.14 * s), (0.56 * s, 0.52 * s, 0.46 * s),
        coat, lod_root, bevel=0.06 * s if detail else 0.0,
    ))
    body_meshes.append(add_box(
        named("croup"), (0.0, 0.48 * s, 1.16 * s), (0.50 * s, 0.46 * s, 0.44 * s),
        coat, lod_root, bevel=0.06 * s if detail else 0.0, rotation=(math.radians(12), 0.0, 0.0),
    ))

    # Cream Underbelly & Chest Highlight
    body_meshes.append(add_box(
        named("belly_pale"), (0.0, 0.04 * s, 0.92 * s), (0.42 * s, 0.80 * s, 0.16 * s),
        mealy, lod_root, bevel=0.04 * s if detail else 0.0,
    ))
    body_meshes.append(add_box(
        named("chest_pale"), (0.0, -0.40 * s, 0.95 * s), (0.36 * s, 0.30 * s, 0.18 * s),
        mealy, lod_root, bevel=0.04 * s if detail else 0.0,
    ))

    # Dorsal Stripe & Shoulder Cross
    if detail:
        body_meshes.append(add_box(
            named("dorsal_stripe"), (0.0, 0.08 * s, 1.375 * s), (0.06 * s, 1.05 * s, 0.02 * s),
            dark, lod_root, bevel=0.0,
        ))
        body_meshes.append(add_box(
            named("shoulder_cross"), (0.0, -0.28 * s, 1.34 * s), (0.54 * s, 0.07 * s, 0.02 * s),
            dark, lod_root, bevel=0.0,
        ))

    # 3. Neck & Upright Mane
    neck = add_tapered_beam(
        named("neck"), (0.0, -0.32 * s, 1.18 * s), (0.0, -0.76 * s, 1.44 * s),
        0.23 * s, 0.17 * s, coat, lod_root, vertices=6 if detail else 4,
    )
    body_meshes.append(neck)

    mane_count = 6 if detail else 3
    for index in range(mane_count):
        progress = index / max(1, mane_count - 1)
        my = (-0.34 - progress * 0.40) * s
        mz = (1.35 + progress * 0.22) * s
        body_meshes.append(add_tri_prism(
            named(f"mane_{index}"),
            (0.0, my, mz),
            (0.06 * s, 0.08 * s, 0.16 * s),
            dark, lod_root,
            rotation=(0.0, math.radians(10), 0.0),
        ))

    # 4. Authored Low-Poly Head & Snout (parented to head_pivot)
    head_meshes = []
    head_meshes.append(add_box(
        named("skull"), (0.0, -0.98 * s, 1.58 * s), (0.30 * s, 0.34 * s, 0.28 * s),
        coat, lod_root, bevel=0.04 * s if detail else 0.0, rotation=(math.radians(14), 0.0, 0.0),
    ))
    head_meshes.append(add_box(
        named("forehead"), (0.0, -0.96 * s, 1.66 * s), (0.24 * s, 0.26 * s, 0.12 * s),
        coat, lod_root, bevel=0.02 * s if detail else 0.0, rotation=(math.radians(14), 0.0, 0.0),
    ))
    head_meshes.append(add_box(
        named("cheeks"), (0.0, -0.94 * s, 1.44 * s), (0.26 * s, 0.26 * s, 0.14 * s),
        coat, lod_root, bevel=0.03 * s if detail else 0.0,
    ))
    head_meshes.append(add_box(
        named("muzzle_pale"), (0.0, -1.24 * s, 1.48 * s), (0.22 * s, 0.26 * s, 0.18 * s),
        mealy, lod_root, bevel=0.03 * s if detail else 0.0, rotation=(math.radians(16), 0.0, 0.0),
    ))
    head_meshes.append(add_box(
        named("chin_pale"), (0.0, -1.18 * s, 1.38 * s), (0.18 * s, 0.18 * s, 0.08 * s),
        mealy, lod_root, bevel=0.02 * s if detail else 0.0,
    ))

    if detail:
        head_meshes.append(add_tri_prism(
            named("forelock_tuft"), (0.0, -0.88 * s, 1.74 * s),
            (0.07 * s, 0.08 * s, 0.11 * s), dark, lod_root,
            rotation=(math.radians(-14), 0.0, 0.0),
        ))
        head_meshes.append(add_box(
            named("nostril_left"), (-0.05 * s, -1.36 * s, 1.48 * s),
            (0.022 * s, 0.026 * s, 0.022 * s), dark, lod_root, bevel=0.0,
        ))
        head_meshes.append(add_box(
            named("nostril_right"), (0.05 * s, -1.36 * s, 1.48 * s),
            (0.022 * s, 0.026 * s, 0.022 * s), dark, lod_root, bevel=0.0,
        ))
        head_meshes.append(add_box(
            named("mouth_seam"), (0.0, -1.32 * s, 1.41 * s),
            (0.09 * s, 0.03 * s, 0.01 * s), dark, lod_root, bevel=0.0,
        ))
        for side, sign in (("left", -1.0), ("right", 1.0)):
            head_meshes.append(add_box(
                named(f"eye_ring_{side}"), (sign * 0.155 * s, -1.02 * s, 1.60 * s),
                (0.018 * s, 0.06 * s, 0.05 * s), mealy, lod_root, bevel=0.003 * s,
                rotation=(math.radians(14), sign * math.radians(-10), 0.0),
            ))
            head_meshes.append(add_box(
                named(f"eye_pupil_{side}"), (sign * 0.163 * s, -1.02 * s, 1.60 * s),
                (0.012 * s, 0.032 * s, 0.032 * s), dark, lod_root, bevel=0.002 * s,
                rotation=(math.radians(14), sign * math.radians(-10), 0.0),
            ))

    # 5. Long Cupped Ears (parented to ear pivots)
    ear_left_meshes = []
    ear_right_meshes = []
    ear_h = 0.44 * ear_length * s
    for side, sign in (("left", -1.0), ("right", 1.0)):
        target_list = ear_left_meshes if side == "left" else ear_right_meshes
        target_list.append(add_tri_prism(
            named(f"ear_cup_{side}"),
            (sign * 0.15 * s, -0.88 * s, 1.70 * s + ear_h * 0.40),
            (0.13 * s, 0.08 * s, ear_h * 0.65), coat, lod_root,
            rotation=(math.radians(-10), sign * math.radians(18), sign * math.radians(8)),
        ))
        target_list.append(add_tri_prism(
            named(f"ear_tip_{side}"),
            (sign * 0.18 * s, -0.88 * s, 1.70 * s + ear_h * 0.82),
            (0.08 * s, 0.06 * s, ear_h * 0.28), dark, lod_root,
            rotation=(math.radians(-12), sign * math.radians(20), sign * math.radians(8)),
        ))
        if detail:
            target_list.append(add_box(
                named(f"ear_inner_{side}"),
                (sign * 0.145 * s, -0.905 * s, 1.70 * s + ear_h * 0.42),
                (0.065 * s, 0.016 * s, ear_h * 0.52), mealy, lod_root, bevel=0.0,
                rotation=(math.radians(-10), sign * math.radians(18), sign * math.radians(8)),
            ))

    # 6. Tail (parented to tail_pivot)
    tail_meshes = [
        add_tapered_beam(
            named("tail_dock"), (0.0, 0.72 * s, 1.24 * s), (0.0, 0.94 * s, 0.84 * s),
            0.042 * s, 0.022 * s, coat, lod_root, vertices=5,
        ),
        add_ico(
            named("tail_switch"), (0.0, 0.96 * s, 0.76 * s),
            (0.09 * s, 0.08 * s, 0.15 * s), dark, lod_root, subdivisions=1,
        ),
    ]
    if detail:
        tail_meshes.append(add_tri_prism(
            named("tail_tip"), (0.0, 0.98 * s, 0.68 * s),
            (0.07 * s, 0.07 * s, 0.12 * s), dark, lod_root,
            rotation=(math.radians(15), 0.0, 0.0),
        ))

    # 7. Coastal Riding Saddle & Tack
    saddle_blanket = add_box(
        named("saddle_blanket"), (0.0, 0.04 * s, 1.37 * s),
        (0.64 * s, 0.72 * s, 0.05 * s), mealy, lod_root, bevel=0.012 * s if detail else 0.0,
    )
    saddle_base = add_box(
        named("saddle_seat"), (0.0, 0.04 * s, 1.42 * s),
        (0.46 * s, 0.48 * s, 0.06 * s), leather, lod_root, bevel=0.014 * s if detail else 0.0,
    )
    body_meshes.extend([saddle_blanket, saddle_base])

    if detail:
        saddle_trim = add_box(
            named("saddle_trim"), (0.0, 0.04 * s, 1.355 * s),
            (0.68 * s, 0.76 * s, 0.025 * s), teal, lod_root, bevel=0.006 * s,
        )
        saddle_pommel = add_box(
            named("saddle_pommel"), (0.0, -0.16 * s, 1.47 * s),
            (0.22 * s, 0.10 * s, 0.08 * s), leather, lod_root, bevel=0.015 * s,
        )
        saddle_cantle = add_box(
            named("saddle_cantle"), (0.0, 0.22 * s, 1.48 * s),
            (0.26 * s, 0.10 * s, 0.09 * s), leather, lod_root, bevel=0.015 * s,
        )
        saddle_girth = add_box(
            named("saddle_girth"), (0.0, -0.02 * s, 1.12 * s),
            (0.58 * s, 0.06 * s, 0.46 * s), leather, lod_root, bevel=0.008 * s,
        )
        breastplate = add_box(
            named("breastplate"), (0.0, -0.34 * s, 1.20 * s),
            (0.52 * s, 0.12 * s, 0.04 * s), leather, lod_root, bevel=0.006 * s,
            rotation=(math.radians(16), 0.0, 0.0),
        )
        crupper = add_box(
            named("crupper"), (0.0, 0.48 * s, 1.28 * s),
            (0.05 * s, 0.38 * s, 0.03 * s), leather, lod_root, bevel=0.006 * s,
        )
        center_ring = add_ring(
            named("breastplate_ring"), (0.0, -0.42 * s, 1.16 * s),
            0.024 * s, 0.005 * s, brass, lod_root, major_segments=8, minor_segments=4,
        )
        body_meshes.extend([saddle_trim, saddle_pommel, saddle_cantle, saddle_girth, breastplate, crupper, center_ring])

        for side, sign in (("left", -1.0), ("right", 1.0)):
            stirrup_leather = add_box(
                named(f"stirrup_leather_{side}"), (sign * 0.38 * s, -0.06 * s, 1.22 * s),
                (0.025 * s, 0.05 * s, 0.32 * s), leather, lod_root, bevel=0.004 * s,
            )
            stirrup_iron = add_ring(
                named(f"stirrup_iron_{side}"), (sign * 0.38 * s, -0.08 * s, 1.08 * s),
                0.038 * s, 0.006 * s, brass, lod_root, major_segments=8, minor_segments=4,
                rotation=(0.0, math.pi / 2, 0.0),
            )
            body_meshes.extend([stirrup_leather, stirrup_iron])

        bridle_headstall = add_box(
            named("bridle_headstall"), (0.0, -0.92 * s, 1.62 * s),
            (0.32 * s, 0.035 * s, 0.28 * s), leather, lod_root, bevel=0.005 * s,
            rotation=(math.radians(14), 0.0, 0.0),
        )
        bridle_browband = add_box(
            named("bridle_browband"), (0.0, -1.00 * s, 1.68 * s),
            (0.31 * s, 0.035 * s, 0.035 * s), leather, lod_root, bevel=0.004 * s,
        )
        bridle_noseband = add_box(
            named("bridle_noseband"), (0.0, -1.18 * s, 1.52 * s),
            (0.24 * s, 0.035 * s, 0.18 * s), leather, lod_root, bevel=0.005 * s,
            rotation=(math.radians(16), 0.0, 0.0),
        )
        head_meshes.extend([bridle_headstall, bridle_browband, bridle_noseband])

        for side, sign in (("left", -1.0), ("right", 1.0)):
            head_meshes.append(add_ring(
                named(f"bridle_bit_ring_{side}"), (sign * 0.115 * s, -1.26 * s, 1.45 * s),
                0.020 * s, 0.004 * s, brass, lod_root, major_segments=8, minor_segments=4,
                rotation=(0.0, math.pi / 2, 0.0),
            ))
        add_rope_line(
            named("rein_left"),
            [
                (-0.115 * s, -1.26 * s, 1.45 * s),
                (-0.22 * s, -0.68 * s, 1.46 * s),
                (-0.16 * s, -0.16 * s, 1.47 * s),
            ],
            0.008 * s, leather, lod_root, vertices=5,
        )
        add_rope_line(
            named("rein_right"),
            [
                (0.115 * s, -1.26 * s, 1.45 * s),
                (0.22 * s, -0.68 * s, 1.46 * s),
                (0.16 * s, -0.16 * s, 1.47 * s),
            ],
            0.008 * s, leather, lod_root, vertices=5,
        )

    # 8. Articulated Legs, Joints & Sturdy Donkey Hooves
    leg_pivots = {}
    lower_pivots = {}
    leg_layout = (
        ("front_left", -0.24, -0.42, True),
        ("front_right", 0.24, -0.42, True),
        ("rear_left", -0.24, 0.46, False),
        ("rear_right", 0.24, 0.46, False),
    )
    hip_z = 0.96 * s
    knee_z = 0.50 * leg_length * s
    pastern_z = 0.13 * s
    ground_z = 0.045 * s

    for leg_name, lx, ly, is_front in leg_layout:
        pivot = _fauna_motion_node(named(f"leg_{leg_name}_pivot"), lod_root, (lx * s, ly * s, hip_z))
        lower = _fauna_motion_node(named(f"leg_{leg_name}_lower_pivot"), pivot, (0.0, 0.0, knee_z - hip_z))

        lower_parts = []
        if is_front:
            upper_mesh = add_tapered_beam(
                named(f"leg_{leg_name}_upper"),
                (lx * s, ly * s, hip_z),
                (lx * s, (ly - 0.015) * s, knee_z),
                0.11 * s, 0.085 * s, coat, lod_root, vertices=6 if detail else 4,
            )
            knee_mesh = add_box(
                named(f"leg_{leg_name}_knee"),
                (lx * s, (ly - 0.015) * s, knee_z),
                (0.11 * s, 0.12 * s, 0.10 * s), coat, lod_root, bevel=0.014 * s if detail else 0.0,
            )
            lower_mesh = add_tapered_beam(
                named(f"leg_{leg_name}_lower"),
                (lx * s, (ly - 0.015) * s, knee_z),
                (lx * s, ly * s, pastern_z if detail else ground_z + 0.04 * s),
                0.08 * s, 0.065 * s, coat, lod_root, vertices=6 if detail else 4,
            )
            lower_parts.extend([knee_mesh, lower_mesh])
            if detail:
                pastern_mesh = add_tapered_beam(
                    named(f"leg_{leg_name}_pastern"),
                    (lx * s, ly * s, pastern_z),
                    (lx * s, (ly - 0.025) * s, ground_z + 0.035 * s),
                    0.065 * s, 0.060 * s, mealy, lod_root, vertices=5,
                )
                lower_parts.append(pastern_mesh)
            hoof_mesh = add_box(
                named(f"hoof_{leg_name}"),
                (lx * s, (ly - 0.035) * s, ground_z),
                (0.15 * s, 0.19 * s, 0.085 * s), dark, lod_root, bevel=0.015 * s if detail else 0.0,
            )
            lower_parts.append(hoof_mesh)
        else:
            upper_mesh = add_tapered_beam(
                named(f"leg_{leg_name}_upper"),
                (lx * s, ly * s, hip_z),
                (lx * s, (ly + 0.04) * s, knee_z + 0.04 * s),
                0.13 * s, 0.095 * s, coat, lod_root, vertices=6 if detail else 4,
            )
            knee_mesh = add_box(
                named(f"leg_{leg_name}_hock"),
                (lx * s, (ly + 0.055) * s, knee_z + 0.04 * s),
                (0.11 * s, 0.14 * s, 0.11 * s), coat, lod_root, bevel=0.015 * s if detail else 0.0,
                rotation=(math.radians(-14), 0.0, 0.0),
            )
            lower_mesh = add_tapered_beam(
                named(f"leg_{leg_name}_lower"),
                (lx * s, (ly + 0.04) * s, knee_z + 0.04 * s),
                (lx * s, ly * s, pastern_z if detail else ground_z + 0.04 * s),
                0.08 * s, 0.065 * s, coat, lod_root, vertices=6 if detail else 4,
            )
            lower_parts.extend([knee_mesh, lower_mesh])
            if detail:
                pastern_mesh = add_tapered_beam(
                    named(f"leg_{leg_name}_pastern"),
                    (lx * s, ly * s, pastern_z),
                    (lx * s, (ly - 0.025) * s, ground_z + 0.035 * s),
                    0.065 * s, 0.060 * s, mealy, lod_root, vertices=5,
                )
                lower_parts.append(pastern_mesh)
            hoof_mesh = add_box(
                named(f"hoof_{leg_name}"),
                (lx * s, (ly - 0.035) * s, ground_z),
                (0.15 * s, 0.19 * s, 0.085 * s), dark, lod_root, bevel=0.015 * s if detail else 0.0,
            )
            lower_parts.append(hoof_mesh)

        _reparent_preserving_world(upper_mesh, pivot)
        for mesh in lower_parts:
            _reparent_preserving_world(mesh, lower)
        leg_pivots[leg_name] = pivot
        lower_pivots[leg_name] = lower

    # Reparent head, ear, and tail meshes to their animated pivots
    for mesh in head_meshes:
        _reparent_preserving_world(mesh, head_pivot)
    for mesh in ear_left_meshes:
        _reparent_preserving_world(mesh, ear_left_pivot)
    for mesh in ear_right_meshes:
        _reparent_preserving_world(mesh, ear_right_pivot)
    _reparent_preserving_world(ear_left_pivot, head_pivot)
    _reparent_preserving_world(ear_right_pivot, head_pivot)
    for mesh in tail_meshes:
        _reparent_preserving_world(mesh, tail_pivot)

    return {
        "head": head_pivot,
        "ear_left": ear_left_pivot,
        "ear_right": ear_right_pivot,
        "tail": tail_pivot,
        "legs": leg_pivots,
        "lower_legs": lower_pivots,
    }


def _donkey_identity(duration: float):
    return [
        (0.0, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        (_donkey_frame_time_for_fraction(duration, 1.0), (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    ]


def _donkey_leg_forward_position(
    phase: float,
    *,
    scale: float,
    leg_length: float,
    is_front: bool,
    upper_swing_degrees: float,
    lower_swing_degrees: float,
) -> float:
    """Measure hoof travel from the actual upper/lower rest vectors in the rig."""
    s = scale
    hip_z = 0.96 * s
    knee_z = (0.50 * leg_length + (0.0 if is_front else 0.04)) * s
    upper_y = (-0.015 if is_front else 0.04) * s
    upper_z = knee_z - hip_z
    lower_y = -0.035 * s
    lower_z = 0.045 * s - knee_z
    upper_angle = math.sin(phase * math.tau) * math.radians(upper_swing_degrees)
    lower_angle = math.sin(((phase + 0.10) % 1.0) * math.tau) * math.radians(lower_swing_degrees)
    lower_world_angle = upper_angle + lower_angle
    return (
        upper_y * math.cos(upper_angle) - upper_z * math.sin(upper_angle)
        + lower_y * math.cos(lower_world_angle) - lower_z * math.sin(lower_world_angle)
    )


def _donkey_stride_reach(
    *,
    scale: float,
    leg_length: float,
    upper_swing_degrees: float,
    lower_swing_degrees: float,
) -> float:
    """Return the limiting front/rear hoof reach for a diagonal gait cycle."""
    reaches = []
    for is_front in (True, False):
        positions = [
            _donkey_leg_forward_position(
                sample / 1024.0,
                scale=scale,
                leg_length=leg_length,
                is_front=is_front,
                upper_swing_degrees=upper_swing_degrees,
                lower_swing_degrees=lower_swing_degrees,
            )
            for sample in range(1025)
        ]
        reaches.append(max(positions) - min(positions))
    return min(reaches)


def _donkey_gait_duration(
    spec: dict,
    clip_name: str,
    stride_reach: float,
    coverage: float = 1.0,
) -> float:
    """Derive and frame-align a gait duration from rig reach and catalog speed."""
    clip = next((entry for entry in _animation_clips(spec) if entry["name"] == clip_name), None)
    if clip is None or not clip.get("referenceSpeedMetersPerSecond"):
        raise ValueError(f"{spec['id']} {clip_name} requires a reference speed")
    # One complete gait cycle advances the body by one stride, regardless of
    # whether the rhythm contains four walk contacts or two diagonal trot
    # contacts. Multiplying reach by hoof-beat count made the donkey translate
    # four times farther than its feet could cover.
    derived_duration = _donkey_frame_aligned_duration(
        stride_reach * coverage / clip["referenceSpeedMetersPerSecond"]
    )
    catalog_duration = float(clip["durationSeconds"])
    if abs(catalog_duration - derived_duration) > 1e-6:
        raise ValueError(
            f"{spec['id']} {clip_name} catalog duration {catalog_duration:.2f}s "
            f"does not match derived {derived_duration:.2f}s"
        )
    return derived_duration


def _donkey_swing(duration: float, amount: float, phase: float = 1.0):
    return [
        (0.0, (phase * amount, 0.0, 0.0), (0.0, 0.0, 0.0)),
        (_donkey_frame_time_for_fraction(duration, 0.25), (phase * amount * 0.35, 0.0, 0.0), (0.0, 0.0, 0.0)),
        (_donkey_frame_time_for_fraction(duration, 0.50), (-phase * amount, 0.0, 0.0), (0.0, 0.0, 0.0)),
        (_donkey_frame_time_for_fraction(duration, 0.75), (-phase * amount * 0.35, 0.0, 0.0), (0.0, 0.0, 0.0)),
        (_donkey_frame_time_for_fraction(duration, 1.0), (phase * amount, 0.0, 0.0), (0.0, 0.0, 0.0)),
    ]


def _donkey_contact_joint_track(
    duration: float,
    amount: float,
    contact_phase: float,
    *,
    lower: bool,
    trot: bool,
):
    """Author a planted stance and flexed recovery instead of a sine pendulum."""
    if trot:
        curve = (
            ((0.0, 0.12), (0.12, 0.25), (0.38, 0.10), (0.50, 0.32), (0.68, 1.0), (0.84, 0.42), (1.0, 0.12))
            if lower else
            ((0.0, 0.78), (0.12, 0.28), (0.38, -0.82), (0.50, -1.0), (0.68, -0.12), (0.84, 0.88), (1.0, 0.78))
        )
    else:
        curve = (
            ((0.0, 0.10), (0.16, 0.24), (0.48, 0.08), (0.58, 0.18), (0.74, 1.0), (0.90, 0.34), (1.0, 0.10))
            if lower else
            ((0.0, 0.68), (0.16, 0.32), (0.48, -0.78), (0.58, -1.0), (0.74, -0.18), (0.90, 0.78), (1.0, 0.68))
        )

    def sample_curve(local_phase: float) -> float:
        for (start_phase, start_value), (end_phase, end_value) in zip(curve, curve[1:]):
            if local_phase <= end_phase:
                span = max(1e-6, end_phase - start_phase)
                t = max(0.0, min(1.0, (local_phase - start_phase) / span))
                eased = t * t * (3.0 - 2.0 * t)
                return start_value + (end_value - start_value) * eased
        return curve[-1][1]

    frame_count = max(1, _frame_number(duration, DONKEY_FRAME_RATE))
    keys = []
    for frame in range(frame_count + 1):
        phase = frame / frame_count
        local_phase = (phase - contact_phase) % 1.0
        # The donkey faces Blender -Y. An upper leg's positive object-space X
        # rotation moves its hoof toward +Y (backward), so the contact leg must
        # use the opposite sign: forward at hoof strike, backward through the
        # planted stance, then forward again during recovery. Lower-leg flexion
        # keeps its positive sign so the knee/hock folds behind the upper leg.
        direction = 1.0 if lower else -1.0
        value = sample_curve(local_phase) * amount * direction
        keys.append((frame / DONKEY_FRAME_RATE, (value, 0.0, 0.0), (0.0, 0.0, 0.0)))
    return keys


def _donkey_pelvis_track(duration: float, lift: float, roll: float):
    """Give the body a restrained four-beat weight transfer."""
    return [
        (0.0, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        (_donkey_frame_time_for_fraction(duration, 0.25), (math.radians(0.8), 0.0, roll), (0.0, 0.0, lift)),
        (_donkey_frame_time_for_fraction(duration, 0.50), (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        (_donkey_frame_time_for_fraction(duration, 0.75), (math.radians(-0.8), 0.0, -roll), (0.0, 0.0, lift)),
        (_donkey_frame_time_for_fraction(duration, 1.0), (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    ]


def fauna_donkey(spec: dict, root) -> None:
    """Build the persistent starter donkey with a stable rider socket and gait clips."""
    motion_root = _fauna_motion_node(f"{spec['id']}_motion_root", root)
    pivots = None
    if spec.get("lodLevels"):
        for lod_index, lod_root in create_lod_roots(spec, root):
            _reparent_preserving_world(lod_root, motion_root)
            lod_spec = {**spec, "parameters": dict(spec["parameters"]), "_lodIndex": lod_index}
            level_pivots = _build_donkey_lod(lod_spec, lod_root)
            if lod_index == 0:
                pivots = level_pivots
    else:
        pivots = _build_donkey_lod(spec, root)
        for child in list(root.children):
            if child is motion_root:
                continue
            if child.type == "MESH":
                _reparent_preserving_world(child, motion_root)

    rider_socket = add_marker(
        f"{spec['id']}_rider_socket", (0.0, 0.04 * spec["parameters"].get("scale", 1.0), 1.50 * spec["parameters"].get("scale", 1.0)),
        motion_root, marker_type="socket",
    )
    rider_socket["neva_socket"] = True
    donkey_scale = spec["parameters"].get("scale", 1.0)
    for side, sign in (("left", -1.0), ("right", 1.0)):
        stirrup_socket = add_marker(
            f"{spec['id']}_stirrup_{side}_socket",
            (sign * 0.38 * donkey_scale, -0.08 * donkey_scale, 1.08 * donkey_scale),
            motion_root,
            marker_type="socket",
        )
        stirrup_socket["neva_socket"] = True

    if not pivots:
        return
    legs = pivots["legs"]
    lower_legs = pivots["lower_legs"]
    donkey_leg_length = spec["parameters"].get("legLength", 1.0)
    walk_stride_reach = _donkey_stride_reach(
        scale=donkey_scale,
        leg_length=donkey_leg_length,
        upper_swing_degrees=26,
        lower_swing_degrees=32,
    )
    trot_stride_reach = _donkey_stride_reach(
        scale=donkey_scale,
        leg_length=donkey_leg_length,
        upper_swing_degrees=34,
        lower_swing_degrees=34,
    )
    gallop_stride_reach = _donkey_stride_reach(
        scale=donkey_scale,
        leg_length=donkey_leg_length,
        upper_swing_degrees=48,
        lower_swing_degrees=56,
    )
    walk_duration = _donkey_gait_duration(spec, "walk", walk_stride_reach)
    trot_duration = _donkey_gait_duration(
        spec,
        "trot",
        trot_stride_reach,
        DONKEY_TROT_SUSPENSION_COVERAGE,
    )
    gallop_duration = _donkey_gait_duration(
        spec,
        "gallop",
        gallop_stride_reach,
        DONKEY_GALLOP_SUSPENSION_COVERAGE,
    )
    walk_tracks = [
        (motion_root, _donkey_pelvis_track(walk_duration, 0.028, math.radians(1.4))),
        (pivots["head"], [
            (0.0, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
            (_donkey_frame_time_for_fraction(walk_duration, 0.25), (math.radians(4), 0.0, 0.0), (0.0, -0.008, -0.022)),
            (_donkey_frame_time_for_fraction(walk_duration, 0.50), (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
            (_donkey_frame_time_for_fraction(walk_duration, 0.75), (math.radians(-3), 0.0, 0.0), (0.0, 0.006, 0.014)),
            (_donkey_frame_time_for_fraction(walk_duration, 1.0), (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        ]),
        (pivots["tail"], _donkey_swing(walk_duration, math.radians(8), 1.0)),
        (pivots["ear_left"], _donkey_swing(walk_duration, math.radians(4), 1.0)),
        (pivots["ear_right"], _donkey_swing(walk_duration, math.radians(4), -1.0)),
    ]
    trot_tracks = [
        (motion_root, _donkey_pelvis_track(trot_duration, 0.045, math.radians(1.7))),
        (pivots["head"], [
            (0.0, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
            (_donkey_frame_time_for_fraction(trot_duration, 0.25), (math.radians(5), 0.0, 0.0), (0.0, 0.0, -0.02)),
            (_donkey_frame_time_for_fraction(trot_duration, 0.50), (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
            (_donkey_frame_time_for_fraction(trot_duration, 0.75), (math.radians(-3), 0.0, 0.0), (0.0, 0.0, 0.015)),
            (_donkey_frame_time_for_fraction(trot_duration, 1.0), (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        ]),
        (pivots["tail"], _donkey_swing(trot_duration, math.radians(12), 1.0)),
        (pivots["ear_left"], _donkey_swing(trot_duration, math.radians(6), 1.0)),
        (pivots["ear_right"], _donkey_swing(trot_duration, math.radians(6), -1.0)),
    ]
    gallop_tracks = [
        (motion_root, [
            (0.0, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
            (_donkey_frame_time_for_fraction(gallop_duration, 0.18), (math.radians(-2.2), 0.0, 0.0), (0.0, 0.0, -0.025)),
            (_donkey_frame_time_for_fraction(gallop_duration, 0.42), (math.radians(2.8), 0.0, math.radians(1.2)), (0.0, 0.0, 0.085)),
            (_donkey_frame_time_for_fraction(gallop_duration, 0.62), (math.radians(1.2), 0.0, 0.0), (0.0, 0.0, 0.045)),
            (_donkey_frame_time_for_fraction(gallop_duration, 0.82), (math.radians(-1.4), 0.0, math.radians(-1.2)), (0.0, 0.0, -0.015)),
            (_donkey_frame_time_for_fraction(gallop_duration, 1.0), (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        ]),
        (pivots["head"], [
            (0.0, (math.radians(-1), 0.0, 0.0), (0.0, 0.0, 0.0)),
            (_donkey_frame_time_for_fraction(gallop_duration, 0.42), (math.radians(7), 0.0, 0.0), (0.0, -0.01, -0.035)),
            (_donkey_frame_time_for_fraction(gallop_duration, 0.70), (math.radians(-4), 0.0, 0.0), (0.0, 0.006, 0.018)),
            (_donkey_frame_time_for_fraction(gallop_duration, 1.0), (math.radians(-1), 0.0, 0.0), (0.0, 0.0, 0.0)),
        ]),
        (pivots["tail"], _donkey_swing(gallop_duration, math.radians(16), 1.0)),
        (pivots["ear_left"], _donkey_swing(gallop_duration, math.radians(7), 1.0)),
        (pivots["ear_right"], _donkey_swing(gallop_duration, math.radians(7), -1.0)),
    ]
    walk_contacts = {
        "rear_left": 0.0,
        "front_left": 0.25,
        "rear_right": 0.50,
        "front_right": 0.75,
    }
    for leg_name, pivot in legs.items():
        walk_contact_phase = walk_contacts[leg_name]
        walk_tracks.append((pivot, _donkey_contact_joint_track(
            walk_duration, math.radians(26), walk_contact_phase, lower=False, trot=False
        )))
        walk_tracks.append((lower_legs[leg_name], _donkey_contact_joint_track(
            walk_duration, math.radians(32), walk_contact_phase, lower=True, trot=False
        )))
        trot_contact_phase = 0.0 if leg_name in ("front_left", "rear_right") else 0.50
        trot_tracks.append((pivot, _donkey_contact_joint_track(
            trot_duration, math.radians(34), trot_contact_phase, lower=False, trot=True
        )))
        trot_tracks.append((lower_legs[leg_name], _donkey_contact_joint_track(
            trot_duration, math.radians(34), trot_contact_phase, lower=True, trot=True
        )))
        gallop_contact_phase = {
            "rear_left": 0.00,
            "rear_right": 0.12,
            "front_left": 0.46,
            "front_right": 0.58,
        }[leg_name]
        gallop_tracks.append((pivot, _donkey_contact_joint_track(
            gallop_duration, math.radians(48), gallop_contact_phase, lower=False, trot=True
        )))
        gallop_tracks.append((lower_legs[leg_name], _donkey_contact_joint_track(
            gallop_duration, math.radians(56), gallop_contact_phase, lower=True, trot=True
        )))

    def standing_tracks(duration: float):
        return [
            *( (pivot, _donkey_identity(duration)) for pivot in legs.values() ),
            *( (pivot, _donkey_identity(duration)) for pivot in lower_legs.values() ),
        ]

    # Author gait tracks first. The last NLA strip on a Blender object also
    # determines its exported base transform; ending with a complete identity
    # idle prevents the trot's first contact pose from becoming the GLB rest
    # pose for clips that do not otherwise animate the legs.
    _author_fauna_tracks(spec, "walk", walk_tracks)
    _author_fauna_tracks(spec, "trot", trot_tracks)
    _author_fauna_tracks(spec, "gallop", gallop_tracks)
    _author_fauna_tracks(spec, "graze", [
        (motion_root, _donkey_identity(2.4)),
        (pivots["head"], [
            (0.0, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
            (0.6, (math.radians(28), 0.0, 0.0), (0.0, -0.04, -0.05)),
            (1.2, (math.radians(38), 0.0, math.radians(-3)), (0.0, -0.06, -0.08)),
            (1.8, (math.radians(30), 0.0, math.radians(3)), (0.0, -0.04, -0.05)),
            (2.4, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        ]),
        *standing_tracks(2.4),
    ])
    _author_fauna_tracks(spec, "look", [
        (motion_root, _donkey_identity(1.8)),
        (pivots["head"], [
            (0.0, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
            (0.45, (math.radians(-3), 0.0, math.radians(-14)), (0.0, 0.0, 0.0)),
            (0.90, (math.radians(-2), 0.0, math.radians(14)), (0.0, 0.0, 0.0)),
            (1.35, (math.radians(-3), 0.0, math.radians(-8)), (0.0, 0.0, 0.0)),
            (1.8, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        ]),
        (pivots["ear_left"], _donkey_swing(1.8, math.radians(6), 1.0)),
        (pivots["ear_right"], _donkey_swing(1.8, math.radians(6), -1.0)),
        *standing_tracks(1.8),
    ])
    _author_fauna_tracks(spec, "mount", [
        (motion_root, [
            (0.0, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
            (0.32, (math.radians(-2), 0.0, 0.0), (0.0, 0.0, -0.025)),
            (0.8, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        ]),
        (pivots["head"], _donkey_identity(0.8)),
        *standing_tracks(0.8),
    ])
    _author_fauna_tracks(spec, "dismount", [
        (motion_root, [
            (0.0, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
            (0.36, (math.radians(2), 0.0, 0.0), (0.0, 0.0, 0.02)),
            (0.8, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        ]),
        (pivots["head"], _donkey_identity(0.8)),
        *standing_tracks(0.8),
    ])
    _author_fauna_tracks(spec, "idle", [
        (motion_root, _donkey_identity(1.6)),
        (pivots["head"], _donkey_identity(1.6)),
        # A sub-degree ear drift keeps the clip exportable without moving the
        # support chain, saddle, body, or hooves.
        (pivots["ear_left"], _donkey_swing(1.6, math.radians(0.35), 1.0)),
        (pivots["ear_right"], _donkey_swing(1.6, math.radians(0.35), -1.0)),
        (pivots["tail"], _donkey_identity(1.6)),
        *standing_tracks(1.6),
    ])


def fauna_chicken(spec: dict, root) -> None:
    """Build a faceted farm hen matching the isolated farm-animals sheet."""
    params = spec["parameters"]
    feather, dark, comb_token, beak_token = spec["palette"]
    scale = params.get("scale", 0.65)
    s = scale
    comb_scale = params.get("combScale", 1.0)

    add_ico("chicken_body", (0, 0.02 * s, 0.38 * s), (0.32 * s, 0.40 * s, 0.30 * s), feather, root, subdivisions=2)
    add_ico("chicken_breast", (0, -0.12 * s, 0.34 * s), (0.24 * s, 0.22 * s, 0.22 * s), feather, root, subdivisions=2)
    for wing, sign in (("left", -1), ("right", 1)):
        add_ico(
            f"chicken_wing_{wing}", (sign * 0.22 * s, 0.02 * s, 0.36 * s),
            (0.10 * s, 0.18 * s, 0.14 * s), feather, root, subdivisions=2,
            rotation=(0, sign * 0.35, 0),
        )
    for index, pitch in enumerate((28, 42, 55)):
        add_tri_prism(
            f"chicken_tail_{index}",
            (0, (0.26 + index * 0.04) * s, (0.46 + index * 0.06) * s),
            ((0.12 - index * 0.02) * s, 0.10 * s, 0.22 * s),
            dark if index else feather, root,
            rotation=(math.radians(pitch), 0, (index - 1) * 0.12),
        )
    add_cone("chicken_neck", (0, -0.20 * s, 0.54 * s), 0.11 * s, 0.08 * s, 0.28 * s, feather, root, vertices=6)
    add_ico("chicken_head", (0, -0.26 * s, 0.72 * s), (0.11 * s, 0.13 * s, 0.11 * s), feather, root, subdivisions=2)
    add_cone("chicken_beak", (0, -0.38 * s, 0.70 * s), 0.04 * s, 0.006 * s, 0.10 * s, beak_token, root, vertices=4, rotation=(math.pi / 2, 0, 0))
    add_ico("chicken_eye_left", (-0.08 * s, -0.30 * s, 0.74 * s), (0.018 * s, 0.018 * s, 0.018 * s), dark, root, subdivisions=1)
    add_ico("chicken_eye_right", (0.08 * s, -0.30 * s, 0.74 * s), (0.018 * s, 0.018 * s, 0.018 * s), dark, root, subdivisions=1)
    for comb in range(3):
        add_box(
            f"chicken_comb_{comb}",
            (0, (-0.24 + comb * 0.04) * s, (0.82 + (1 if comb == 1 else 0) * 0.03) * s),
            (0.03 * s, 0.06 * s, 0.08 * s * comb_scale), comb_token, root, bevel=0.0,
        )
    add_box("chicken_wattle", (0, -0.32 * s, 0.62 * s), (0.025 * s, 0.06 * s, 0.08 * s), comb_token, root, bevel=0.0)
    for side, sign in (("left", -1), ("right", 1)):
        add_cylinder(f"chicken_leg_{side}", (sign * 0.09 * s, 0.02 * s, 0.16 * s), 0.016 * s, 0.30 * s, beak_token, root, vertices=5)
        add_box(f"chicken_foot_{side}", (sign * 0.09 * s, -0.03 * s, 0.02 * s), (0.07 * s, 0.10 * s, 0.02 * s), beak_token, root, bevel=0.0)
        for toe, dy in enumerate((-0.06, 0.0, 0.05)):
            add_box(
                f"chicken_toe_{side}_{toe}",
                (sign * 0.09 * s, dy * s, 0.015 * s),
                (0.025 * s, 0.08 * s, 0.016 * s), beak_token, root, bevel=0.0,
            )
    motion_root = _fauna_motion_node(f"{spec['id']}_motion_root", root)
    head_pivot = _fauna_motion_node(
        f"{spec['id']}_head_pivot", motion_root, (0.0, -0.18 * s, 0.54 * s)
    )
    wing_left_pivot = _fauna_motion_node(
        f"{spec['id']}_wing_left_pivot", motion_root, (-0.15 * s, 0.02 * s, 0.38 * s)
    )
    wing_right_pivot = _fauna_motion_node(
        f"{spec['id']}_wing_right_pivot", motion_root, (0.15 * s, 0.02 * s, 0.38 * s)
    )
    head_prefixes = (
        "chicken_neck", "chicken_head", "chicken_beak", "chicken_eye",
        "chicken_comb", "chicken_wattle",
    )
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH" or obj.parent is not root:
            continue
        if obj.name.startswith(head_prefixes):
            _reparent_preserving_world(obj, head_pivot)
        elif obj.name == "chicken_wing_left":
            _reparent_preserving_world(obj, wing_left_pivot)
        elif obj.name == "chicken_wing_right":
            _reparent_preserving_world(obj, wing_right_pivot)
        else:
            _reparent_preserving_world(obj, motion_root)
    consolidate_lod_level(motion_root, f"{spec['id']}_body")
    consolidate_lod_level(head_pivot, f"{spec['id']}_head")
    consolidate_lod_level(wing_left_pivot, f"{spec['id']}_wing_left")
    consolidate_lod_level(wing_right_pivot, f"{spec['id']}_wing_right")
    _author_fauna_action(spec, "idle", motion_root, [
        (0.0, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        (0.6, (math.radians(1.5), 0.0, 0.0), (0.0, 0.0, 0.008 * s)),
        (1.2, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    ])
    _author_fauna_action(spec, "peck", head_pivot, [
        (0.0, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        (0.16, (math.radians(48), 0.0, 0.0), (0.0, -0.025 * s, -0.06 * s)),
        (0.32, (math.radians(12), 0.0, 0.0), (0.0, 0.0, -0.01 * s)),
        (0.48, (math.radians(52), 0.0, 0.0), (0.0, -0.03 * s, -0.065 * s)),
        (0.64, (math.radians(8), 0.0, 0.0), (0.0, 0.0, -0.008 * s)),
        (0.8, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    ])
    _author_fauna_action(spec, "look", head_pivot, [
        (0.0, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        (0.35, (math.radians(-7), 0.0, math.radians(-22)), (0.0, 0.0, 0.0)),
        (0.7, (math.radians(-4), 0.0, math.radians(19)), (0.0, 0.0, 0.0)),
        (1.05, (math.radians(-7), 0.0, math.radians(-14)), (0.0, 0.0, 0.0)),
        (1.4, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    ])
    add_collision_primitives(spec, root)


def fauna_rabbit(spec: dict, root) -> None:
    """Faceted meadow rabbit with idle, look, and hop clips."""
    params = spec["parameters"]
    fur, dark, pink = spec["palette"][:3]
    s = params.get("scale", 0.55)
    ear = params.get("earLength", 1.0)
    add_ico("rabbit_body", (0, 0.04 * s, 0.22 * s), (0.16 * s, 0.24 * s, 0.14 * s), fur, root, subdivisions=1)
    add_ico("rabbit_haunch", (0, 0.14 * s, 0.2 * s), (0.14 * s, 0.12 * s, 0.12 * s), fur, root, subdivisions=1)
    add_ico("rabbit_head", (0, -0.18 * s, 0.32 * s), (0.11 * s, 0.12 * s, 0.11 * s), fur, root, subdivisions=1)
    add_ico("rabbit_muzzle", (0, -0.28 * s, 0.28 * s), (0.06 * s, 0.06 * s, 0.05 * s), pink, root, subdivisions=1)
    add_ico("rabbit_eye_left", (-0.06 * s, -0.22 * s, 0.36 * s), (0.016 * s, 0.016 * s, 0.016 * s), dark, root, subdivisions=1)
    add_ico("rabbit_eye_right", (0.06 * s, -0.22 * s, 0.36 * s), (0.016 * s, 0.016 * s, 0.016 * s), dark, root, subdivisions=1)
    for side, sign in (("left", -1), ("right", 1)):
        add_box(
            f"rabbit_ear_{side}",
            (sign * 0.05 * s, -0.16 * s, 0.48 * s),
            (0.04 * s, 0.05 * s, 0.18 * s * ear),
            fur,
            root,
            rotation=(math.radians(-12), 0, sign * math.radians(8)),
            bevel=0.0,
        )
        add_box(
            f"rabbit_foreleg_{side}",
            (sign * 0.06 * s, -0.08 * s, 0.08 * s),
            (0.05 * s, 0.05 * s, 0.12 * s),
            fur,
            root,
            bevel=0.0,
        )
        add_box(
            f"rabbit_hindleg_{side}",
            (sign * 0.07 * s, 0.12 * s, 0.09 * s),
            (0.07 * s, 0.08 * s, 0.14 * s),
            fur,
            root,
            bevel=0.0,
        )
    add_tapered_beam("rabbit_tail", (0, 0.24 * s, 0.24 * s), (0, 0.3 * s, 0.28 * s), 0.03 * s, 0.04 * s, fur, root, vertices=5)
    motion_root = _fauna_motion_node(f"{spec['id']}_motion_root", root)
    head_pivot = _fauna_motion_node(f"{spec['id']}_head_pivot", motion_root, (0.0, -0.16 * s, 0.3 * s))
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH" or obj.parent is not root:
            continue
        if obj.name.startswith(("rabbit_head", "rabbit_muzzle", "rabbit_eye", "rabbit_ear")):
            _reparent_preserving_world(obj, head_pivot)
        else:
            _reparent_preserving_world(obj, motion_root)
    consolidate_lod_level(motion_root, f"{spec['id']}_body")
    consolidate_lod_level(head_pivot, f"{spec['id']}_head")
    _author_fauna_action(spec, "idle", motion_root, [
        (0.0, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        (0.7, (math.radians(2), 0.0, 0.0), (0.0, 0.0, 0.01 * s)),
        (1.4, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    ])
    _author_fauna_action(spec, "look", head_pivot, [
        (0.0, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        (0.4, (math.radians(-6), 0.0, math.radians(-18)), (0.0, 0.0, 0.0)),
        (0.8, (math.radians(-4), 0.0, math.radians(16)), (0.0, 0.0, 0.0)),
        (1.2, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    ])
    _author_fauna_action(spec, "hop", motion_root, [
        (0.0, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        (0.16, (math.radians(-8), 0.0, 0.0), (0.0, -0.04 * s, 0.08 * s)),
        (0.32, (math.radians(6), 0.0, 0.0), (0.0, 0.0, 0.12 * s)),
        (0.48, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    ])
    add_collision_primitives(spec, root)


def fauna_gull(spec: dict, root) -> None:
    """Coastal gull with flap and glide wing clips."""
    params = spec["parameters"]
    body_token, wing_token, beak_token = spec["palette"][:3]
    s = params.get("scale", 0.7)
    wing_span = params.get("wingSpan", 1.0)
    add_ico("gull_body", (0, 0, 0.04 * s), (0.1 * s, 0.22 * s, 0.08 * s), body_token, root, subdivisions=1)
    add_ico("gull_chest", (0, -0.06 * s, 0.02 * s), (0.08 * s, 0.1 * s, 0.07 * s), body_token, root, subdivisions=1)
    add_ico("gull_head", (0, -0.22 * s, 0.08 * s), (0.06 * s, 0.07 * s, 0.06 * s), body_token, root, subdivisions=1)
    add_cone("gull_beak", (0, -0.3 * s, 0.06 * s), 0.018 * s, 0.006 * s, 0.08 * s, beak_token, root, vertices=4, rotation=(math.pi / 2, 0, 0))
    add_tapered_beam("gull_tail", (0, 0.2 * s, 0.04 * s), (0, 0.34 * s, 0.02 * s), 0.05 * s, 0.02 * s, body_token, root, vertices=4)
    for side, sign in (("left", -1), ("right", 1)):
        add_box(
            f"gull_wing_{side}",
            (sign * 0.22 * s * wing_span, 0.02 * s, 0.06 * s),
            (0.32 * s * wing_span, 0.08 * s, 0.03 * s),
            wing_token,
            root,
            bevel=0.0,
        )
    motion_root = _fauna_motion_node(f"{spec['id']}_motion_root", root)
    wing_left = _fauna_motion_node(f"{spec['id']}_wing_left_pivot", motion_root, (-0.08 * s, 0.0, 0.05 * s))
    wing_right = _fauna_motion_node(f"{spec['id']}_wing_right_pivot", motion_root, (0.08 * s, 0.0, 0.05 * s))
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH" or obj.parent is not root:
            continue
        if obj.name == "gull_wing_left":
            _reparent_preserving_world(obj, wing_left)
        elif obj.name == "gull_wing_right":
            _reparent_preserving_world(obj, wing_right)
        else:
            _reparent_preserving_world(obj, motion_root)
    consolidate_lod_level(motion_root, f"{spec['id']}_body")
    consolidate_lod_level(wing_left, f"{spec['id']}_wing_left")
    consolidate_lod_level(wing_right, f"{spec['id']}_wing_right")
    _author_fauna_action(spec, "glide", motion_root, [
        (0.0, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        (0.8, (math.radians(2), 0.0, 0.0), (0.0, 0.0, 0.012 * s)),
        (1.6, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    ])
    _author_fauna_action(spec, "flap", wing_left, [
        (0.0, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        (0.12, (0.0, 0.0, math.radians(-38)), (0.0, 0.0, 0.0)),
        (0.24, (0.0, 0.0, math.radians(22)), (0.0, 0.0, 0.0)),
        (0.36, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    ])
    _author_fauna_action(spec, "flap", wing_right, [
        (0.0, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        (0.12, (0.0, 0.0, math.radians(38)), (0.0, 0.0, 0.0)),
        (0.24, (0.0, 0.0, math.radians(-22)), (0.0, 0.0, 0.0)),
        (0.36, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    ])
    add_collision_primitives(spec, root)


def fauna_butterfly(spec: dict, root) -> None:
    """Meadow butterfly with a flap clip on paired wings."""
    params = spec["parameters"]
    body_token, wing_token, accent_token = spec["palette"][:3]
    s = params.get("scale", 0.45)
    wing_span = params.get("wingSpan", 1.0)
    add_cylinder("butterfly_body", (0, 0, 0.02 * s), 0.016 * s, 0.1 * s, body_token, root, vertices=5, rotation=(math.pi / 2, 0, 0))
    add_ico("butterfly_head", (0, -0.055 * s, 0.028 * s), (0.02 * s, 0.02 * s, 0.02 * s), body_token, root, subdivisions=1)
    for side, sign in (("left", -1), ("right", 1)):
        add_tri_prism(
            f"butterfly_wing_{side}",
            (sign * 0.08 * s * wing_span, 0.0, 0.03 * s),
            (0.14 * s * wing_span, 0.08 * s, 0.016 * s),
            wing_token if sign < 0 else accent_token,
            root,
            rotation=(0, sign * math.radians(12), sign * math.radians(8)),
        )
    motion_root = _fauna_motion_node(f"{spec['id']}_motion_root", root)
    wing_left = _fauna_motion_node(f"{spec['id']}_wing_left_pivot", motion_root, (-0.02 * s, 0.0, 0.02 * s))
    wing_right = _fauna_motion_node(f"{spec['id']}_wing_right_pivot", motion_root, (0.02 * s, 0.0, 0.02 * s))
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH" or obj.parent is not root:
            continue
        if obj.name == "butterfly_wing_left":
            _reparent_preserving_world(obj, wing_left)
        elif obj.name == "butterfly_wing_right":
            _reparent_preserving_world(obj, wing_right)
        else:
            _reparent_preserving_world(obj, motion_root)
    consolidate_lod_level(motion_root, f"{spec['id']}_body")
    consolidate_lod_level(wing_left, f"{spec['id']}_wing_left")
    consolidate_lod_level(wing_right, f"{spec['id']}_wing_right")
    _author_fauna_action(spec, "flap", wing_left, [
        (0.0, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        (0.08, (0.0, 0.0, math.radians(-50)), (0.0, 0.0, 0.0)),
        (0.16, (0.0, 0.0, math.radians(18)), (0.0, 0.0, 0.0)),
        (0.24, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    ])
    _author_fauna_action(spec, "flap", wing_right, [
        (0.0, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        (0.08, (0.0, 0.0, math.radians(50)), (0.0, 0.0, 0.0)),
        (0.16, (0.0, 0.0, math.radians(-18)), (0.0, 0.0, 0.0)),
        (0.24, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    ])
    add_collision_primitives(spec, root)
