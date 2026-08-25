"""Rigged faceted cozy coastal-worker character and NPC generator with authored farming clips."""

from __future__ import annotations

import math

import bpy

from common.geometry import add_beam, add_box, add_collision_primitives, add_cone, add_cylinder, add_ico, add_marker, add_ring, add_tri_prism
from common.authored import add_fasteners, add_rope_line


FRAME_RATE = 25.0


def _create_character_rig(root, height: float) -> bpy.types.Object:
    bpy.ops.object.armature_add(enter_editmode=True, location=(0.0, 0.0, 0.0))
    rig = bpy.context.object
    rig.name = "char_player_rig"
    rig.data.name = "char_player_rig_data"
    edit_bones = rig.data.edit_bones
    root_bone = edit_bones[0]
    root_bone.name = "rig_root"
    root_bone.head = (0.0, 0.0, 0.02)
    root_bone.tail = (0.0, 0.0, height * 0.18)

    def add_bone(name, head, tail, parent, *, roll=0.0):
        bone = edit_bones.new(name)
        bone.head = head
        bone.tail = tail
        bone.parent = parent
        bone.use_connect = False
        bone.roll = roll
        return bone

    pelvis = add_bone(
        "rig_pelvis", (0.0, 0.0, height * 0.31), (0.0, 0.0, height * 0.47), root_bone
    )
    spine = add_bone(
        "rig_spine", (0.0, 0.0, height * 0.47), (0.0, 0.0, height * 0.72), pelvis
    )
    add_bone(
        "rig_head", (0.0, 0.0, height * 0.72), (0.0, 0.0, height * 0.98), spine
    )
    for side, sign in (("left", -1.0), ("right", 1.0)):
        upper_arm = add_bone(
            f"rig_upper_arm_{side}",
            (sign * 0.22, 0.0, height * 0.67),
            (sign * 0.32, 0.0, height * 0.49),
            spine,
            roll=sign * math.pi,
        )
        forearm = add_bone(
            f"rig_forearm_{side}",
            (sign * 0.32, 0.0, height * 0.49),
            (sign * 0.32, -0.01, height * 0.33),
            upper_arm,
            roll=sign * math.pi,
        )
        add_bone(
            f"rig_hand_{side}",
            (sign * 0.32, -0.01, height * 0.33),
            (sign * 0.32, -0.04, height * 0.25),
            forearm,
            roll=sign * math.pi,
        )
        thigh = add_bone(
            f"rig_thigh_{side}",
            (sign * 0.13, 0.0, height * 0.39),
            (sign * 0.14, 0.0, height * 0.20),
            pelvis,
            roll=sign * math.pi,
        )
        shin = add_bone(
            f"rig_shin_{side}",
            (sign * 0.14, 0.0, height * 0.20),
            (sign * 0.14, -0.01, height * 0.065),
            thigh,
            roll=sign * math.pi,
        )
        add_bone(
            f"rig_foot_{side}",
            (sign * 0.14, -0.01, height * 0.065),
            (sign * 0.14, -0.22, height * 0.045),
            shin,
            roll=sign * math.pi,
        )
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.parent = root
    rig.show_in_front = True
    rig["neva_rig"] = True
    return rig


def _rig_bone_for_mesh(name: str) -> str:
    side = "left" if "_left" in name else "right" if "_right" in name else None
    if side and ("hand_" in name or "finger_" in name):
        return f"rig_hand_{side}"
    if side and ("forearm_" in name or "sleeve_cuff_" in name or "sleeve_" in name):
        return f"rig_forearm_{side}"
    if side and "upper_arm_" in name:
        return f"rig_upper_arm_{side}"
    if side and ("boot_" in name or "boot" in name):
        return f"rig_foot_{side}"
    if side and ("shin_" in name or "trouser_cuff_" in name):
        return f"rig_shin_{side}"
    if side and "thigh_" in name:
        return f"rig_thigh_{side}"
    if any(token in name for token in ("head", "nose", "eye_", "ear_", "brow_", "mouth", "hair_", "hat_", "beard_", "bonnet_", "scarf_", "pencil", "pin", "bun", "braid", "mustache")):
        return "rig_head"
    if any(token in name for token in ("pelvis", "belt", "pouch", "hammer_", "trowel_", "skirt", "coin_", "apron_skirt")):
        return "rig_pelvis"
    return "rig_spine"


def _bind_character_meshes(root, rig: bpy.types.Object) -> None:
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and obj.parent is root]
    for mesh in meshes:
        bone_name = _rig_bone_for_mesh(mesh.name)
        world_matrix = mesh.matrix_world.copy()
        # glTF skinned-mesh nodes must remain scene roots. The Armature modifier
        # owns deformation; parenting them under the rig would make parent
        # transforms ambiguous and is rejected by the Khronos validator.
        mesh.parent = None
        mesh.matrix_world = world_matrix
        group = mesh.vertex_groups.new(name=bone_name)
        group.add(range(len(mesh.data.vertices)), 1.0, "REPLACE")
        modifier = mesh.modifiers.new(name="NEVA_CharacterRig", type="ARMATURE")
        modifier.object = rig
        mesh["neva_rig_bone"] = bone_name


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


def _key_rig_pose(rig, frame: float, rotations: dict, locations: dict | None = None) -> None:
    for pose_bone in rig.pose.bones:
        pose_bone.rotation_mode = "XYZ"
        pose_bone.rotation_euler = (0.0, 0.0, 0.0)
        pose_bone.location = (0.0, 0.0, 0.0)
        pose_bone.scale = (1.0, 1.0, 1.0)
    for bone_name, degrees in rotations.items():
        # The authored convention uses positive X for a forward reach/bend.
        # These downward-facing rest bones expose the opposite local X axis.
        rig.pose.bones[bone_name].rotation_euler = (
            math.radians(-degrees[0]),
            math.radians(degrees[1]),
            math.radians(degrees[2]),
        )
    for bone_name, location in (locations or {}).items():
        rig.pose.bones[bone_name].location = location
    for pose_bone in rig.pose.bones:
        pose_bone.keyframe_insert(data_path="rotation_euler", frame=frame, group=pose_bone.name)
        pose_bone.keyframe_insert(data_path="location", frame=frame, group=pose_bone.name)



def _author_character_actions(spec: dict, rig: bpy.types.Object) -> None:
    arms_forward = {
        "rig_upper_arm_left": (-55, 0, -7),
        "rig_forearm_left": (-48, 0, 4),
        "rig_upper_arm_right": (-55, 0, 7),
        "rig_forearm_right": (-48, 0, -4),
    }
    seated_lower = {
        "rig_thigh_left": (74, 0, -3),
        "rig_thigh_right": (74, 0, 3),
        "rig_shin_left": (-82, 0, 0),
        "rig_shin_right": (-82, 0, 0),
        "rig_foot_left": (12, 0, 0),
        "rig_foot_right": (12, 0, 0),
    }
    resting_oar_hold = {
        **seated_lower,
        "rig_spine": (-4, 0, 0),
        "rig_upper_arm_left": (-52, 0, -16),
        "rig_forearm_left": (-64, 0, 8),
        "rig_hand_left": (-8, 0, 4),
        "rig_upper_arm_right": (-52, 0, 16),
        "rig_forearm_right": (-64, 0, -8),
        "rig_hand_right": (-8, 0, -4),
    }
    poses = {
        "idle": [
            (0.0, {}, {}),
            (0.8, {"rig_spine": (1.5, 0, 1.0), "rig_head": (-1.0, 0, -1.0)}, {"rig_root": (0, 0, 0.008)}),
            (1.6, {}, {}),
        ],
        "walk": [
            (0.0, {"rig_upper_arm_left": (-24, 0, 0), "rig_upper_arm_right": (24, 0, 0), "rig_thigh_left": (28, 0, 0), "rig_thigh_right": (-28, 0, 0), "rig_shin_right": (18, 0, 0)}, {}),
            (0.2, {}, {"rig_root": (0, 0, 0.025)}),
            (0.4, {"rig_upper_arm_left": (24, 0, 0), "rig_upper_arm_right": (-24, 0, 0), "rig_thigh_left": (-28, 0, 0), "rig_thigh_right": (28, 0, 0), "rig_shin_left": (18, 0, 0)}, {}),
            (0.6, {}, {"rig_root": (0, 0, 0.025)}),
            (0.8, {"rig_upper_arm_left": (-24, 0, 0), "rig_upper_arm_right": (24, 0, 0), "rig_thigh_left": (28, 0, 0), "rig_thigh_right": (-28, 0, 0), "rig_shin_right": (18, 0, 0)}, {}),
        ],
        "walk_start": [
            (0.0, {}, {}),
            (0.12, {"rig_spine": (3, 0, 0), "rig_upper_arm_left": (-10, 0, 0), "rig_upper_arm_right": (10, 0, 0), "rig_thigh_left": (12, 0, 0), "rig_thigh_right": (-8, 0, 0)}, {}),
            (0.32, {"rig_spine": (2, 0, 0), "rig_upper_arm_left": (-24, 0, 0), "rig_upper_arm_right": (24, 0, 0), "rig_thigh_left": (28, 0, 0), "rig_thigh_right": (-28, 0, 0), "rig_shin_right": (18, 0, 0)}, {}),
        ],
        "run_start": [
            (0.0, {}, {}),
            (0.12, {"rig_spine": (7, 0, 0), "rig_upper_arm_left": (-25, 0, 0), "rig_upper_arm_right": (25, 0, 0), "rig_thigh_left": (30, 0, 0), "rig_thigh_right": (-18, 0, 0)}, {"rig_root": (0, -0.015, -0.01)}),
            (0.28, {"rig_spine": (9, 0, 0), "rig_upper_arm_left": (-42, 0, -4), "rig_upper_arm_right": (42, 0, 4), "rig_thigh_left": (43, 0, 0), "rig_thigh_right": (-40, 0, 0), "rig_shin_right": (30, 0, 0)}, {}),
        ],
        "run": [
            (0.0, {"rig_spine": (9, 0, 0), "rig_upper_arm_left": (-42, 0, -4), "rig_upper_arm_right": (42, 0, 4), "rig_thigh_left": (43, 0, 0), "rig_thigh_right": (-40, 0, 0), "rig_shin_right": (30, 0, 0)}, {}),
            (0.14, {"rig_spine": (8, 0, 0)}, {"rig_root": (0, 0, 0.035)}),
            (0.28, {"rig_spine": (9, 0, 0), "rig_upper_arm_left": (42, 0, 4), "rig_upper_arm_right": (-42, 0, -4), "rig_thigh_left": (-40, 0, 0), "rig_thigh_right": (43, 0, 0), "rig_shin_left": (30, 0, 0)}, {}),
            (0.42, {"rig_spine": (8, 0, 0)}, {"rig_root": (0, 0, 0.035)}),
            (0.56, {"rig_spine": (9, 0, 0), "rig_upper_arm_left": (-42, 0, -4), "rig_upper_arm_right": (42, 0, 4), "rig_thigh_left": (43, 0, 0), "rig_thigh_right": (-40, 0, 0), "rig_shin_right": (30, 0, 0)}, {}),
        ],
        "stop": [
            (0.0, {"rig_spine": (7, 0, 0), "rig_upper_arm_left": (-20, 0, 0), "rig_upper_arm_right": (20, 0, 0), "rig_thigh_left": (22, 0, 0), "rig_thigh_right": (-18, 0, 0)}, {}),
            (0.16, {"rig_spine": (-4, 0, 0), "rig_upper_arm_left": (8, 0, 0), "rig_upper_arm_right": (-8, 0, 0), "rig_thigh_left": (8, 0, 0), "rig_thigh_right": (14, 0, 0)}, {"rig_root": (0, 0, -0.012)}),
            (0.36, {}, {}),
        ],
        "turn_left": [
            (0.0, {}, {}),
            (0.2, {"rig_pelvis": (0, -12, -5), "rig_spine": (0, -20, -8), "rig_head": (0, 16, 5), "rig_thigh_left": (13, 0, 0), "rig_thigh_right": (-8, 0, 0)}, {"rig_root": (0, 0, -0.012)}),
            (0.4, {}, {}),
        ],
        "turn_right": [
            (0.0, {}, {}),
            (0.2, {"rig_pelvis": (0, 12, 5), "rig_spine": (0, 20, 8), "rig_head": (0, -16, -5), "rig_thigh_left": (-8, 0, 0), "rig_thigh_right": (13, 0, 0)}, {"rig_root": (0, 0, -0.012)}),
            (0.4, {}, {}),
        ],
        "talk_gesture": [
            (0.0, {}, {}),
            (0.35, {"rig_spine": (-4, 0, 2), "rig_head": (3, 0, 4), "rig_upper_arm_right": (-38, 0, 18), "rig_forearm_right": (-52, 0, -12), "rig_hand_right": (8, 0, 10)}, {"rig_root": (0, 0, 0.005)}),
            (0.80, {"rig_spine": (-1, 0, -1), "rig_head": (-2, 0, -2), "rig_upper_arm_right": (-28, 0, 14), "rig_forearm_right": (-45, 0, -8), "rig_upper_arm_left": (-20, 0, -10), "rig_forearm_left": (-35, 0, 6)}, {"rig_root": (0, 0, 0.01)}),
            (1.25, {"rig_spine": (-3, 0, 1), "rig_head": (2, 0, 2), "rig_upper_arm_right": (-34, 0, 16), "rig_forearm_right": (-48, 0, -10)}, {"rig_root": (0, 0, 0.005)}),
            (1.60, {}, {}),
        ],
        "plant": [
            (0.0, {}, {}),
            (0.14, {"rig_spine": (-12, 0, 0), "rig_upper_arm_left": (-35, 0, -5), "rig_upper_arm_right": (-35, 0, 5)}, {}),
            (0.32, {"rig_spine": (-38, 0, 0), "rig_head": (18, 0, 0), "rig_upper_arm_left": (-76, 0, -7), "rig_forearm_left": (-42, 0, 0), "rig_upper_arm_right": (-76, 0, 7), "rig_forearm_right": (-42, 0, 0), "rig_thigh_left": (18, 0, 0), "rig_thigh_right": (10, 0, 0)}, {"rig_root": (0, 0, -0.05)}),
            (0.46, {"rig_spine": (-34, 0, 0), "rig_head": (16, 0, 0), "rig_upper_arm_left": (-70, 0, -6), "rig_forearm_left": (-48, 0, 0), "rig_upper_arm_right": (-70, 0, 6), "rig_forearm_right": (-48, 0, 0)}, {"rig_root": (0, 0, -0.04)}),
            (0.72, {}, {}),
        ],
        "water": [
            (0.0, {}, {}),
            (0.20, {"rig_spine": (-16, 0, 0), "rig_upper_arm_right": (-45, 0, 14), "rig_forearm_right": (-40, 0, -8), "rig_hand_right": (14, 0, 0)}, {}),
            (0.40, {"rig_spine": (-24, 0, 0), "rig_upper_arm_right": (-62, 0, 18), "rig_forearm_right": (-52, 0, -12), "rig_hand_right": (24, 0, 0), "rig_upper_arm_left": (-20, 0, -10)}, {"rig_root": (0, 0, -0.02)}),
            (0.60, {"rig_spine": (-18, 0, 0), "rig_upper_arm_right": (-48, 0, 14), "rig_forearm_right": (-38, 0, -8)}, {}),
            (0.84, {}, {}),
        ],
        "harvest": [
            (0.0, {}, {}),
            (0.18, {"rig_spine": (-22, 0, 0), "rig_upper_arm_right": (-40, 0, 10), "rig_forearm_right": (-30, 0, 0)}, {}),
            (0.36, {"rig_spine": (-42, 0, 0), "rig_head": (20, 0, 0), "rig_upper_arm_right": (-78, 0, 24), "rig_forearm_right": (-65, 0, -18), "rig_hand_right": (18, 0, 0), "rig_upper_arm_left": (-48, 0, -12), "rig_forearm_left": (-36, 0, 8), "rig_thigh_right": (14, 0, 0), "rig_thigh_left": (18, 0, 0)}, {"rig_root": (0, 0, -0.06)}),
            (0.54, {"rig_spine": (-26, 0, 0), "rig_upper_arm_right": (-42, 0, 12), "rig_forearm_right": (-32, 0, 0)}, {}),
            (0.80, {}, {}),
        ],
        "pickup": [
            (0.0, {}, {}),
            (0.32, {"rig_spine": (-40, 0, 0), "rig_head": (18, 0, 0), **arms_forward, "rig_thigh_left": (16, 0, 0), "rig_thigh_right": (16, 0, 0)}, {"rig_root": (0, 0, -0.05)}),
            (0.64, {}, {}),
        ],
        "carry_idle": [
            (0.0, {"rig_spine": (-3, 0, 0), **arms_forward}, {}),
            (0.8, {"rig_spine": (-1, 0, 0), **arms_forward}, {"rig_root": (0, 0, 0.006)}),
            (1.6, {"rig_spine": (-3, 0, 0), **arms_forward}, {}),
        ],
        "carry_walk": [
            (0.0, {"rig_spine": (-3, 0, 0), **arms_forward, "rig_thigh_left": (28, 0, 0), "rig_thigh_right": (-28, 0, 0), "rig_shin_right": (18, 0, 0)}, {}),
            (0.22, {"rig_spine": (-2, 0, 0), **arms_forward}, {"rig_root": (0, 0, 0.02)}),
            (0.44, {"rig_spine": (-3, 0, 0), **arms_forward, "rig_thigh_left": (-28, 0, 0), "rig_thigh_right": (28, 0, 0), "rig_shin_left": (18, 0, 0)}, {}),
            (0.66, {"rig_spine": (-2, 0, 0), **arms_forward}, {"rig_root": (0, 0, 0.02)}),
            (0.88, {"rig_spine": (-3, 0, 0), **arms_forward, "rig_thigh_left": (28, 0, 0), "rig_thigh_right": (-28, 0, 0), "rig_shin_right": (18, 0, 0)}, {}),
        ],
        "carry_run": [
            (0.0, {"rig_spine": (4, 0, 0), **arms_forward, "rig_thigh_left": (42, 0, 0), "rig_thigh_right": (-38, 0, 0), "rig_shin_right": (28, 0, 0)}, {}),
            (0.16, {"rig_spine": (3, 0, 0), **arms_forward}, {"rig_root": (0, 0, 0.03)}),
            (0.32, {"rig_spine": (4, 0, 0), **arms_forward, "rig_thigh_left": (-38, 0, 0), "rig_thigh_right": (42, 0, 0), "rig_shin_left": (28, 0, 0)}, {}),
            (0.48, {"rig_spine": (3, 0, 0), **arms_forward}, {"rig_root": (0, 0, 0.03)}),
            (0.64, {"rig_spine": (4, 0, 0), **arms_forward, "rig_thigh_left": (42, 0, 0), "rig_thigh_right": (-38, 0, 0), "rig_shin_right": (28, 0, 0)}, {}),
        ],
        "place": [
            (0.0, {"rig_spine": (-4, 0, 0), **arms_forward}, {}),
            (0.52, {"rig_spine": (-38, 0, 0), "rig_head": (18, 0, 0), **arms_forward, "rig_thigh_left": (16, 0, 0), "rig_thigh_right": (16, 0, 0)}, {"rig_root": (0, 0, -0.05)}),
            (0.72, {}, {}),
        ],
        "workstation": [
            (0.0, {}, {}),
            (0.24, {"rig_spine": (-14, 0, 0), "rig_upper_arm_right": (-45, 0, 18), "rig_forearm_right": (-45, 0, -10), "rig_upper_arm_left": (-35, 0, -12), "rig_forearm_left": (-38, 0, 8)}, {}),
            (0.52, {"rig_spine": (-18, 0, 0), "rig_upper_arm_right": (-60, 0, 12), "rig_forearm_right": (-62, 0, -16), "rig_upper_arm_left": (-40, 0, -15), "rig_forearm_left": (-44, 0, 10)}, {"rig_root": (0, 0, -0.015)}),
            (0.72, {"rig_spine": (-12, 0, 0), "rig_upper_arm_right": (-40, 0, 20), "rig_forearm_right": (-35, 0, -8)}, {}),
            (0.92, {}, {}),
        ],
        "cast": [
            (0.0, {}, {}),
            (0.28, {"rig_spine": (12, 0, 0), "rig_upper_arm_right": (42, 0, 12), "rig_forearm_right": (-18, 0, 0), "rig_hand_right": (-22, 0, 0)}, {}),
            (0.58, {"rig_spine": (-24, 0, 0), "rig_upper_arm_right": (-78, 0, 8), "rig_forearm_right": (-52, 0, 0), "rig_hand_right": (28, 0, 0), "rig_upper_arm_left": (-24, 0, -8)}, {"rig_root": (0, 0, -0.02)}),
            (0.92, {"rig_spine": (-8, 0, 0), "rig_upper_arm_right": (-45, 0, 12), "rig_forearm_right": (-35, 0, 0)}, {}),
        ],
        "fishing_idle": [
            (0.0, {"rig_spine": (-6, 0, 0), "rig_upper_arm_right": (-45, 0, 12), "rig_forearm_right": (-40, 0, -4), "rig_upper_arm_left": (-32, 0, -10), "rig_forearm_left": (-38, 0, 6)}, {}),
            (0.8, {"rig_spine": (-4, 0, 0), "rig_upper_arm_right": (-42, 0, 14), "rig_forearm_right": (-38, 0, -2), "rig_upper_arm_left": (-30, 0, -8), "rig_forearm_left": (-36, 0, 8)}, {"rig_root": (0, 0, 0.005)}),
            (1.6, {"rig_spine": (-6, 0, 0), "rig_upper_arm_right": (-45, 0, 12), "rig_forearm_right": (-40, 0, -4), "rig_upper_arm_left": (-32, 0, -10), "rig_forearm_left": (-38, 0, 6)}, {}),
        ],
        "reel": [
            (0.0, {"rig_spine": (-8, 0, 0), "rig_upper_arm_right": (-48, 0, 12), "rig_forearm_right": (-45, 0, -4), "rig_upper_arm_left": (-36, 0, -12), "rig_forearm_left": (-45, 0, 10)}, {}),
            (0.24, {"rig_spine": (-10, 0, 0), "rig_upper_arm_left": (-42, 0, -18), "rig_forearm_left": (-60, 0, 14)}, {}),
            (0.48, {"rig_spine": (-8, 0, 0), "rig_upper_arm_left": (-30, 0, -8), "rig_forearm_left": (-35, 0, 4)}, {}),
            (0.72, {"rig_spine": (-8, 0, 0), "rig_upper_arm_right": (-48, 0, 12), "rig_forearm_right": (-45, 0, -4), "rig_upper_arm_left": (-36, 0, -12), "rig_forearm_left": (-45, 0, 10)}, {}),
        ],
        "slack": [
            (0.0, {"rig_spine": (4, 0, 0), "rig_upper_arm_right": (-25, 0, 12), "rig_forearm_right": (-20, 0, 0), "rig_upper_arm_left": (-18, 0, -8)}, {}),
            (0.4, {"rig_spine": (6, 0, 0), "rig_upper_arm_right": (-18, 0, 14), "rig_forearm_right": (-15, 0, 0)}, {"rig_root": (0, 0, 0.005)}),
            (0.8, {"rig_spine": (4, 0, 0), "rig_upper_arm_right": (-25, 0, 12), "rig_forearm_right": (-20, 0, 0), "rig_upper_arm_left": (-18, 0, -8)}, {}),
        ],
        "brace": [
            (0.0, {"rig_spine": (-18, 0, 0), "rig_head": (8, 0, 0), "rig_upper_arm_right": (-62, 0, 16), "rig_forearm_right": (-58, 0, -8), "rig_hand_right": (12, 0, 0), "rig_upper_arm_left": (-50, 0, -16), "rig_forearm_left": (-55, 0, 10), "rig_thigh_left": (8, 0, 0), "rig_thigh_right": (-6, 0, 0)}, {"rig_root": (0, 0, -0.02)}),
            (0.4, {"rig_spine": (-22, 0, 0), "rig_head": (10, 0, 0), "rig_upper_arm_right": (-68, 0, 18), "rig_forearm_right": (-62, 0, -10), "rig_upper_arm_left": (-55, 0, -18), "rig_forearm_left": (-58, 0, 12)}, {"rig_root": (0, 0, -0.025)}),
            (0.8, {"rig_spine": (-18, 0, 0), "rig_head": (8, 0, 0), "rig_upper_arm_right": (-62, 0, 16), "rig_forearm_right": (-58, 0, -8), "rig_hand_right": (12, 0, 0), "rig_upper_arm_left": (-50, 0, -16), "rig_forearm_left": (-55, 0, 10), "rig_thigh_left": (8, 0, 0), "rig_thigh_right": (-6, 0, 0)}, {"rig_root": (0, 0, -0.02)}),
        ],
        "board": [
            (0.0, {}, {}),
            (0.32, {"rig_thigh_right": (48, 0, 0), "rig_shin_right": (-35, 0, 0), "rig_spine": (-8, 0, 0)}, {"rig_root": (0, -0.15, 0.05)}),
            (0.64, {"rig_thigh_left": (32, 0, 0), "rig_shin_left": (-24, 0, 0), "rig_thigh_right": (12, 0, 0), "rig_spine": (-4, 0, 0)}, {"rig_root": (0, -0.35, 0.02)}),
            (0.88, resting_oar_hold, {"rig_root": (0, -0.42, -0.06)}),
        ],
        "dock": [
            (0.0, resting_oar_hold, {"rig_root": (0, -0.42, -0.06)}),
            (0.35, {"rig_spine": (-12, 0, 0), "rig_thigh_left": (24, 0, 0), "rig_thigh_right": (14, 0, 0), **arms_forward}, {"rig_root": (0, -0.22, 0.02)}),
            (0.65, {"rig_thigh_left": (10, 0, 0), "rig_thigh_right": (0, 0, 0), "rig_spine": (-4, 0, 0)}, {"rig_root": (0, -0.08, 0.01)}),
            (0.92, {}, {}),
        ],
        "rowboat_idle": [
            (0.0, resting_oar_hold, {}),
            (0.8, {**resting_oar_hold, "rig_spine": (-2, 0, 0)}, {"rig_root": (0, 0, 0.008)}),
            (1.6, resting_oar_hold, {}),
        ],
        "row": [
            (0.0, {**seated_lower, "rig_spine": (-18, 0, 0), "rig_upper_arm_left": (-70, 0, -18), "rig_forearm_left": (-45, 0, 6), "rig_upper_arm_right": (-70, 0, 18), "rig_forearm_right": (-45, 0, -6)}, {}),
            (0.18, {**seated_lower, "rig_spine": (-12, 0, 0), "rig_upper_arm_left": (-55, 0, -16), "rig_forearm_left": (-55, 0, 8), "rig_upper_arm_right": (-55, 0, 16), "rig_forearm_right": (-55, 0, -8)}, {"rig_root": (0, 0, -0.01)}),
            (0.48, {**seated_lower, "rig_spine": (16, 0, 0), "rig_upper_arm_left": (-18, 0, -12), "rig_forearm_left": (-80, 0, 12), "rig_upper_arm_right": (-18, 0, 12), "rig_forearm_right": (-80, 0, -12)}, {"rig_root": (0, 0, 0.02)}),
            (0.72, {**seated_lower, "rig_spine": (6, 0, 0), "rig_upper_arm_left": (-40, 0, -14), "rig_forearm_left": (-65, 0, 10), "rig_upper_arm_right": (-40, 0, 14), "rig_forearm_right": (-65, 0, -10)}, {}),
            (0.96, {**seated_lower, "rig_spine": (-18, 0, 0), "rig_upper_arm_left": (-70, 0, -18), "rig_forearm_left": (-45, 0, 6), "rig_upper_arm_right": (-70, 0, 18), "rig_forearm_right": (-45, 0, -6)}, {}),
        ],
    }

    bpy.context.scene.render.fps = 25
    bpy.context.scene.render.fps_base = 1.0
    fps = 25.0
    spec_clips_by_name = {clip["name"]: clip for clip in spec.get("animationClips", [])}

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
        for seconds, rotations, locations in keyframes:
            _key_rig_pose(rig, seconds * fps, rotations, locations)
        action.use_fake_user = True
    rig.animation_data.action = None

    for pose_bone in rig.pose.bones:
        pose_bone.rotation_euler = (0.0, 0.0, 0.0)
        pose_bone.location = (0.0, 0.0, 0.0)
        pose_bone.scale = (1.0, 1.0, 1.0)
    bpy.context.view_layer.update()


def _rig_character(spec: dict, root, height: float) -> None:
    rig = _create_character_rig(root, height)
    _bind_character_meshes(root, rig)
    _add_bone_socket("char_player_hand_socket_left", (-0.32, -0.03, height * 0.31), rig, "rig_hand_left")
    _add_bone_socket("char_player_hand_socket_right", (0.32, -0.03, height * 0.31), rig, "rig_hand_right")
    _add_bone_socket("char_player_tool_socket", (0.38, -0.07, height * 0.31), rig, "rig_hand_right")
    _add_bone_socket("char_player_carry_socket", (0.0, -0.38, height * 0.46), rig, "rig_hand_right")
    _add_bone_socket("char_player_hip_socket", (0.28, 0.02, height * 0.40), rig, "rig_pelvis")
    _author_character_actions(spec, rig)


def _build_stylized_head_and_face(
    root,
    head_center_z: float,
    head_height: float,
    skin_token: str,
    eye_token: str,
    brow_token: str,
    hair_token: str,
    role: str = "player"
) -> None:
    """Builds sculpted low-poly faceted skull, expressive inset eyes, planar nose bridge, and brow planes."""
    head_w = head_height * 0.46
    head_d = head_height * 0.44
    head_h = head_height * 0.50

    # 1. Main Sculpted Cranium / Head
    add_ico(
        "character_head",
        (0, -0.005, head_center_z),
        (head_w, head_d, head_h),
        skin_token,
        root,
        subdivisions=3,
    )
    # Tapered Jaw / Chin base for storybook appeal
    add_box(
        "character_chin",
        (0, -head_d * 0.45, head_center_z - head_h * 0.65),
        (head_w * 0.60, head_d * 0.55, head_h * 0.35),
        skin_token,
        root,
        bevel=0.035,
    )

    face_y = -head_d * 0.88

    # 2. Cute Stylized Planar Nose (Crisp low-poly prism, not a potato sphere)
    add_tri_prism(
        "character_nose",
        (0, face_y - 0.015, head_center_z - head_height * 0.02),
        (0.040, 0.038, 0.055),
        skin_token,
        root,
    )

    # 3. Expressive Inset Eyes & Sculpted Brows
    eye_x = head_w * 0.42
    eye_z = head_center_z + head_height * 0.06
    brow_z = head_center_z + head_height * 0.16

    for side, x in (("left", -eye_x), ("right", eye_x)):
        sign = -1.0 if side == "left" else 1.0
        # Inset dark pupil facet
        add_ico(
            f"character_eye_{side}",
            (x, face_y + 0.005, eye_z),
            (0.022, 0.014, 0.026),
            eye_token,
            root,
            subdivisions=2,
        )
        # Angled expressive brow ridge
        add_box(
            f"character_brow_{side}",
            (x, face_y - 0.006, brow_z),
            (0.052, 0.016, 0.012),
            brow_token,
            root,
            rotation=(0, 0, sign * math.radians(6)),
            bevel=0.003,
        )
        # Sculpted Ear
        add_tri_prism(
            f"character_ear_{side}",
            (sign * (head_w * 0.98), -0.01, head_center_z),
            (0.026, 0.045, 0.062),
            skin_token,
            root,
            rotation=(0, sign * math.radians(15), sign * math.radians(85)),
        )

    # 4. Subtle Carved Mouth Line
    add_box(
        "character_mouth",
        (0, face_y - 0.006, head_center_z - head_height * 0.16),
        (0.046, 0.012, 0.008),
        brow_token,
        root,
        bevel=0.002,
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
    bare_forearms: bool = False
) -> None:
    """Builds clean tapered faceted arms, rolled cuffs, 4-finger hands, and grounded boots."""
    # 1. Legs and Grounded Boots
    for side, x in (("left", -0.14), ("right", 0.14)):
        add_ico(f"character_thigh_{side}", (x, 0, height * 0.27), (0.13, 0.13, 0.26), trouser_token, root, subdivisions=3)
        add_ico(f"character_shin_{side}", (x, -0.01, height * 0.12), (0.11, 0.115, 0.22), trouser_token, root, subdivisions=3)
        add_ring(f"character_trouser_cuff_{side}", (x, -0.01, height * 0.18), 0.115, 0.024, cuff_token, root, major_segments=8, minor_segments=4)

        # Sturdy low-poly boot with distinct sole and upper
        add_box(f"character_boot_{side}", (x, -0.05, 0.075), (0.20, 0.32, 0.14), boot_token, root, bevel=0.035)
        add_box(f"character_boot_sole_{side}", (x, -0.055, 0.02), (0.22, 0.34, 0.04), boot_token, root, bevel=0.015)
        add_box(f"character_boot_lace_{side}_0", (x, -0.15, 0.10), (0.12, 0.02, 0.014), cuff_token, root, bevel=0.003)
        add_box(f"character_boot_lace_{side}_1", (x, -0.14, 0.13), (0.12, 0.02, 0.014), cuff_token, root, bevel=0.003)

    # 2. Arms, Roll-up Cuffs, and Styled Hands
    for side, x in (("left", -0.30), ("right", 0.30)):
        sign = -1.0 if side == "left" else 1.0
        arm_angle = math.radians(3 * sign)
        forearm_mat = skin_token if bare_forearms else shirt_token

        add_ico(f"character_upper_arm_{side}", (x, 0, height * 0.57), (0.105, 0.11, 0.23), shirt_token, root, subdivisions=3, rotation=(0, arm_angle, 0))
        add_ico(f"character_forearm_{side}", (x, -0.01, height * 0.43), (0.090, 0.095, 0.20), forearm_mat, root, subdivisions=3, rotation=(0, arm_angle, 0))
        add_ring(f"character_sleeve_cuff_{side}", (x, -0.01, height * 0.37), 0.095, 0.022, cuff_token, root, major_segments=8, minor_segments=4)

        # Hand palm
        add_ico(
            f"char_player_hand_{side}",
            (x, -0.02, height * 0.30),
            (0.085 * hand_scale, 0.075 * hand_scale, 0.095 * hand_scale),
            skin_token,
            root,
            subdivisions=3,
        )
        # Thumb & 3 fingers
        add_ico(
            f"character_finger_{side}_thumb",
            (x - sign * 0.045, -0.04, height * 0.305),
            (0.022 * hand_scale, 0.038 * hand_scale, 0.038 * hand_scale),
            skin_token,
            root,
            subdivisions=2,
        )
        for finger in range(3):
            add_ico(
                f"character_finger_{side}_{finger}",
                (x + (finger - 1) * 0.026, -0.075, height * 0.275),
                (0.018 * hand_scale, 0.038 * hand_scale, 0.040 * hand_scale),
                skin_token,
                root,
                subdivisions=2,
            )


def coastal_worker(spec: dict, root) -> None:
    palette = spec["palette"]
    skin = palette[0]
    shirt = palette[1]
    dark = palette[2]
    canvas = palette[3] if len(palette) > 3 else palette[1]
    band_color = palette[4] if len(palette) > 4 else dark

    params = spec["parameters"]
    height = params.get("height", 1.98)
    head_ratio = params.get("headRatio", 4.8)
    head_height = height / head_ratio
    head_half_height = head_height * 0.5
    head_half_width = head_height * 0.46
    head_half_depth = head_height * 0.44
    head_center_z = height * 0.82
    hand_scale = params.get("handScale", 1.05)

    # 1. Torso & Pelvis
    add_ico("character_torso", (0, 0, height * 0.58), (0.28, 0.20, 0.38), shirt, root, subdivisions=3)
    add_ico("character_pelvis", (0, 0.01, height * 0.38), (0.26, 0.19, 0.18), dark, root, subdivisions=3)

    # 2. Conforming Leather Explorer Vest
    add_ico("character_vest_body", (0, -0.02, height * 0.58), (0.295, 0.205, 0.34), canvas, root, subdivisions=3)
    # V-Neck & Lapels
    for side, x in (("left", -0.15), ("right", 0.15)):
        sign = -1.0 if side == "left" else 1.0
        add_tri_prism(
            f"character_vest_lapel_{side}",
            (x, -0.19, height * 0.63),
            (0.12, 0.03, 0.28),
            canvas,
            root,
            rotation=(0, sign * math.radians(10), 0),
        )
        add_box(f"character_vest_pocket_{side}", (x, -0.21, height * 0.51), (0.11, 0.03, 0.09), canvas, root, bevel=0.012)

    add_box("character_belt", (0, -0.01, height * 0.41), (0.50, 0.30, 0.08), dark, root, bevel=0.015)
    add_box("character_belt_buckle", (0, -0.16, height * 0.41), (0.10, 0.025, 0.09), canvas, root, bevel=0.008)
    add_fasteners(
        "character_vest_button",
        tuple((0, -0.21, height * (0.50 + index * 0.045)) for index in range(4)),
        0.012,
        dark,
        root,
        depth=0.025,
    )

    # 3. Limbs and Boots
    _build_stylized_limbs_and_boots(root, height, hand_scale, skin, dark, shirt, dark, canvas)

    # 4. Stylized Head & Facial Features
    neck_z = head_center_z - head_half_height * 0.90
    add_cylinder("character_neck", (0, 0, neck_z), 0.085, 0.12, skin, root, vertices=8, bevel=0.012)
    _build_stylized_head_and_face(root, head_center_z, head_height, skin, dark, dark, dark, role="player")

    # 5. Sculpted Hair (Swept Explorer Cut conforming to skull)
    hair_z = head_center_z + head_half_height * 0.20
    add_ico("character_hair_cap", (0, 0.02, hair_z), (head_half_width * 1.04, head_half_depth * 1.04, head_half_height * 0.78), dark, root, subdivisions=3)
    add_ico("character_hair_fringe", (0.05, -head_half_depth * 0.78, head_center_z + head_half_height * 0.35), (0.12, 0.06, 0.08), dark, root, subdivisions=2)
    add_ico("character_hair_side_left", (-head_half_width * 0.92, 0.0, head_center_z), (0.06, 0.08, 0.12), dark, root, subdivisions=2)
    add_ico("character_hair_side_right", (head_half_width * 0.92, 0.0, head_center_z), (0.06, 0.08, 0.12), dark, root, subdivisions=2)

    # 6. Snug Straw Expedition Hat (Correct crown recess seated on hair)
    hat_seat_z = head_center_z + head_half_height * 0.32
    add_cylinder("character_hat_crown", (0, 0.01, hat_seat_z + 0.09), 0.20, 0.14, canvas, root, vertices=10, bevel=0.020, rotation=(math.radians(3), 0, 0))
    add_cylinder("character_hat_brim", (0, -0.01, hat_seat_z + 0.02), 0.34, 0.035, canvas, root, vertices=12, bevel=0.010, rotation=(math.radians(3), 0, 0))
    add_ring("character_hat_band", (0, 0.01, hat_seat_z + 0.035), 0.205, 0.020, band_color, root, major_segments=10, minor_segments=4, rotation=(math.radians(3), 0, 0))


    # 7. Framed Expedition Backpack (Snug fit to back)
    add_box("character_backpack", (0, 0.21, height * 0.57), (0.44, 0.24, 0.52), canvas, root, bevel=0.05)
    add_cylinder("character_pack_roll", (0, 0.24, height * 0.73), 0.12, 0.40, canvas, root, vertices=8, rotation=(0, math.pi / 2, 0), bevel=0.018)
    add_ring("character_pack_roll_left", (-0.19, 0.24, height * 0.73), 0.125, 0.018, dark, root, major_segments=8, minor_segments=4, rotation=(0, math.pi / 2, 0))
    add_ring("character_pack_roll_right", (0.19, 0.24, height * 0.73), 0.125, 0.018, dark, root, major_segments=8, minor_segments=4, rotation=(0, math.pi / 2, 0))
    for side, x in (("left", -0.19), ("right", 0.19)):
        add_rope_line(
            f"character_pack_strap_{side}",
            [(x, 0.22, height * 0.73), (x * 1.18, -0.15, height * 0.62), (x * 1.05, -0.13, height * 0.46)],
            0.025, dark, root, vertices=6,
        )
        add_ico(f"character_pack_pouch_{side}", (x * 1.22, 0.26, height * 0.48), (0.10, 0.08, 0.13), canvas, root, subdivisions=2)
    add_box("character_pack_flap", (0, 0.34, height * 0.57), (0.36, 0.05, 0.24), dark, root, bevel=0.020)
    add_box("character_pack_buckle", (0, 0.37, height * 0.54), (0.08, 0.02, 0.08), canvas, root, bevel=0.008)

    _rig_character(spec, root, height)


def npc_character(spec: dict, root) -> None:
    """Procedural stylized NPC generator with bespoke role-specific outfits, hairstyles, and accessories."""
    palette = spec["palette"]
    skin = palette[0]
    garment_primary = palette[1]
    dark = palette[2]
    garment_secondary = palette[3] if len(palette) > 3 else palette[1]
    accent = palette[4] if len(palette) > 4 else palette[3] if len(palette) > 3 else palette[2]

    params = spec.get("parameters", {})
    role = params.get("role", "gardener")
    height = params.get("height", 1.95)
    head_ratio = params.get("headRatio", 4.7)
    head_height = height / head_ratio
    head_half_height = head_height * 0.5
    head_half_width = head_height * 0.46
    head_half_depth = head_height * 0.44
    head_center_z = height * 0.82
    hand_scale = params.get("handScale", 1.05)

    # 1. Base Core Torso & Pelvis
    add_ico("character_torso", (0, 0, height * 0.58), (0.28, 0.20, 0.38), garment_primary, root, subdivisions=3)
    add_ico("character_pelvis", (0, 0.01, height * 0.38), (0.26, 0.19, 0.18), dark, root, subdivisions=3)

    # 2. Base Limbs & Boots
    bare_arms = role in ("handyman", "merchant")
    _build_stylized_limbs_and_boots(root, height, hand_scale, skin, dark, garment_primary, dark, garment_secondary, bare_forearms=bare_arms)

    # 3. Base Stylized Head & Facial Features
    neck_z = head_center_z - head_half_height * 0.90
    add_cylinder("character_neck", (0, 0, neck_z), 0.085, 0.12, skin, root, vertices=8, bevel=0.012)
    brow_color = accent if role == "dockmaster" else dark
    _build_stylized_head_and_face(root, head_center_z, head_height, skin, dark, brow_color, dark, role=role)

    # 4. --- ROLE-SPECIFIC BESPOKE OUTFITS, HEADWEAR & ACCESSORIES ---

    if role == "gardener":  # Elspeth: Garden Elder & Baker
        # Soft Silver Hair with Elegant Bun
        hair_z = head_center_z + head_half_height * 0.25
        silver_token = garment_secondary
        add_ico("character_hair_cap", (0, 0.02, hair_z), (head_half_width * 1.04, head_half_depth * 1.04, head_half_height * 0.80), silver_token, root, subdivisions=3)

        add_ico("character_hair_bun", (0, 0.16, hair_z + 0.02), (0.13, 0.12, 0.13), silver_token, root, subdivisions=3)
        add_ico("character_hair_lock_left", (-head_half_width * 0.88, -0.04, head_center_z - 0.01), (0.05, 0.06, 0.10), silver_token, root, subdivisions=2)
        add_ico("character_hair_lock_right", (head_half_width * 0.88, -0.04, head_center_z - 0.01), (0.05, 0.06, 0.10), silver_token, root, subdivisions=2)

        # Snug Sunbonnet (Crown sits directly on hair with forward tilt brim)
        bonnet_z = head_center_z + head_half_height * 0.32
        add_cylinder("character_bonnet_crown", (0, 0.04, bonnet_z + 0.08), 0.21, 0.14, garment_secondary, root, vertices=10, bevel=0.020, rotation=(math.radians(8), 0, 0))
        add_cylinder("character_bonnet_brim", (0, -0.04, bonnet_z + 0.02), 0.34, 0.035, garment_secondary, root, vertices=12, bevel=0.012, rotation=(math.radians(16), 0, 0))
        add_ring("character_bonnet_band", (0, 0.03, bonnet_z + 0.03), 0.215, 0.020, accent, root, major_segments=10, minor_segments=4, rotation=(math.radians(8), 0, 0))
        # Tied chin ribbon
        add_rope_line("character_bonnet_ribbon_left", [(-0.16, 0.0, bonnet_z + 0.02), (-0.08, -0.08, neck_z), (0, -0.10, neck_z - 0.02)], 0.012, accent, root, vertices=5)
        add_rope_line("character_bonnet_ribbon_right", [(0.16, 0.0, bonnet_z + 0.02), (0.08, -0.08, neck_z), (0, -0.10, neck_z - 0.02)], 0.012, accent, root, vertices=5)

        # Conforming Cross-back Gardener Apron (Wraps torso with shoulder straps & waist sash)
        add_ico("character_apron_bib", (0, -0.03, height * 0.58), (0.30, 0.205, 0.32), garment_secondary, root, subdivisions=3)
        add_box("character_apron_skirt", (0, -0.04, height * 0.40), (0.42, 0.26, 0.28), garment_secondary, root, bevel=0.025)
        add_box("character_apron_pocket", (0, -0.18, height * 0.44), (0.20, 0.025, 0.12), accent, root, bevel=0.008)
        # Shoulder Straps
        for side, x in (("left", -0.14), ("right", 0.14)):
            add_beam(f"character_apron_strap_{side}", (x, -0.16, height * 0.65), (x * 0.9, 0.16, height * 0.62), 0.025, garment_secondary, root, vertices=4)

        # Garden Trowel in hip leather holster
        add_box("character_trowel_holster", (0.24, -0.02, height * 0.41), (0.07, 0.10, 0.16), dark, root, bevel=0.010)
        add_cylinder("character_trowel_handle", (0.24, -0.02, height * 0.51), 0.018, 0.11, garment_primary, root, vertices=6)
        add_tri_prism("character_trowel_blade", (0.24, -0.02, height * 0.35), (0.05, 0.02, 0.09), accent, root)

    elif role == "handyman":  # Barnaby: Craftsman & Handyman
        # Short cropped brown hair under cap
        hair_z = head_center_z + head_half_height * 0.20
        add_ico("character_hair_cap", (0, 0.01, hair_z), (head_half_width * 1.03, head_half_depth * 1.03, head_half_height * 0.75), dark, root, subdivisions=3)

        # Snug Tweed Flat Cap (Sits flush on the crown, NO gap!)
        cap_z = head_center_z + head_half_height * 0.28
        add_cylinder("character_hat_cap", (0, 0.02, cap_z + 0.06), 0.23, 0.10, garment_secondary, root, vertices=10, bevel=0.022, rotation=(math.radians(4), 0, 0))
        add_box("character_hat_peak", (0, -0.16, cap_z + 0.02), (0.22, 0.12, 0.022), dark, root, rotation=(math.radians(14), 0, 0), bevel=0.006)

        # Carpenter Pencil tucked behind right ear
        add_beam("character_ear_pencil", (head_half_width * 0.95, -0.02, head_center_z + 0.02), (head_half_width * 0.90, -0.14, head_center_z + 0.07), 0.010, accent, root, vertices=4)

        # Heavy Leather Carpenter Apron & Tool Belt
        add_ico("character_apron_bib", (0, -0.03, height * 0.58), (0.31, 0.21, 0.34), garment_secondary, root, subdivisions=3)
        add_box("character_apron_skirt", (0, -0.05, height * 0.39), (0.44, 0.28, 0.30), garment_secondary, root, bevel=0.025)
        add_box("character_tool_belt", (0, -0.01, height * 0.41), (0.52, 0.32, 0.09), dark, root, bevel=0.015)
        add_box("character_belt_buckle", (0, -0.17, height * 0.41), (0.11, 0.025, 0.09), accent, root, bevel=0.008)

        # Carpenter Hammer in leather belt loop
        add_cylinder("character_hammer_handle", (-0.26, -0.04, height * 0.37), 0.018, 0.26, garment_primary, root, vertices=6)
        add_box("character_hammer_head", (-0.26, -0.04, height * 0.48), (0.05, 0.10, 0.05), accent, root, bevel=0.006)

    elif role == "dockmaster":  # Old Silas: Harbor Dockmaster
        # Sculpted Sea Captain Beard (Frames mouth & cheeks; does NOT hide the face!)
        beard_color = "foam_warm_01"
        face_y = -head_half_depth * 0.88
        add_ico("character_beard_chin", (0, face_y - 0.01, head_center_z - head_height * 0.26), (0.10, 0.09, 0.14), beard_color, root, subdivisions=3)
        add_ico("character_beard_jaw_left", (-head_half_width * 0.65, -0.02, head_center_z - head_height * 0.20), (0.07, 0.09, 0.12), beard_color, root, subdivisions=2)
        add_ico("character_beard_jaw_right", (head_half_width * 0.65, -0.02, head_center_z - head_height * 0.20), (0.07, 0.09, 0.12), beard_color, root, subdivisions=2)
        # Mustache under nose
        add_box("character_beard_mustache", (0, face_y - 0.018, head_center_z - head_height * 0.10), (0.12, 0.03, 0.04), beard_color, root, bevel=0.008)

        # Snug Sou'wester Rain Hat with long rear rain flap
        hat_z = head_center_z + head_half_height * 0.30
        add_cylinder("character_hat_souwester_crown", (0, 0.01, hat_z + 0.07), 0.22, 0.13, garment_primary, root, vertices=10, bevel=0.022, rotation=(math.radians(4), 0, 0))
        # Short turned-up front brim
        add_box("character_hat_souwester_front", (0, -0.15, hat_z + 0.02), (0.28, 0.10, 0.025), garment_primary, root, rotation=(math.radians(22), 0, 0), bevel=0.008)
        # Long flared rear rain guard draping over coat collar
        add_box("character_hat_souwester_rear", (0, 0.16, hat_z - 0.01), (0.32, 0.20, 0.025), garment_primary, root, rotation=(math.radians(-30), 0, 0), bevel=0.008)

        # Foul-weather Oilskin Slicker Coat
        add_cylinder("character_coat_collar", (0, 0, height * 0.70), 0.16, 0.10, garment_primary, root, vertices=8, bevel=0.018)
        add_ico("character_coat_body", (0, -0.01, height * 0.58), (0.33, 0.22, 0.40), garment_primary, root, subdivisions=3)
        add_box("character_coat_skirt", (0, -0.02, height * 0.38), (0.48, 0.30, 0.32), garment_primary, root, bevel=0.028)

        # Brass Pocket Watch Chain
        add_rope_line("character_watch_chain", [(-0.12, -0.19, height * 0.61), (0, -0.21, height * 0.57), (0.12, -0.19, height * 0.61)], 0.010, garment_secondary, root, vertices=5)

    elif role == "merchant":  # Maeve: Fishmonger & Market Master
        # Braided Crown Coiffure
        hair_z = head_center_z + head_half_height * 0.25
        add_ico("character_hair_cap", (0, 0.02, hair_z), (head_half_width * 1.04, head_half_depth * 1.04, head_half_height * 0.80), dark, root, subdivisions=3)
        add_ico("character_hair_bun", (0, 0.16, hair_z), (0.12, 0.11, 0.12), dark, root, subdivisions=3)
        add_ring("character_hair_braid", (0, 0.02, hair_z + 0.06), 0.18, 0.024, dark, root, major_segments=10, minor_segments=4, rotation=(math.radians(12), 0, 0))

        # Knotted Nautical Neckerchief / Bandana
        add_ring("character_neck_scarf", (0, -0.01, neck_z + 0.04), 0.12, 0.028, garment_secondary, root, major_segments=8, minor_segments=4)
        add_tri_prism("character_scarf_knot", (0, -0.12, neck_z + 0.02), (0.06, 0.03, 0.08), garment_secondary, root)

        # Split-Front Merchant Apron with Coin Pouch
        add_ico("character_apron_bib", (0, -0.03, height * 0.58), (0.295, 0.205, 0.32), garment_secondary, root, subdivisions=3)
        add_box("character_apron_skirt", (0, -0.04, height * 0.40), (0.40, 0.26, 0.28), garment_secondary, root, bevel=0.022)
        add_box("character_coin_pouch", (0.22, -0.04, height * 0.41), (0.08, 0.10, 0.12), dark, root, bevel=0.012)
        add_cylinder("character_scale_pin", (-0.10, -0.18, height * 0.63), 0.024, 0.012, accent, root, vertices=6, rotation=(math.pi / 2, 0, 0))

    _rig_character(spec, root, height)


def fauna_cow(spec: dict, root) -> None:
    """Build a chunky low-poly dairy cow with black-and-white patches and bell collar."""
    params = spec["parameters"]
    white, black, pink, horn_token, bell_token = spec["palette"]
    scale = params.get("scale", 1.0)

    # Body Torso
    add_box("cow_body_main", (0, 0, 1.15 * scale), (0.92 * scale, 1.85 * scale, 0.98 * scale), white, root, bevel=0.08 * scale)
    # Dark coat patches
    add_box("cow_patch_left", (-0.46 * scale, 0.2 * scale, 1.25 * scale), (0.06 * scale, 0.72 * scale, 0.58 * scale), black, root, bevel=0.0)
    add_box("cow_patch_right", (0.46 * scale, -0.3 * scale, 1.15 * scale), (0.06 * scale, 0.82 * scale, 0.52 * scale), black, root, bevel=0.0)
    add_box("cow_patch_top", (0, 0.1 * scale, 1.64 * scale), (0.62 * scale, 0.65 * scale, 0.06 * scale), black, root, bevel=0.0)

    # 4 Sturdy Legs & Hooves
    leg_coords = (
        ("front_left", -0.32, -0.62),
        ("front_right", 0.32, -0.62),
        ("rear_left", -0.32, 0.65),
        ("rear_right", 0.32, 0.65),
    )
    for leg_name, lx, ly in leg_coords:
        add_box(f"cow_leg_{leg_name}", (lx * scale, ly * scale, 0.42 * scale), (0.24 * scale, 0.26 * scale, 0.84 * scale), white, root, bevel=0.02 * scale)
        add_box(f"cow_hoof_{leg_name}", (lx * scale, ly * scale, 0.06 * scale), (0.26 * scale, 0.28 * scale, 0.12 * scale), black, root, bevel=0.0)

    # Neck and Head
    add_box("cow_neck", (0, -0.92 * scale, 1.32 * scale), (0.54 * scale, 0.58 * scale, 0.62 * scale), white, root, rotation=(math.radians(24), 0, 0), bevel=0.04 * scale)
    add_box("cow_head", (0, -1.28 * scale, 1.48 * scale), (0.58 * scale, 0.62 * scale, 0.58 * scale), black, root, rotation=(math.radians(12), 0, 0), bevel=0.04 * scale)
    add_box("cow_snout", (0, -1.58 * scale, 1.34 * scale), (0.44 * scale, 0.34 * scale, 0.32 * scale), pink, root, bevel=0.03 * scale)

    # Horns & Ears
    for side, sign in (("left", -1), ("right", 1)):
        add_cone(f"cow_horn_{side}", (sign * 0.32 * scale, -1.22 * scale, 1.82 * scale), 0.06 * scale, 0.015 * scale, 0.28 * scale, horn_token, root, vertices=6, rotation=(math.radians(-25), 0, sign * math.radians(45)))
        add_tri_prism(f"cow_ear_{side}", (sign * 0.36 * scale, -1.18 * scale, 1.55 * scale), (0.22 * scale, 0.08 * scale, 0.14 * scale), white, root, rotation=(0, sign * math.radians(20), sign * math.radians(80)))

    # Tail
    add_beam("cow_tail", (0, 0.94 * scale, 1.42 * scale), (0, 1.05 * scale, 0.65 * scale), 0.045 * scale, white, root, vertices=5)
    add_ico("cow_tail_brush", (0, 1.05 * scale, 0.58 * scale), (0.08 * scale, 0.08 * scale, 0.14 * scale), black, root, subdivisions=2)

    # Bell Collar
    add_box("cow_collar", (0, -0.88 * scale, 1.25 * scale), (0.60 * scale, 0.10 * scale, 0.64 * scale), black, root, rotation=(math.radians(24), 0, 0), bevel=0.0)
    add_cone("cow_bell", (0, -0.98 * scale, 0.95 * scale), 0.09 * scale, 0.05 * scale, 0.14 * scale, bell_token, root, vertices=6)
    add_collision_primitives(spec, root)


def fauna_chicken(spec: dict, root) -> None:
    """Build a low-poly farm hen/rooster."""
    params = spec["parameters"]
    feather, dark, comb_token, beak_token = spec["palette"]
    scale = params.get("scale", 0.65)

    # Body & Breast
    add_ico("chicken_body", (0, 0, 0.36 * scale), (0.34 * scale, 0.44 * scale, 0.36 * scale), feather, root, subdivisions=2)
    # Tail Feathers
    add_tri_prism("chicken_tail", (0, 0.28 * scale, 0.48 * scale), (0.16 * scale, 0.24 * scale, 0.34 * scale), dark, root, rotation=(math.radians(35), 0, 0))
    # Head & Neck
    add_cone("chicken_neck", (0, -0.22 * scale, 0.52 * scale), 0.12 * scale, 0.09 * scale, 0.32 * scale, feather, root, vertices=6)
    add_ico("chicken_head", (0, -0.24 * scale, 0.68 * scale), (0.11 * scale, 0.13 * scale, 0.12 * scale), feather, root, subdivisions=2)
    # Beak
    add_cone("chicken_beak", (0, -0.35 * scale, 0.66 * scale), 0.045 * scale, 0.005 * scale, 0.11 * scale, beak_token, root, vertices=4, rotation=(math.pi / 2, 0, 0))
    # Comb & Wattle
    add_box("chicken_comb", (0, -0.22 * scale, 0.78 * scale), (0.025 * scale, 0.14 * scale, 0.09 * scale), comb_token, root, bevel=0.0)
    add_box("chicken_wattle", (0, -0.28 * scale, 0.58 * scale), (0.02 * scale, 0.06 * scale, 0.07 * scale), comb_token, root, bevel=0.0)
    # Legs
    for side, sign in (("left", -1), ("right", 1)):
        add_cylinder(f"chicken_leg_{side}", (sign * 0.10 * scale, 0, 0.16 * scale), 0.018 * scale, 0.32 * scale, beak_token, root, vertices=5)
        add_box(f"chicken_foot_{side}", (sign * 0.10 * scale, -0.04 * scale, 0.02 * scale), (0.08 * scale, 0.10 * scale, 0.02 * scale), beak_token, root, bevel=0.0)
    add_collision_primitives(spec, root)
