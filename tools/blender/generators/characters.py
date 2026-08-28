"""Rigged faceted cozy coastal-worker character and NPC generator with authored farming clips."""

from __future__ import annotations

import math

import bpy

from collections import defaultdict

from common.geometry import add_beam, add_box, add_collision_primitives, add_cone, add_cylinder, add_ico, add_marker, add_ring, add_tapered_beam, add_tri_prism, join_meshes
from common.authored import add_fasteners, add_lattice, add_rope_line
from common.lod import consolidate_lod_level, create_lod_roots


FRAME_RATE = 25.0


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
    bpy.context.scene.render.fps = int(FRAME_RATE)
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
        node.keyframe_insert(data_path="rotation_euler", frame=seconds * FRAME_RATE)
        node.keyframe_insert(data_path="location", frame=seconds * FRAME_RATE)
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
    bpy.context.scene.render.fps = int(FRAME_RATE)
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
            node.keyframe_insert(data_path="rotation_euler", frame=seconds * FRAME_RATE)
            node.keyframe_insert(data_path="location", frame=seconds * FRAME_RATE)
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
        "rig_spine", (0.0, 0.0, height * 0.47), (0.0, 0.0, height * 0.60), pelvis
    )
    chest = add_bone(
        "rig_chest", (0.0, 0.0, height * 0.60), (0.0, 0.0, height * 0.72), spine
    )
    neck = add_bone(
        "rig_neck", (0.0, 0.0, height * 0.72), (0.0, 0.0, height * 0.78), chest
    )
    head = add_bone(
        "rig_head", (0.0, 0.0, height * 0.78), (0.0, 0.0, height * 0.98), neck
    )
    for side, sign in (("left", -1.0), ("right", 1.0)):
        clavicle = add_bone(
            f"rig_clavicle_{side}",
            (sign * 0.04, 0.0, height * 0.68),
            (sign * 0.22, 0.0, height * 0.67),
            chest,
            roll=sign * math.pi,
        )
        upper_arm = add_bone(
            f"rig_upper_arm_{side}",
            (sign * 0.22, 0.0, height * 0.67),
            (sign * 0.38, 0.0, height * 0.49),
            clavicle,
            roll=sign * math.pi,
        )
        forearm = add_bone(
            f"rig_forearm_{side}",
            (sign * 0.38, 0.0, height * 0.49),
            (sign * 0.38, -0.01, height * 0.33),
            upper_arm,
            roll=sign * math.pi,
        )
        add_bone(
            f"rig_hand_{side}",
            (sign * 0.38, -0.01, height * 0.33),
            (sign * 0.38, -0.04, height * 0.25),
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
    backpack = add_bone(
        "rig_backpack",
        (0.0, 0.16, height * 0.52),
        (0.0, 0.34, height * 0.62),
        spine,
    )
    add_bone(
        "rig_canteen_left",
        (-0.28, 0.18, height * 0.48),
        (-0.28, 0.28, height * 0.50),
        backpack,
    )
    add_bone(
        "rig_canteen_right",
        (0.28, 0.18, height * 0.48),
        (0.28, 0.28, height * 0.50),
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
    if "canteen" in name and side:
        return f"rig_canteen_{side}"
    if any(token in name for token in ("backpack", "pack_roll", "pack_flap", "pack_pouch", "pack_frame", "pack_buckle", "pack_lower", "pack_strap", "pack_body", "pack_bedroll")):
        return "rig_backpack"
    if "hat_brim" in name:
        return "rig_hat_brim"
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
        _assign_character_weights(mesh, bone_name, height=height)
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

    if spec and lod_index == 0:
        for side, fallback in (("left", (-0.38, -0.02, height * 0.30)), ("right", (0.38, -0.02, height * 0.30))):
            marker_name = f"{prefix}_hand_{side}"
            if bpy.data.objects.get(marker_name) is None:
                add_marker(marker_name, hand_markers.get(side, fallback), root, marker_type="socket")


def _assign_character_weights(mesh, bone_name: str, height: float = 1.98) -> None:
    """Smooth geometric distance-falloff skin weighting across articulated joint loops."""
    vertices = list(range(len(mesh.data.vertices)))
    primary = mesh.vertex_groups.get(bone_name) or mesh.vertex_groups.new(name=bone_name)
    primary.add(vertices, 1.0, "REPLACE")
    name = mesh.name
    side = "left" if "_left" in name else "right" if "_right" in name else None

    def add_weight(group_name: str, vertex_idx: int, weight: float) -> None:
        if weight <= 0.001:
            return
        group = mesh.vertex_groups.get(group_name) or mesh.vertex_groups.new(name=group_name)
        group.add([vertex_idx], weight, "ADD")

    for vertex_index, vertex in enumerate(mesh.data.vertices):
        world_co = mesh.matrix_world @ vertex.co
        vx, vy, vz = world_co.x, world_co.y, world_co.z

        # 1. Torso, vest, coat, apron, straps, quilt (primary: rig_spine or rig_chest)
        if any(token in name for token in ("vest", "torso", "coat_body", "apron_bib", "coat_lapel", "coat_collar", "watch_chain", "coat_button", "apron_strap", "apron_buckle", "scale_pin", "ruler_", "chisel_", "herb_")):
            # Lower waist blending to pelvis
            if vz < height * 0.49:
                t = max(0.0, min(1.0, (height * 0.49 - vz) / (height * 0.08)))
                add_weight("rig_pelvis", vertex_index, t * 0.40)
            # Mid-to-upper chest blending to rig_chest
            if vz > height * 0.54:
                t = max(0.0, min(1.0, (vz - height * 0.54) / (height * 0.12)))
                add_weight("rig_chest", vertex_index, t * 0.65)
            # Upper chest / neck junction blending to rig_neck
            if vz > height * 0.67:
                t = max(0.0, min(1.0, (vz - height * 0.67) / (height * 0.07)))
                add_weight("rig_neck", vertex_index, t * 0.30)
            # Lateral shoulder / clavicle blends
            if vz > height * 0.52:
                if vx < -0.06:
                    dist = min(1.0, (abs(vx) - 0.06) / 0.14)
                    add_weight("rig_clavicle_left", vertex_index, dist * 0.24)
                    add_weight("rig_upper_arm_left", vertex_index, dist * 0.18)
                elif vx > 0.06:
                    dist = min(1.0, (abs(vx) - 0.06) / 0.14)
                    add_weight("rig_clavicle_right", vertex_index, dist * 0.24)
                    add_weight("rig_upper_arm_right", vertex_index, dist * 0.18)

        # 2. Pelvis, belt, skirts, lower garments (primary: rig_pelvis)
        elif any(token in name for token in ("pelvis", "belt", "skirt", "apron_skirt", "apron_fold", "coat_skirt", "dress_skirt", "pouch", "trowel_", "seed_", "ledger_", "keys", "dock_rope", "spyglass", "holster")):
            if vz > height * 0.40:
                t = max(0.0, min(1.0, (vz - height * 0.40) / (height * 0.08)))
                add_weight("rig_spine", vertex_index, t * 0.45)
            if vz < height * 0.36:
                if vx < -0.04:
                    add_weight("rig_thigh_left", vertex_index, min(0.25, abs(vx) * 0.9))
                elif vx > 0.04:
                    add_weight("rig_thigh_right", vertex_index, min(0.25, abs(vx) * 0.9))

        # 3. Upper arms and shoulders (primary: rig_upper_arm_{side})
        elif "upper_arm" in name or "shoulder" in name:
            s = side or ("left" if vx < 0 else "right")
            # Elbow falloff
            if vz < height * 0.56:
                t = max(0.0, min(1.0, (height * 0.56 - vz) / (height * 0.08)))
                add_weight(f"rig_forearm_{s}", vertex_index, t * 0.42)
            # Clavicle & chest falloff
            if vz > height * 0.60:
                t = max(0.0, min(1.0, (vz - height * 0.60) / (height * 0.08)))
                add_weight(f"rig_clavicle_{s}", vertex_index, t * 0.30)
                add_weight("rig_chest", vertex_index, t * 0.18)

        # 4. Elbow joint mesh
        elif "elbow" in name:
            s = side or ("left" if vx < 0 else "right")
            add_weight(f"rig_upper_arm_{s}", vertex_index, 0.50)
            add_weight(f"rig_forearm_{s}", vertex_index, 0.50)

        # 5. Forearm, sleeve cuff, coat cuff, sleeve guard (primary: rig_forearm_{side})
        elif any(token in name for token in ("forearm", "sleeve_cuff", "sleeve_guard", "coat_cuff")):
            s = side or ("left" if vx < 0 else "right")
            # Elbow falloff
            if vz > height * 0.43:
                t = max(0.0, min(1.0, (vz - height * 0.43) / (height * 0.07)))
                add_weight(f"rig_upper_arm_{s}", vertex_index, t * 0.42)
            # Wrist falloff
            if vz < height * 0.36:
                t = max(0.0, min(1.0, (height * 0.36 - vz) / (height * 0.05)))
                add_weight(f"rig_hand_{s}", vertex_index, t * 0.25)

        # 6. Hand and fingers (primary: rig_hand_{side})
        elif "hand" in name or "finger" in name:
            s = side or ("left" if vx < 0 else "right")
            if vz > height * 0.31:
                t = max(0.0, min(1.0, (vz - height * 0.31) / (height * 0.035)))
                add_weight(f"rig_forearm_{s}", vertex_index, t * 0.25)

        # 7. Thigh (primary: rig_thigh_{side})
        elif "thigh" in name:
            s = side or ("left" if vx < 0 else "right")
            # Hip falloff
            if vz > height * 0.33:
                t = max(0.0, min(1.0, (vz - height * 0.33) / (height * 0.07)))
                add_weight("rig_pelvis", vertex_index, t * 0.35)
            # Knee falloff
            if vz < height * 0.27:
                t = max(0.0, min(1.0, (height * 0.27 - vz) / (height * 0.07)))
                add_weight(f"rig_shin_{s}", vertex_index, t * 0.42)

        # 8. Knee joint mesh
        elif "knee" in name:
            s = side or ("left" if vx < 0 else "right")
            add_weight(f"rig_thigh_{s}", vertex_index, 0.50)
            add_weight(f"rig_shin_{s}", vertex_index, 0.50)

        # 9. Shin, trouser cuff (primary: rig_shin_{side})
        elif "shin" in name or "trouser_cuff" in name:
            s = side or ("left" if vx < 0 else "right")
            # Knee falloff
            if vz > height * 0.15:
                t = max(0.0, min(1.0, (vz - height * 0.15) / (height * 0.06)))
                add_weight(f"rig_thigh_{s}", vertex_index, t * 0.42)
            # Ankle falloff
            if vz < height * 0.10:
                t = max(0.0, min(1.0, (height * 0.10 - vz) / (height * 0.04)))
                add_weight(f"rig_foot_{s}", vertex_index, t * 0.30)

        # 10. Boots and feet (primary: rig_foot_{side})
        elif "boot" in name:
            s = side or ("left" if vx < 0 else "right")
            if vz > 0.09:
                t = max(0.0, min(1.0, (vz - 0.09) / 0.06))
                add_weight(f"rig_shin_{s}", vertex_index, t * 0.30)

        # 11. Neck and collar (primary: rig_neck)
        elif any(token in name for token in ("neck", "collar", "scarf")):
            if vz < height * 0.73:
                t = max(0.0, min(1.0, (height * 0.73 - vz) / (height * 0.04)))
                add_weight("rig_chest", vertex_index, t * 0.40)
            if vz > height * 0.76:
                t = max(0.0, min(1.0, (vz - height * 0.76) / (height * 0.04)))
                add_weight("rig_head", vertex_index, t * 0.40)

        # 12. Head, jaw, chin, beard (primary: rig_head)
        elif any(token in name for token in ("head", "chin", "jaw", "beard", "bonnet_ribbon")):
            if vz < height * 0.76:
                t = max(0.0, min(1.0, (height * 0.76 - vz) / (height * 0.05)))
                add_weight("rig_neck", vertex_index, t * 0.25)

        # 13. Backpack and canteens
        elif any(token in name for token in ("backpack", "pack_")) and "canteen" not in name:
            if vy < 0.0:
                add_weight("rig_chest", vertex_index, 0.30)
                add_weight("rig_spine", vertex_index, 0.15)
            else:
                add_weight("rig_spine", vertex_index, 0.15)
        elif "canteen" in name:
            add_weight("rig_backpack", vertex_index, 0.15)

    # Normalize vertex weights with max 4 influences
    for vertex in mesh.data.vertices:
        influences = []
        for assignment in vertex.groups:
            group = mesh.vertex_groups[assignment.group]
            weight = group.weight(vertex.index)
            if weight > 0.0:
                influences.append((group, weight))
        if not influences:
            continue
        if len(influences) > 4:
            influences.sort(key=lambda item: item[1], reverse=True)
            for group, _ in influences[4:]:
                group.add([vertex.index], 0.0, "REPLACE")
            influences = influences[:4]
        total = sum(w for _, w in influences)
        if total > 0.0:
            for group, weight in influences:
                group.add([vertex.index], weight / total, "REPLACE")


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
        if bone_name not in rig.pose.bones:
            continue
        rig.pose.bones[bone_name].rotation_euler = (
            math.radians(-degrees[0]),
            math.radians(degrees[1]),
            math.radians(degrees[2]),
        )
    for bone_name, location in (locations or {}).items():
        if bone_name not in rig.pose.bones:
            continue
        rig.pose.bones[bone_name].location = location
    for pose_bone in rig.pose.bones:
        pose_bone.keyframe_insert(data_path="rotation_euler", frame=frame, group=pose_bone.name)
        pose_bone.keyframe_insert(data_path="location", frame=frame, group=pose_bone.name)



def _author_character_actions(spec: dict, rig: bpy.types.Object) -> None:
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
    resting_oar_hold = {
        **seated_lower,
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
        **seated_lower,
        "rig_spine": (-2, 0, 0),
        "rig_chest": (-2, 0, 0),
        "rig_neck": (1, 0, 0),
        "rig_head": (2, 0, 0),
        "rig_clavicle_left": (-3, 0, -3),
        "rig_upper_arm_left": (-42, 0, -13),
        "rig_forearm_left": (-52, 0, 8),
        "rig_hand_left": (12, 0, 6),
        "rig_clavicle_right": (-3, 0, 3),
        "rig_upper_arm_right": (-42, 0, 13),
        "rig_forearm_right": (-52, 0, -8),
        "rig_hand_right": (12, 0, -6),
    }
    poses = {
        "idle": [
            (0.0, {}, {}),
            (0.8, {"rig_spine": (1.0, 0, 0.5), "rig_chest": (1.0, 0, 0.5), "rig_neck": (-0.6, 0, -0.4), "rig_head": (-0.8, 0, -0.6)}, {"rig_root": (0, 0, 0.008)}),
            (1.6, {}, {}),
        ],
        "walk": [
            (0.0, {"rig_chest": (2, -2, -1), "rig_clavicle_left": (-2, 0, 0), "rig_clavicle_right": (2, 0, 0), "rig_upper_arm_left": (-22, 0, 0), "rig_upper_arm_right": (22, 0, 0), "rig_thigh_left": (28, 0, 0), "rig_thigh_right": (-28, 0, 0), "rig_shin_right": (18, 0, 0)}, {}),
            (0.2, {}, {"rig_root": (0, 0, 0.025)}),
            (0.4, {"rig_chest": (2, 2, 1), "rig_clavicle_left": (2, 0, 0), "rig_clavicle_right": (-2, 0, 0), "rig_upper_arm_left": (22, 0, 0), "rig_upper_arm_right": (-22, 0, 0), "rig_thigh_left": (-28, 0, 0), "rig_thigh_right": (28, 0, 0), "rig_shin_left": (18, 0, 0)}, {}),
            (0.6, {}, {"rig_root": (0, 0, 0.025)}),
            (0.8, {"rig_chest": (2, -2, -1), "rig_clavicle_left": (-2, 0, 0), "rig_clavicle_right": (2, 0, 0), "rig_upper_arm_left": (-22, 0, 0), "rig_upper_arm_right": (22, 0, 0), "rig_thigh_left": (28, 0, 0), "rig_thigh_right": (-28, 0, 0), "rig_shin_right": (18, 0, 0)}, {}),
        ],
        "walk_start": [
            (0.0, {}, {}),
            (0.12, {"rig_spine": (2, 0, 0), "rig_chest": (2, 0, 0), "rig_upper_arm_left": (-10, 0, 0), "rig_upper_arm_right": (10, 0, 0), "rig_thigh_left": (12, 0, 0), "rig_thigh_right": (-8, 0, 0)}, {}),
            (0.32, {"rig_spine": (1, 0, 0), "rig_chest": (2, -2, -1), "rig_clavicle_left": (-2, 0, 0), "rig_clavicle_right": (2, 0, 0), "rig_upper_arm_left": (-22, 0, 0), "rig_upper_arm_right": (22, 0, 0), "rig_thigh_left": (28, 0, 0), "rig_thigh_right": (-28, 0, 0), "rig_shin_right": (18, 0, 0)}, {}),
        ],
        "run_start": [
            (0.0, {}, {}),
            (0.12, {"rig_spine": (4, 0, 0), "rig_chest": (4, 0, 0), "rig_upper_arm_left": (-25, 0, 0), "rig_upper_arm_right": (25, 0, 0), "rig_thigh_left": (30, 0, 0), "rig_thigh_right": (-18, 0, 0)}, {"rig_root": (0, -0.015, -0.01)}),
            (0.28, {"rig_spine": (5, 0, 0), "rig_chest": (5, -3, -2), "rig_clavicle_left": (-4, 0, 0), "rig_clavicle_right": (4, 0, 0), "rig_upper_arm_left": (-38, 0, -4), "rig_upper_arm_right": (38, 0, 4), "rig_thigh_left": (43, 0, 0), "rig_thigh_right": (-40, 0, 0), "rig_shin_right": (30, 0, 0)}, {}),
        ],
        "run": [
            (0.0, {"rig_spine": (5, 0, 0), "rig_chest": (5, -3, -2), "rig_clavicle_left": (-4, 0, 0), "rig_clavicle_right": (4, 0, 0), "rig_upper_arm_left": (-38, 0, -4), "rig_upper_arm_right": (38, 0, 4), "rig_thigh_left": (43, 0, 0), "rig_thigh_right": (-40, 0, 0), "rig_shin_right": (30, 0, 0)}, {}),
            (0.14, {"rig_spine": (4, 0, 0), "rig_chest": (4, 0, 0)}, {"rig_root": (0, 0, 0.035)}),
            (0.28, {"rig_spine": (5, 0, 0), "rig_chest": (5, 3, 2), "rig_clavicle_left": (4, 0, 0), "rig_clavicle_right": (-4, 0, 0), "rig_upper_arm_left": (38, 0, 4), "rig_upper_arm_right": (-38, 0, -4), "rig_thigh_left": (-40, 0, 0), "rig_thigh_right": (43, 0, 0), "rig_shin_left": (30, 0, 0)}, {}),
            (0.42, {"rig_spine": (4, 0, 0), "rig_chest": (4, 0, 0)}, {"rig_root": (0, 0, 0.035)}),
            (0.56, {"rig_spine": (5, 0, 0), "rig_chest": (5, -3, -2), "rig_clavicle_left": (-4, 0, 0), "rig_clavicle_right": (4, 0, 0), "rig_upper_arm_left": (-38, 0, -4), "rig_upper_arm_right": (38, 0, 4), "rig_thigh_left": (43, 0, 0), "rig_thigh_right": (-40, 0, 0), "rig_shin_right": (30, 0, 0)}, {}),
        ],
        "stop": [
            (0.0, {"rig_spine": (4, 0, 0), "rig_chest": (4, 0, 0), "rig_upper_arm_left": (-20, 0, 0), "rig_upper_arm_right": (20, 0, 0), "rig_thigh_left": (22, 0, 0), "rig_thigh_right": (-18, 0, 0)}, {}),
            (0.16, {"rig_spine": (-2, 0, 0), "rig_chest": (-3, 0, 0), "rig_upper_arm_left": (8, 0, 0), "rig_upper_arm_right": (-8, 0, 0), "rig_thigh_left": (8, 0, 0), "rig_thigh_right": (14, 0, 0)}, {"rig_root": (0, 0, -0.012)}),
            (0.36, {}, {}),
        ],
        "turn_left": [
            (0.0, {}, {}),
            (0.2, {"rig_pelvis": (0, -10, -4), "rig_spine": (0, -10, -4), "rig_chest": (0, -12, -5), "rig_neck": (0, 6, 2), "rig_head": (0, 10, 3), "rig_thigh_left": (13, 0, 0), "rig_thigh_right": (-8, 0, 0)}, {"rig_root": (0, 0, -0.012)}),
            (0.4, {}, {}),
        ],
        "turn_right": [
            (0.0, {}, {}),
            (0.2, {"rig_pelvis": (0, 10, 4), "rig_spine": (0, 10, 4), "rig_chest": (0, 12, 5), "rig_neck": (0, -6, -2), "rig_head": (0, -10, -3), "rig_thigh_left": (-8, 0, 0), "rig_thigh_right": (13, 0, 0)}, {"rig_root": (0, 0, -0.012)}),
            (0.4, {}, {}),
        ],
        "jump_start": [
            (0.0, {"rig_spine": (-2, 0, 0), "rig_chest": (-3, 0, 0), "rig_thigh_left": (12, 0, 0), "rig_thigh_right": (12, 0, 0), "rig_shin_left": (-18, 0, 0), "rig_shin_right": (-18, 0, 0)}, {"rig_root": (0, 0, -0.035)}),
            (0.10, {"rig_spine": (4, 0, 0), "rig_chest": (5, 0, 0), "rig_upper_arm_left": (22, 0, -4), "rig_upper_arm_right": (22, 0, 4), "rig_thigh_left": (-12, 0, 0), "rig_thigh_right": (-8, 0, 0)}, {"rig_root": (0, 0, 0.018)}),
            (0.28, {"rig_spine": (3, 0, 0), "rig_chest": (3, 0, 0), "rig_upper_arm_left": (28, 0, -5), "rig_upper_arm_right": (28, 0, 5), "rig_thigh_left": (-22, 0, 0), "rig_thigh_right": (-14, 0, 0), "rig_shin_left": (18, 0, 0), "rig_shin_right": (12, 0, 0)}, {"rig_root": (0, 0, 0.025)}),
        ],
        "fall": [
            (0.0, {"rig_spine": (-2, 0, 0), "rig_chest": (-2, 0, 0), "rig_upper_arm_left": (-8, 0, -18), "rig_upper_arm_right": (-8, 0, 18), "rig_forearm_left": (-18, 0, 8), "rig_forearm_right": (-18, 0, -8), "rig_thigh_left": (-14, 0, 0), "rig_thigh_right": (-8, 0, 0), "rig_shin_left": (20, 0, 0), "rig_shin_right": (14, 0, 0)}, {}),
            (0.30, {"rig_spine": (-3, 0, 0), "rig_chest": (-3, 0, 0), "rig_neck": (2, 0, 0), "rig_head": (3, 0, 0), "rig_upper_arm_left": (-12, 0, -20), "rig_upper_arm_right": (-12, 0, 20), "rig_thigh_left": (-10, 0, 0), "rig_thigh_right": (-14, 0, 0), "rig_shin_left": (16, 0, 0), "rig_shin_right": (20, 0, 0)}, {"rig_root": (0, 0, -0.008)}),
            (0.60, {"rig_spine": (-2, 0, 0), "rig_chest": (-2, 0, 0), "rig_upper_arm_left": (-8, 0, -18), "rig_upper_arm_right": (-8, 0, 18), "rig_forearm_left": (-18, 0, 8), "rig_forearm_right": (-18, 0, -8), "rig_thigh_left": (-14, 0, 0), "rig_thigh_right": (-8, 0, 0), "rig_shin_left": (20, 0, 0), "rig_shin_right": (14, 0, 0)}, {}),
        ],
        "land_soft": [
            (0.0, {"rig_spine": (-5, 0, 0), "rig_chest": (-6, 0, 0), "rig_neck": (2, 0, 0), "rig_upper_arm_left": (10, 0, -6), "rig_upper_arm_right": (10, 0, 6), "rig_thigh_left": (18, 0, 0), "rig_thigh_right": (18, 0, 0), "rig_shin_left": (-28, 0, 0), "rig_shin_right": (-28, 0, 0)}, {"rig_root": (0, 0, -0.055)}),
            (0.12, {"rig_spine": (-3, 0, 0), "rig_chest": (-4, 0, 0), "rig_thigh_left": (12, 0, 0), "rig_thigh_right": (12, 0, 0), "rig_shin_left": (-18, 0, 0), "rig_shin_right": (-18, 0, 0)}, {"rig_root": (0, 0, -0.025)}),
            (0.32, {}, {}),
        ],
        "land_hard": [
            (0.0, {"rig_spine": (-12, 0, 0), "rig_chest": (-14, 0, 0), "rig_neck": (5, 0, 0), "rig_head": (8, 0, 0), "rig_clavicle_left": (-4, 0, -4), "rig_clavicle_right": (-4, 0, 4), "rig_upper_arm_left": (-28, 0, -10), "rig_upper_arm_right": (-28, 0, 10), "rig_forearm_left": (-24, 0, 6), "rig_forearm_right": (-24, 0, -6), "rig_thigh_left": (34, 0, 0), "rig_thigh_right": (34, 0, 0), "rig_shin_left": (-48, 0, 0), "rig_shin_right": (-48, 0, 0)}, {"rig_root": (0, 0, -0.11)}),
            (0.16, {"rig_spine": (-7, 0, 0), "rig_chest": (-8, 0, 0), "rig_neck": (3, 0, 0), "rig_head": (5, 0, 0), "rig_upper_arm_left": (-16, 0, -6), "rig_upper_arm_right": (-16, 0, 6), "rig_thigh_left": (22, 0, 0), "rig_thigh_right": (22, 0, 0), "rig_shin_left": (-32, 0, 0), "rig_shin_right": (-32, 0, 0)}, {"rig_root": (0, 0, -0.065)}),
            (0.48, {}, {}),
        ],
        "talk_gesture": [
            (0.0, {}, {}),
            (0.35, {"rig_spine": (-2, 0, 1), "rig_chest": (-2, 0, 2), "rig_neck": (1, 0, 2), "rig_head": (2, 0, 3), "rig_clavicle_right": (-3, 0, 4), "rig_upper_arm_right": (-34, 0, 16), "rig_forearm_right": (-52, 0, -12), "rig_hand_right": (8, 0, 10)}, {"rig_root": (0, 0, 0.005)}),
            (0.80, {"rig_spine": (-1, 0, -1), "rig_chest": (-1, 0, -1), "rig_neck": (-1, 0, -1), "rig_head": (-1, 0, -2), "rig_upper_arm_right": (-26, 0, 12), "rig_forearm_right": (-45, 0, -8), "rig_upper_arm_left": (-18, 0, -10), "rig_forearm_left": (-35, 0, 6)}, {"rig_root": (0, 0, 0.01)}),
            (1.25, {"rig_spine": (-2, 0, 1), "rig_chest": (-2, 0, 1), "rig_neck": (1, 0, 1), "rig_head": (2, 0, 2), "rig_clavicle_right": (-2, 0, 3), "rig_upper_arm_right": (-32, 0, 14), "rig_forearm_right": (-48, 0, -10)}, {"rig_root": (0, 0, 0.005)}),
            (1.60, {}, {}),
        ],
        "plant": [
            (0.0, {}, {}),
            (0.14, {"rig_spine": (-6, 0, 0), "rig_chest": (-7, 0, 0), **arms_forward}, {}),
            (0.32, {"rig_spine": (-18, 0, 0), "rig_chest": (-20, 0, 0), "rig_neck": (8, 0, 0), "rig_head": (12, 0, 0), "rig_clavicle_left": (-6, 0, -4), "rig_clavicle_right": (-6, 0, 4), "rig_upper_arm_left": (-68, 0, -6), "rig_forearm_left": (-42, 0, 0), "rig_upper_arm_right": (-68, 0, 6), "rig_forearm_right": (-42, 0, 0), "rig_thigh_left": (18, 0, 0), "rig_thigh_right": (10, 0, 0)}, {"rig_root": (0, 0, -0.05)}),
            (0.46, {"rig_spine": (-16, 0, 0), "rig_chest": (-18, 0, 0), "rig_neck": (7, 0, 0), "rig_head": (10, 0, 0), "rig_clavicle_left": (-5, 0, -3), "rig_clavicle_right": (-5, 0, 3), "rig_upper_arm_left": (-64, 0, -5), "rig_forearm_left": (-48, 0, 0), "rig_upper_arm_right": (-64, 0, 5), "rig_forearm_right": (-48, 0, 0)}, {"rig_root": (0, 0, -0.04)}),
            (0.72, {}, {}),
        ],
        "water": [
            (0.0, {**arms_tool_hold}, {}),
            (0.20, {"rig_spine": (-8, 0, 0), "rig_chest": (-9, 0, 0), "rig_clavicle_right": (-4, 0, 4), "rig_upper_arm_right": (-40, 0, 12), "rig_forearm_right": (-40, 0, -8), **hand_grip_right}, {}),
            (0.40, {"rig_spine": (-12, 0, 0), "rig_chest": (-14, 0, 0), "rig_neck": (4, 0, 0), "rig_clavicle_right": (-6, 0, 6), "rig_upper_arm_right": (-54, 0, 15), "rig_forearm_right": (-52, 0, -12), **hand_grip_right, "rig_upper_arm_left": (-18, 0, -10)}, {"rig_root": (0, 0, -0.02)}),
            (0.60, {"rig_spine": (-9, 0, 0), "rig_chest": (-10, 0, 0), "rig_clavicle_right": (-4, 0, 4), "rig_upper_arm_right": (-42, 0, 12), "rig_forearm_right": (-38, 0, -8), **hand_grip_right}, {}),
            (0.84, {**arms_tool_hold}, {}),
        ],
        "harvest": [
            (0.0, {**arms_tool_hold}, {}),
            (0.18, {"rig_spine": (-10, 0, 0), "rig_chest": (-12, 0, 0), "rig_upper_arm_right": (-38, 0, 10), "rig_forearm_right": (-30, 0, 0), **hand_grip_right}, {}),
            (0.36, {"rig_spine": (-20, 0, 0), "rig_chest": (-22, 0, 0), "rig_neck": (9, 0, 0), "rig_head": (14, 0, 0), "rig_clavicle_right": (-6, 0, 6), "rig_upper_arm_right": (-70, 0, 20), "rig_forearm_right": (-65, 0, -18), **hand_grip_right, "rig_clavicle_left": (-4, 0, -4), "rig_upper_arm_left": (-44, 0, -10), "rig_forearm_left": (-36, 0, 8), "rig_thigh_right": (14, 0, 0), "rig_thigh_left": (18, 0, 0)}, {"rig_root": (0, 0, -0.06)}),
            (0.54, {"rig_spine": (-12, 0, 0), "rig_chest": (-14, 0, 0), "rig_upper_arm_right": (-38, 0, 12), "rig_forearm_right": (-32, 0, 0), **hand_grip_right}, {}),
            (0.80, {**arms_tool_hold}, {}),
        ],
        "pickup": [
            (0.0, {}, {}),
            (0.32, {"rig_spine": (-19, 0, 0), "rig_chest": (-21, 0, 0), "rig_neck": (8, 0, 0), "rig_head": (12, 0, 0), **arms_forward, "rig_thigh_left": (16, 0, 0), "rig_thigh_right": (16, 0, 0)}, {"rig_root": (0, 0, -0.05)}),
            (0.64, {}, {}),
        ],
        "carry_idle": [
            (0.0, {"rig_spine": (-3, 0, 0), "rig_chest": (-3, 0, 0), **arms_carry}, {}),
            (0.8, {"rig_spine": (-2, 0, 0), "rig_chest": (-2, 0, 0), **arms_carry}, {"rig_root": (0, 0, 0.006)}),
            (1.6, {"rig_spine": (-3, 0, 0), "rig_chest": (-3, 0, 0), **arms_carry}, {}),
        ],
        "carry_walk": [
            (0.0, {"rig_spine": (-3, 0, 0), "rig_chest": (-3, 0, 0), **arms_carry, "rig_thigh_left": (28, 0, 0), "rig_thigh_right": (-28, 0, 0), "rig_shin_right": (18, 0, 0)}, {}),
            (0.22, {"rig_spine": (-2, 0, 0), "rig_chest": (-2, 0, 0), **arms_carry}, {"rig_root": (0, 0, 0.02)}),
            (0.44, {"rig_spine": (-3, 0, 0), "rig_chest": (-3, 0, 0), **arms_carry, "rig_thigh_left": (-28, 0, 0), "rig_thigh_right": (28, 0, 0), "rig_shin_left": (18, 0, 0)}, {}),
            (0.66, {"rig_spine": (-2, 0, 0), "rig_chest": (-2, 0, 0), **arms_carry}, {"rig_root": (0, 0, 0.02)}),
            (0.88, {"rig_spine": (-3, 0, 0), "rig_chest": (-3, 0, 0), **arms_carry, "rig_thigh_left": (28, 0, 0), "rig_thigh_right": (-28, 0, 0), "rig_shin_right": (18, 0, 0)}, {}),
        ],
        "carry_run": [
            (0.0, {"rig_spine": (2, 0, 0), "rig_chest": (2, 0, 0), **arms_carry, "rig_thigh_left": (42, 0, 0), "rig_thigh_right": (-38, 0, 0), "rig_shin_right": (28, 0, 0)}, {}),
            (0.16, {"rig_spine": (1, 0, 0), "rig_chest": (1, 0, 0), **arms_carry}, {"rig_root": (0, 0, 0.03)}),
            (0.32, {"rig_spine": (2, 0, 0), "rig_chest": (2, 0, 0), **arms_carry, "rig_thigh_left": (-38, 0, 0), "rig_thigh_right": (42, 0, 0), "rig_shin_left": (28, 0, 0)}, {}),
            (0.48, {"rig_spine": (1, 0, 0), "rig_chest": (1, 0, 0), **arms_carry}, {"rig_root": (0, 0, 0.03)}),
            (0.64, {"rig_spine": (2, 0, 0), "rig_chest": (2, 0, 0), **arms_carry, "rig_thigh_left": (42, 0, 0), "rig_thigh_right": (-38, 0, 0), "rig_shin_right": (28, 0, 0)}, {}),
        ],
        "place": [
            (0.0, {"rig_spine": (-2, 0, 0), "rig_chest": (-2, 0, 0), **arms_forward}, {}),
            (0.52, {"rig_spine": (-18, 0, 0), "rig_chest": (-20, 0, 0), "rig_neck": (8, 0, 0), "rig_head": (12, 0, 0), **arms_forward, "rig_thigh_left": (16, 0, 0), "rig_thigh_right": (16, 0, 0)}, {"rig_root": (0, 0, -0.05)}),
            (0.72, {}, {}),
        ],
        "workstation": [
            (0.0, {**arms_tool_hold}, {}),
            (0.24, {"rig_spine": (-7, 0, 0), "rig_chest": (-8, 0, 0), "rig_clavicle_right": (-3, 0, 3), "rig_upper_arm_right": (-42, 0, 16), "rig_forearm_right": (-45, 0, -10), **hand_grip_right, "rig_upper_arm_left": (-32, 0, -10), "rig_forearm_left": (-38, 0, 8)}, {}),
            (0.52, {"rig_spine": (-9, 0, 0), "rig_chest": (-10, 0, 0), "rig_clavicle_right": (-5, 0, 4), "rig_upper_arm_right": (-54, 0, 10), "rig_forearm_right": (-60, 0, -14), **hand_grip_right, "rig_upper_arm_left": (-38, 0, -12), "rig_forearm_left": (-44, 0, 10)}, {"rig_root": (0, 0, -0.015)}),
            (0.72, {"rig_spine": (-6, 0, 0), "rig_chest": (-7, 0, 0), "rig_clavicle_right": (-3, 0, 3), "rig_upper_arm_right": (-38, 0, 18), "rig_forearm_right": (-35, 0, -8), **hand_grip_right}, {}),
            (0.92, {**arms_tool_hold}, {}),
        ],
        "cast": [
            (0.0, {**arms_tool_hold}, {}),
            (0.28, {"rig_spine": (6, 0, 0), "rig_chest": (7, 0, 0), "rig_clavicle_right": (3, 0, 2), "rig_upper_arm_right": (38, 0, 10), "rig_forearm_right": (-18, 0, 0), **hand_grip_right}, {}),
            (0.58, {"rig_spine": (-12, 0, 0), "rig_chest": (-14, 0, 0), "rig_neck": (4, 0, 0), "rig_clavicle_right": (-6, 0, 4), "rig_upper_arm_right": (-70, 0, 6), "rig_forearm_right": (-52, 0, 0), **hand_grip_right, "rig_upper_arm_left": (-22, 0, -8)}, {"rig_root": (0, 0, -0.02)}),
            (0.92, {"rig_spine": (-4, 0, 0), "rig_chest": (-5, 0, 0), "rig_upper_arm_right": (-42, 0, 10), "rig_forearm_right": (-35, 0, 0), **hand_grip_right}, {}),
        ],
        "fishing_idle": [
            (0.0, {"rig_spine": (-3, 0, 0), "rig_chest": (-3, 0, 0), "rig_upper_arm_right": (-42, 0, 10), "rig_forearm_right": (-40, 0, -4), **hand_grip_right, "rig_upper_arm_left": (-30, 0, -8), "rig_forearm_left": (-38, 0, 6)}, {}),
            (0.8, {"rig_spine": (-2, 0, 0), "rig_chest": (-2, 0, 0), "rig_upper_arm_right": (-40, 0, 12), "rig_forearm_right": (-38, 0, -2), **hand_grip_right, "rig_upper_arm_left": (-28, 0, -6), "rig_forearm_left": (-36, 0, 8)}, {"rig_root": (0, 0, 0.005)}),
            (1.6, {"rig_spine": (-3, 0, 0), "rig_chest": (-3, 0, 0), "rig_upper_arm_right": (-42, 0, 10), "rig_forearm_right": (-40, 0, -4), **hand_grip_right, "rig_upper_arm_left": (-30, 0, -8), "rig_forearm_left": (-38, 0, 6)}, {}),
        ],
        "reel": [
            (0.0, {"rig_spine": (-4, 0, 0), "rig_chest": (-4, 0, 0), "rig_upper_arm_right": (-45, 0, 10), "rig_forearm_right": (-45, 0, -4), **hand_grip_right, "rig_upper_arm_left": (-34, 0, -10), "rig_forearm_left": (-45, 0, 10)}, {}),
            (0.24, {"rig_spine": (-5, 0, 0), "rig_chest": (-5, 0, 0), **hand_grip_right, "rig_upper_arm_left": (-40, 0, -16), "rig_forearm_left": (-60, 0, 14)}, {}),
            (0.48, {"rig_spine": (-4, 0, 0), "rig_chest": (-4, 0, 0), **hand_grip_right, "rig_upper_arm_left": (-28, 0, -6), "rig_forearm_left": (-35, 0, 4)}, {}),
            (0.72, {"rig_spine": (-4, 0, 0), "rig_chest": (-4, 0, 0), "rig_upper_arm_right": (-45, 0, 10), "rig_forearm_right": (-45, 0, -4), **hand_grip_right, "rig_upper_arm_left": (-34, 0, -10), "rig_forearm_left": (-45, 0, 10)}, {}),
        ],
        "slack": [
            (0.0, {"rig_spine": (2, 0, 0), "rig_chest": (3, 0, 0), "rig_upper_arm_right": (-24, 0, 10), "rig_forearm_right": (-20, 0, 0), **hand_grip_right, "rig_upper_arm_left": (-16, 0, -6)}, {}),
            (0.4, {"rig_spine": (3, 0, 0), "rig_chest": (4, 0, 0), "rig_upper_arm_right": (-16, 0, 12), "rig_forearm_right": (-15, 0, 0), **hand_grip_right}, {"rig_root": (0, 0, 0.005)}),
            (0.8, {"rig_spine": (2, 0, 0), "rig_chest": (3, 0, 0), "rig_upper_arm_right": (-24, 0, 10), "rig_forearm_right": (-20, 0, 0), **hand_grip_right, "rig_upper_arm_left": (-16, 0, -6)}, {}),
        ],
        "brace": [
            (0.0, {"rig_spine": (-9, 0, 0), "rig_chest": (-10, 0, 0), "rig_neck": (4, 0, 0), "rig_head": (5, 0, 0), "rig_clavicle_right": (-4, 0, 4), "rig_upper_arm_right": (-58, 0, 14), "rig_forearm_right": (-58, 0, -8), **hand_grip_right, "rig_clavicle_left": (-4, 0, -4), "rig_upper_arm_left": (-48, 0, -14), "rig_forearm_left": (-55, 0, 10), "rig_thigh_left": (8, 0, 0), "rig_thigh_right": (-6, 0, 0)}, {"rig_root": (0, 0, -0.02)}),
            (0.4, {"rig_spine": (-11, 0, 0), "rig_chest": (-12, 0, 0), "rig_neck": (5, 0, 0), "rig_head": (6, 0, 0), "rig_clavicle_right": (-5, 0, 5), "rig_upper_arm_right": (-62, 0, 16), "rig_forearm_right": (-62, 0, -10), **hand_grip_right, "rig_clavicle_left": (-5, 0, -5), "rig_upper_arm_left": (-52, 0, -16), "rig_forearm_left": (-58, 0, 12)}, {"rig_root": (0, 0, -0.025)}),
            (0.8, {"rig_spine": (-9, 0, 0), "rig_chest": (-10, 0, 0), "rig_neck": (4, 0, 0), "rig_head": (5, 0, 0), "rig_clavicle_right": (-4, 0, 4), "rig_upper_arm_right": (-58, 0, 14), "rig_forearm_right": (-58, 0, -8), **hand_grip_right, "rig_clavicle_left": (-4, 0, -4), "rig_upper_arm_left": (-48, 0, -14), "rig_forearm_left": (-55, 0, 10), "rig_thigh_left": (8, 0, 0), "rig_thigh_right": (-6, 0, 0)}, {"rig_root": (0, 0, -0.02)}),
        ],
        "board": [
            (0.0, {}, {}),
            (0.32, {"rig_thigh_right": (48, 0, 0), "rig_shin_right": (-35, 0, 0), "rig_spine": (-4, 0, 0), "rig_chest": (-4, 0, 0)}, {"rig_root": (0, -0.15, 0.05)}),
            (0.64, {"rig_thigh_left": (32, 0, 0), "rig_shin_left": (-24, 0, 0), "rig_thigh_right": (12, 0, 0), "rig_spine": (-2, 0, 0), "rig_chest": (-2, 0, 0)}, {"rig_root": (0, -0.35, 0.02)}),
            (0.88, resting_oar_hold, {"rig_root": (0, -0.42, -0.06)}),
        ],
        "dock": [
            (0.0, resting_oar_hold, {"rig_root": (0, -0.42, -0.06)}),
            (0.35, {"rig_spine": (-6, 0, 0), "rig_chest": (-6, 0, 0), "rig_thigh_left": (24, 0, 0), "rig_thigh_right": (14, 0, 0), **arms_forward}, {"rig_root": (0, -0.22, 0.02)}),
            (0.65, {"rig_thigh_left": (10, 0, 0), "rig_thigh_right": (0, 0, 0), "rig_spine": (-2, 0, 0), "rig_chest": (-2, 0, 0)}, {"rig_root": (0, -0.08, 0.01)}),
            (0.92, {}, {}),
        ],
        "rowboat_idle": [
            (0.0, resting_oar_hold, {}),
            (0.8, {**resting_oar_hold, "rig_spine": (-1, 0, 0), "rig_chest": (-1, 0, 0)}, {"rig_root": (0, 0, 0.008)}),
            (1.6, resting_oar_hold, {}),
        ],
        "row": [
            (0.0, {**seated_lower, "rig_spine": (-9, 0, 0), "rig_chest": (-10, 0, 0), "rig_clavicle_left": (-4, 0, -4), "rig_upper_arm_left": (-66, 0, -16), "rig_forearm_left": (-45, 0, 6), "rig_clavicle_right": (-4, 0, 4), "rig_upper_arm_right": (-66, 0, 16), "rig_forearm_right": (-45, 0, -6)}, {}),
            (0.18, {**seated_lower, "rig_spine": (-6, 0, 0), "rig_chest": (-6, 0, 0), "rig_clavicle_left": (-3, 0, -3), "rig_upper_arm_left": (-52, 0, -14), "rig_forearm_left": (-55, 0, 8), "rig_clavicle_right": (-3, 0, 3), "rig_upper_arm_right": (-52, 0, 14), "rig_forearm_right": (-55, 0, -8)}, {"rig_root": (0, 0, -0.01)}),
            (0.48, {**seated_lower, "rig_spine": (8, 0, 0), "rig_chest": (9, 0, 0), "rig_upper_arm_left": (-18, 0, -12), "rig_forearm_left": (-80, 0, 12), "rig_upper_arm_right": (-18, 0, 12), "rig_forearm_right": (-80, 0, -12)}, {"rig_root": (0, 0, 0.02)}),
            (0.72, {**seated_lower, "rig_spine": (3, 0, 0), "rig_chest": (4, 0, 0), "rig_upper_arm_left": (-38, 0, -12), "rig_forearm_left": (-65, 0, 10), "rig_upper_arm_right": (-38, 0, 12), "rig_forearm_right": (-65, 0, -10)}, {}),
            (0.96, {**seated_lower, "rig_spine": (-9, 0, 0), "rig_chest": (-10, 0, 0), "rig_clavicle_left": (-4, 0, -4), "rig_upper_arm_left": (-66, 0, -16), "rig_forearm_left": (-45, 0, 6), "rig_clavicle_right": (-4, 0, 4), "rig_upper_arm_right": (-66, 0, 16), "rig_forearm_right": (-45, 0, -6)}, {}),
        ],
        "skiff_idle": [
            (0.0, {**seated_lower, "rig_spine": (-1, 0, 0), "rig_chest": (-1, 0, 0), "rig_upper_arm_left": (-18, 0, -8), "rig_forearm_left": (-38, 0, 6), "rig_upper_arm_right": (-34, 0, 14), "rig_forearm_right": (-52, 0, -10), **hand_grip_right}, {}),
            (0.8, {**seated_lower, "rig_spine": (0, 0, 1), "rig_chest": (0, 0, 1), "rig_neck": (-1, 0, -1), "rig_head": (-1, 0, -1), "rig_upper_arm_left": (-16, 0, -8), "rig_forearm_left": (-36, 0, 6), "rig_upper_arm_right": (-32, 0, 14), "rig_forearm_right": (-50, 0, -10), **hand_grip_right}, {"rig_root": (0, 0, 0.006)}),
            (1.6, {**seated_lower, "rig_spine": (-1, 0, 0), "rig_chest": (-1, 0, 0), "rig_upper_arm_left": (-18, 0, -8), "rig_forearm_left": (-38, 0, 6), "rig_upper_arm_right": (-34, 0, 14), "rig_forearm_right": (-52, 0, -10), **hand_grip_right}, {}),
        ],
        "skiff_drive": [
            (0.0, {**seated_lower, "rig_spine": (-3, 0, -1), "rig_chest": (-3, 0, -1), "rig_neck": (1, 0, 1), "rig_head": (2, 0, 2), "rig_upper_arm_left": (-24, 0, -12), "rig_forearm_left": (-44, 0, 8), "rig_upper_arm_right": (-42, 0, 16), "rig_forearm_right": (-58, 0, -12), **hand_grip_right}, {"rig_root": (0, 0, -0.01)}),
            (0.4, {**seated_lower, "rig_spine": (-4, 0, 1), "rig_chest": (-4, 0, 1), "rig_neck": (1, 0, -1), "rig_head": (2, 0, -1), "rig_upper_arm_left": (-28, 0, -14), "rig_forearm_left": (-48, 0, 10), "rig_upper_arm_right": (-46, 0, 18), "rig_forearm_right": (-62, 0, -14), **hand_grip_right}, {"rig_root": (0, 0, -0.016)}),
            (0.8, {**seated_lower, "rig_spine": (-3, 0, -1), "rig_chest": (-3, 0, -1), "rig_neck": (1, 0, 1), "rig_head": (2, 0, 2), "rig_upper_arm_left": (-24, 0, -12), "rig_forearm_left": (-44, 0, 8), "rig_upper_arm_right": (-42, 0, 16), "rig_forearm_right": (-58, 0, -12), **hand_grip_right}, {"rig_root": (0, 0, -0.01)}),
        ],
        "mounted_idle": [
            (0.0, mounted_reins, {}),
            (0.8, {**mounted_reins, "rig_spine": (-1, 0, 1), "rig_chest": (-1, 0, 1)}, {"rig_root": (0, 0, 0.008)}),
            (1.6, mounted_reins, {}),
        ],
        "mounted_walk": [
            (0.0, {**mounted_reins, "rig_spine": (-3, 0, -1), "rig_chest": (-3, 0, -1)}, {"rig_root": (0, 0, -0.006)}),
            (0.2, {**mounted_reins, "rig_spine": (-1, 0, 1), "rig_chest": (-1, 0, 1)}, {"rig_root": (0, 0, 0.012)}),
            (0.4, {**mounted_reins, "rig_spine": (-3, 0, 1), "rig_chest": (-3, 0, 1)}, {"rig_root": (0, 0, -0.006)}),
            (0.6, {**mounted_reins, "rig_spine": (-1, 0, -1), "rig_chest": (-1, 0, -1)}, {"rig_root": (0, 0, 0.012)}),
            (0.8, {**mounted_reins, "rig_spine": (-3, 0, -1), "rig_chest": (-3, 0, -1)}, {"rig_root": (0, 0, -0.006)}),
        ],
        "mounted_trot": [
            (0.0, {**mounted_reins, "rig_spine": (-4, 0, -1), "rig_chest": (-4, 0, -1)}, {"rig_root": (0, 0, -0.010)}),
            (0.14, {**mounted_reins, "rig_spine": (-1, 0, 1), "rig_chest": (-1, 0, 1)}, {"rig_root": (0, 0, 0.018)}),
            (0.28, {**mounted_reins, "rig_spine": (-4, 0, 1), "rig_chest": (-4, 0, 1)}, {"rig_root": (0, 0, -0.010)}),
            (0.42, {**mounted_reins, "rig_spine": (-1, 0, -1), "rig_chest": (-1, 0, -1)}, {"rig_root": (0, 0, 0.018)}),
            (0.56, {**mounted_reins, "rig_spine": (-4, 0, -1), "rig_chest": (-4, 0, -1)}, {"rig_root": (0, 0, -0.010)}),
        ],
        "mount": [
            (0.0, {}, {}),
            (0.32, {**mounted_reins, "rig_spine": (-5, 0, 0), "rig_chest": (-5, 0, 0)}, {"rig_root": (0, -0.12, 0.05)}),
            (0.64, {**mounted_reins, "rig_spine": (-2, 0, 0), "rig_chest": (-2, 0, 0)}, {"rig_root": (0, -0.05, 0.018)}),
            (0.8, mounted_reins, {}),
        ],
        "dismount": [
            (0.0, mounted_reins, {}),
            (0.32, {**mounted_reins, "rig_spine": (-4, 0, 0), "rig_chest": (-4, 0, 0)}, {"rig_root": (0, -0.04, 0.02)}),
            (0.64, {"rig_thigh_left": (38, 0, 0), "rig_shin_left": (-28, 0, 0), "rig_thigh_right": (28, 0, 0), "rig_shin_right": (-20, 0, 0), "rig_spine": (-2, 0, 0), "rig_chest": (-2, 0, 0)}, {"rig_root": (0, -0.12, 0.04)}),
            (0.8, {}, {}),
        ],
    }

    bpy.context.scene.render.fps = 25
    bpy.context.scene.render.fps_base = 1.0
    fps = 25.0
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
    matching _build_stylized_limbs_and_boots hand icos at x=±0.38, y=-0.02,
    z=height*0.30 (fingers at y=-0.075). A handle-at-origin tool therefore
    sits in the mitten, not beside the wrist.

    Carry stays on rig_spine at the lower backpack so bundle stalks hang
    behind the thighs, not through them or up through the hat.
    """
    # Palm / finger-pad, not the wrist (hand-bone head is at height*0.33).
    palm_x = 0.38
    palm_y = -0.05
    palm_z = height * 0.288
    _add_bone_socket(sockets[0], (-palm_x, palm_y, palm_z), rig, "rig_hand_left")
    _add_bone_socket(sockets[1], (palm_x, palm_y, palm_z), rig, "rig_hand_right")
    _add_bone_socket(sockets[2], (palm_x, palm_y, palm_z), rig, "rig_hand_right")
    _add_bone_socket(sockets[3], (0.0, 0.36, height * 0.54), rig, "rig_spine")
    _add_bone_socket(sockets[4], (0.28, 0.02, height * 0.40), rig, "rig_pelvis")


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
        subdivisions=subdivisions,
    )
    # Tapered Jaw / Chin base for storybook appeal
    chin_size = (head_w * 0.60, head_d * 0.55, head_h * 0.35)
    add_box(
        "character_chin",
        (0, -head_d * 0.45, head_center_z - head_h * 0.65),
        chin_size,
        skin_token,
        root,
        bevel=min(0.012, min(chin_size) * 0.22),
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
            (x, face_y - 0.010, eye_z),
            (0.028, 0.018, 0.031),
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

        # Small cheek planes keep the face readable under a broad hat without
        # turning it into a smooth or overly expressive cartoon mask.
        add_ico(
            f"character_cheek_{side}",
            (x * 0.76, face_y + 0.006, head_center_z - head_height * 0.07),
            (head_w * 0.17, head_d * 0.065, head_h * 0.13),
            skin_token,
            root,
            subdivisions=1,
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
    bare_forearms: bool = False,
    spec: dict | None = None,
) -> None:
    """Builds connected tapered limbs, rolled cuffs, readable hands, and grounded boots."""
    lod0 = spec is None or spec.get("_lodIndex", 0) == 0
    joint_div = 3 if lod0 else 1

    # 1. Legs: authored joint-to-joint sections keep the silhouette connected
    # instead of reading as four floating ovals under the tunic.
    for side, x in (("left", -0.14), ("right", 0.14)):
        knee_x = x * 1.02
        hip = (x, 0.0, height * 0.39)
        knee = (knee_x, -0.006, height * 0.205)
        ankle = (knee_x, -0.012, height * 0.072)
        add_tapered_beam(
            f"character_thigh_{side}", hip, knee, 0.135, 0.108,
            trouser_token, root, vertices=7,
        )
        add_ico(
            f"character_knee_{side}", knee, (0.112, 0.112, 0.105),
            trouser_token, root, subdivisions=joint_div,
        )
        add_tapered_beam(
            f"character_shin_{side}", knee, ankle, 0.105, 0.078,
            trouser_token, root, vertices=7,
        )
        add_ring(
            f"character_trouser_cuff_{side}", (knee_x, -0.012, height * 0.18),
            0.108, 0.024, cuff_token, root, major_segments=8, minor_segments=4,
        )

        # A shaped toe cap and a separate sole produce a stable planted foot
        # without adding a new foot bone or changing the runtime contract.
        add_box(f"character_boot_{side}", (knee_x, -0.055, 0.082), (0.21, 0.31, 0.15), boot_token, root, bevel=0.032)
        add_ico(f"character_boot_toe_{side}", (knee_x, -0.19, 0.088), (0.105, 0.13, 0.085), boot_token, root, subdivisions=2 if lod0 else 1)
        add_box(f"character_boot_sole_{side}", (knee_x, -0.060, 0.020), (0.23, 0.35, 0.042), boot_token, root, bevel=0.014)
        add_box(f"character_boot_lace_{side}_0", (knee_x, -0.15, 0.108), (0.12, 0.020, 0.014), cuff_token, root, bevel=0.003)
        add_box(f"character_boot_lace_{side}_1", (knee_x, -0.14, 0.138), (0.12, 0.020, 0.014), cuff_token, root, bevel=0.003)

    # 2. Arms: the mesh follows the same shoulder -> elbow -> wrist path as
    # the rig, which keeps sleeves and hands stable through authored clips.
    for side, x in (("left", -0.38), ("right", 0.38)):
        sign = -1.0 if side == "left" else 1.0
        forearm_mat = skin_token if bare_forearms else shirt_token
        shoulder = (sign * 0.235, 0.0, height * 0.66)
        elbow = (sign * 0.37, -0.006, height * 0.49)
        wrist = (sign * 0.38, -0.020, height * 0.34)

        add_tapered_beam(
            f"character_upper_arm_{side}", shoulder, elbow, 0.112, 0.094,
            shirt_token, root, vertices=8,
        )
        if lod0:
            add_ico(
                f"character_shoulder_{side}", shoulder,
                (0.115, 0.105, 0.115), shirt_token, root, subdivisions=2,
            )
        add_ico(
            f"character_elbow_{side}", elbow, (0.098, 0.098, 0.098),
            forearm_mat, root, subdivisions=joint_div,
        )
        add_tapered_beam(
            f"character_forearm_{side}", elbow, wrist, 0.092, 0.074,
            forearm_mat, root, vertices=8,
        )
        add_ring(
            f"character_sleeve_cuff_{side}", (x, -0.020, height * 0.37),
            0.082, 0.022, cuff_token, root, major_segments=8, minor_segments=4,
        )

        hand_prefix = _character_prefix(spec) if spec else "char_player"
        hand_z = height * 0.288
        add_ico(
            f"{hand_prefix}_hand_{side}",
            (x, -0.040, hand_z),
            (0.092 * hand_scale, 0.082 * hand_scale, 0.105 * hand_scale),
            skin_token,
            root,
            subdivisions=joint_div,
        )
        if lod0:
            add_ico(
                f"character_finger_{side}_thumb",
                (x - sign * 0.048, -0.062, hand_z + 0.004),
                (0.024 * hand_scale, 0.040 * hand_scale, 0.040 * hand_scale),
                skin_token,
                root,
                subdivisions=2,
            )
            for finger in range(3):
                add_ico(
                    f"character_finger_{side}_{finger}",
                    (x + (finger - 1) * 0.027, -0.092, hand_z - 0.018),
                    (0.019 * hand_scale, 0.040 * hand_scale, 0.042 * hand_scale),
                    skin_token,
                    root,
                    subdivisions=2,
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
    add_ico("character_pelvis", (0, 0.01, height * 0.38), (0.26, 0.19, 0.18), trousers, root, subdivisions=ico_div)

    # 2. Conforming Leather Explorer Vest
    add_ico("character_vest_body", (0, -0.02, height * 0.58), (0.28, 0.195, 0.34), canvas, root, subdivisions=ico_div)
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
        add_ico("character_hair_side_left", (-head_half_width * 0.92, 0.0, head_center_z), (0.06, 0.08, 0.12), dark, root, subdivisions=3)
        add_ico("character_hair_side_right", (head_half_width * 0.92, 0.0, head_center_z), (0.06, 0.08, 0.12), dark, root, subdivisions=3)

    # 6. Snug Straw Expedition Hat (Correct crown recess seated on hair)
    hat_seat_z = head_center_z + head_half_height * 0.32
    brim_radius = 0.38
    add_cylinder("character_hat_crown", (0, 0.01, hat_seat_z + 0.09), 0.20, 0.14, canvas, root, vertices=10, bevel=0.020, rotation=(math.radians(3), 0, 0))
    add_cylinder("character_hat_brim", (0, -0.01, hat_seat_z + 0.02), brim_radius, 0.035, canvas, root, vertices=12, bevel=0.010, rotation=(math.radians(3), 0, 0))
    if detail:
        add_ring("character_hat_band", (0, 0.01, hat_seat_z + 0.035), 0.205, 0.020, band_color, root, major_segments=10, minor_segments=4, rotation=(math.radians(3), 0, 0))


    # 7. Framed Expedition Backpack (Snug fit to back)
    add_box("character_backpack", (0, 0.21, height * 0.57), (0.44, 0.24, 0.52), canvas, root, bevel=0.05)
    add_cylinder("character_pack_roll", (0, 0.24, height * 0.73), 0.12, 0.40, canvas, root, vertices=8, rotation=(0, math.pi / 2, 0), bevel=0.018)
    if detail:
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
    for side, x in (("left", -0.28), ("right", 0.28)):
        add_cylinder(f"character_pack_canteen_{side}", (x, 0.18, height * 0.50), 0.07, 0.16, dark, root, vertices=8, bevel=0.0)
        if detail:
            add_cylinder(f"character_pack_canteen_cap_{side}", (x, 0.18, height * 0.59), 0.03, 0.04, canvas, root, vertices=6, bevel=0.0)
            add_rope_line(
                f"character_pack_canteen_strap_{side}",
                [(x, 0.24, height * 0.57), (x * 1.05, 0.18, height * 0.50), (x, 0.12, height * 0.46)],
                0.016, dark, root, vertices=5,
            )
    if spec.get("_lodIndex", 0) == 0:
        add_box("character_pack_lower_pocket", (0, 0.34, height * 0.46), (0.22, 0.06, 0.14), canvas, root, bevel=0.016)
        add_box("character_pack_strap_buckle_left", (-0.19, -0.14, height * 0.54), (0.05, 0.03, 0.04), canvas, root, bevel=0.006)
        add_box("character_pack_strap_buckle_right", (0.19, -0.14, height * 0.54), (0.05, 0.03, 0.04), canvas, root, bevel=0.006)
        add_lattice(
            "character_pack_frame",
            (0, 0.33, height * 0.57),
            0.38,
            0.42,
            dark,
            root,
            columns=3,
            rows=3,
            depth=0.018,
        )
        add_box("character_pack_bedroll_ties", (0, 0.24, height * 0.73), (0.42, 0.04, 0.04), dark, root, bevel=0.008)
        for side, x in (("left", -0.14), ("right", 0.14)):
            add_box(f"character_boot_heel_{side}", (x, 0.08, 0.03), (0.18, 0.12, 0.06), dark, root, bevel=0.010)
            add_box(f"character_boot_tongue_{side}", (x, -0.18, 0.12), (0.10, 0.04, 0.10), dark, root, bevel=0.008)
            for lace in range(3):
                add_box(
                    f"character_boot_lace_{side}_{lace}",
                    (x, -0.20, 0.16 + lace * 0.05),
                    (0.08, 0.02, 0.02), canvas, root, bevel=0.0,
                )
        for index in range(10):
            angle = index * math.tau / 10.0
            add_box(
                f"character_hat_brim_rib_{index:02d}",
                (math.cos(angle) * 0.27, math.sin(angle) * 0.27 - 0.01, hat_seat_z + 0.018),
                (0.045, 0.11, 0.016),
                canvas, root, bevel=0.004, rotation=(math.radians(3), 0, angle),
            )
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
            (0.22, 0.24, height * 0.73),
            (0.08, 0.08, 0.08), canvas, root, subdivisions=3,
        )
        add_ico(
            "character_hair_back",
            (0, 0.12, head_center_z + 0.02),
            (0.10, 0.08, 0.10), dark, root, subdivisions=3,
        )
        add_ico(
            "character_pack_body_facet",
            (0, 0.28, height * 0.57),
            (0.18, 0.08, 0.18), canvas, root, subdivisions=3,
        )
        # Readable vest quilting planes matching the turnaround pockets.
        for course in range(4):
            z = height * (0.48 + course * 0.045)
            for index in range(8):
                angle = index * math.tau / 8.0
                add_box(
                    f"character_vest_quilt_{course}_{index}",
                    (math.cos(angle) * 0.27, math.sin(angle) * 0.18 - 0.02, z),
                    (0.09, 0.04, 0.04),
                    canvas,
                    root,
                    bevel=0.006,
                    rotation=(0, 0, angle),
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
    height = params.get("height", 1.95)
    head_ratio = params.get("headRatio", 4.7)
    head_height = height / head_ratio
    head_half_height = head_height * 0.5
    head_half_width = head_height * 0.46
    head_half_depth = head_height * 0.44
    head_center_z = height * 0.82
    hand_scale = params.get("handScale", 1.05)
    detail = spec.get("_lodIndex", 0) == 0
    ico_div = 3 if detail else 1

    # 1. Base Core Torso & Pelvis
    add_ico("character_torso", (0, 0, height * 0.58), (0.28, 0.20, 0.38), garment_primary, root, subdivisions=ico_div)
    add_ico("character_pelvis", (0, 0.01, height * 0.38), (0.26, 0.19, 0.18), dark, root, subdivisions=ico_div)

    # 2. Base Limbs & Boots
    bare_arms = role in ("handyman", "merchant")
    _build_stylized_limbs_and_boots(root, height, hand_scale, skin, dark, garment_primary, dark, garment_secondary, bare_forearms=bare_arms, spec=spec)

    # 3. Base Stylized Head & Facial Features
    neck_z = head_center_z - head_half_height * 0.90
    add_cylinder("character_neck", (0, 0, neck_z), 0.085, 0.12, skin, root, vertices=8, bevel=0.012)
    brow_color = accent if role == "dockmaster" else dark
    _build_stylized_head_and_face(root, head_center_z, head_height, skin, dark, brow_color, dark, role=role, subdivisions=ico_div)

    # 4. --- ROLE-SPECIFIC BESPOKE OUTFITS, HEADWEAR & ACCESSORIES ---

    if role == "gardener":  # Elspeth: Garden Elder & Baker
        hair_z = head_center_z + head_half_height * 0.25
        silver_token = garment_secondary
        add_ico("character_hair_cap", (0, 0.02, hair_z), (head_half_width * 1.04, head_half_depth * 1.04, head_half_height * 0.80), silver_token, root, subdivisions=ico_div)
        if detail:
            add_ico("character_hair_bun", (0, 0.16, hair_z + 0.02), (0.13, 0.12, 0.13), silver_token, root, subdivisions=3)
            add_ico("character_hair_lock_left", (-head_half_width * 0.88, -0.04, head_center_z - 0.01), (0.05, 0.06, 0.10), silver_token, root, subdivisions=3)
            add_ico("character_hair_lock_right", (head_half_width * 0.88, -0.04, head_center_z - 0.01), (0.05, 0.06, 0.10), silver_token, root, subdivisions=3)
            add_ring("character_hair_braid_wrap", (0, 0.16, hair_z + 0.02), 0.14, 0.022, silver_token, root, major_segments=10, minor_segments=4)

        bonnet_z = head_center_z + head_half_height * 0.32
        add_cylinder("character_bonnet_crown", (0, 0.04, bonnet_z + 0.08), 0.21, 0.14, garment_secondary, root, vertices=10, bevel=0.020, rotation=(math.radians(8), 0, 0))
        add_cylinder("character_bonnet_brim", (0, -0.04, bonnet_z + 0.02), 0.34, 0.035, garment_secondary, root, vertices=12, bevel=0.012, rotation=(math.radians(16), 0, 0))
        add_ring("character_bonnet_band", (0, 0.03, bonnet_z + 0.03), 0.215, 0.020, accent, root, major_segments=10, minor_segments=4, rotation=(math.radians(8), 0, 0))
        if detail:
            add_rope_line("character_bonnet_ribbon_left", [(-0.16, 0.0, bonnet_z + 0.02), (-0.08, -0.08, neck_z), (0, -0.10, neck_z - 0.02)], 0.012, accent, root, vertices=5)
            add_rope_line("character_bonnet_ribbon_right", [(0.16, 0.0, bonnet_z + 0.02), (0.08, -0.08, neck_z), (0, -0.10, neck_z - 0.02)], 0.012, accent, root, vertices=5)

        add_ico("character_apron_bib", (0, -0.03, height * 0.58), (0.30, 0.205, 0.32), garment_secondary, root, subdivisions=ico_div)
        add_box("character_apron_skirt", (0, -0.04, height * 0.40), (0.42, 0.26, 0.28), garment_secondary, root, bevel=0.025)
        add_box("character_dress_skirt", (0, 0.0, height * 0.38), (0.46, 0.30, 0.32), garment_primary, root, bevel=0.030)
        for side, x in (("left", -0.14), ("right", 0.14)):
            add_beam(f"character_apron_strap_{side}", (x, -0.16, height * 0.65), (x * 0.9, 0.16, height * 0.62), 0.025, garment_secondary, root, vertices=4)
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
            add_ring("character_sleeve_guard_left", (-0.38, -0.02, height * 0.42), 0.086, 0.024, garment_secondary, root, major_segments=10, minor_segments=4)
            add_ring("character_sleeve_guard_right", (0.38, -0.02, height * 0.42), 0.086, 0.024, garment_secondary, root, major_segments=10, minor_segments=4)

    elif role == "handyman":  # Barnaby: Craftsman & Handyman
        hair_z = head_center_z + head_half_height * 0.20
        add_ico("character_hair_cap", (0, 0.01, hair_z), (head_half_width * 1.03, head_half_depth * 1.03, head_half_height * 0.75), dark, root, subdivisions=ico_div)

        cap_z = head_center_z + head_half_height * 0.28
        add_cylinder("character_hat_cap", (0, 0.02, cap_z + 0.06), 0.23, 0.10, garment_secondary, root, vertices=12, bevel=0.022, rotation=(math.radians(4), 0, 0))
        add_box("character_hat_peak", (0, -0.16, cap_z + 0.02), (0.22, 0.12, 0.022), dark, root, rotation=(math.radians(14), 0, 0), bevel=0.006)
        if detail:
            add_ico("character_hat_button", (0, 0.02, cap_z + 0.12), (0.035, 0.035, 0.025), dark, root, subdivisions=2)
            add_ico("character_hat_side_left", (-0.18, 0.02, cap_z + 0.05), (0.08, 0.16, 0.06), garment_secondary, root, subdivisions=3)
            add_ico("character_hat_side_right", (0.18, 0.02, cap_z + 0.05), (0.08, 0.16, 0.06), garment_secondary, root, subdivisions=3)

        add_ico("character_apron_bib", (0, -0.03, height * 0.58), (0.31, 0.21, 0.34), garment_secondary, root, subdivisions=ico_div)
        add_box("character_apron_skirt", (0, -0.05, height * 0.39), (0.44, 0.28, 0.30), garment_secondary, root, bevel=0.025)
        add_box("character_tool_belt", (0, -0.01, height * 0.41), (0.52, 0.32, 0.09), dark, root, bevel=0.015)
        add_box("character_belt_buckle", (0, -0.17, height * 0.41), (0.11, 0.025, 0.09), accent, root, bevel=0.008)
        for side, x in (("left", -0.14), ("right", 0.14)):
            add_beam(f"character_apron_strap_{side}", (x, -0.16, height * 0.65), (x * 0.9, 0.16, height * 0.62), 0.028, dark, root, vertices=4)
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
        add_ico("character_coat_body", (0, -0.01, height * 0.58), (0.33, 0.22, 0.40), dark, root, subdivisions=ico_div)
        add_box("character_coat_skirt", (0, -0.02, height * 0.38), (0.48, 0.30, 0.32), dark, root, bevel=0.028)
        if detail:
            add_ico("character_beard_mustache", (0, face_y - 0.018, head_center_z - head_height * 0.10), (0.12, 0.04, 0.05), beard_color, root, subdivisions=2)
            add_ico("character_beard_mustache_tip_left", (-0.07, face_y - 0.02, head_center_z - head_height * 0.11), (0.045, 0.04, 0.045), beard_color, root, subdivisions=3)
            add_ico("character_beard_mustache_tip_right", (0.07, face_y - 0.02, head_center_z - head_height * 0.11), (0.045, 0.04, 0.045), beard_color, root, subdivisions=3)
            add_ico("character_beard_side_left", (-head_half_width * 0.72, -0.04, head_center_z - head_height * 0.14), (0.08, 0.09, 0.11), beard_color, root, subdivisions=3)
            add_ico("character_beard_side_right", (head_half_width * 0.72, -0.04, head_center_z - head_height * 0.14), (0.08, 0.09, 0.11), beard_color, root, subdivisions=3)
            add_cylinder("character_coat_collar", (0, 0, height * 0.70), 0.16, 0.10, dark, root, vertices=10, bevel=0.018)
            add_tri_prism("character_coat_lapel_left", (-0.14, -0.18, height * 0.63), (0.11, 0.035, 0.24), dark, root, rotation=(0, -math.radians(12), 0))
            add_tri_prism("character_coat_lapel_right", (0.14, -0.18, height * 0.63), (0.11, 0.035, 0.24), dark, root, rotation=(0, math.radians(12), 0))
            add_rope_line("character_watch_chain", [(-0.12, -0.19, height * 0.61), (0, -0.21, height * 0.57), (0.12, -0.19, height * 0.61)], 0.010, garment_secondary, root, vertices=5)
            add_fasteners("character_coat_button", tuple((sign * 0.07, -0.19, height * (0.50 + row * 0.06)) for row in range(3) for sign in [-1.0, 1.0]), 0.012, garment_secondary, root, depth=0.020)
            add_box("character_coat_pocket_left", (-0.18, -0.20, height * 0.44), (0.12, 0.03, 0.09), dark, root, bevel=0.010)
            add_box("character_coat_pocket_right", (0.18, -0.20, height * 0.44), (0.12, 0.03, 0.09), dark, root, bevel=0.010)
            # Dock line and spyglass accessories
            add_ring("character_dock_rope", (-0.25, -0.02, height * 0.40), 0.09, 0.022, garment_primary, root, major_segments=16, minor_segments=6, rotation=(math.radians(80), 0, math.radians(20)))
            add_cylinder("character_spyglass_body", (0.24, -0.03, height * 0.42), 0.022, 0.18, garment_secondary, root, vertices=12, bevel=0.006)
            add_ring("character_spyglass_ring", (0.24, -0.03, height * 0.48), 0.026, 0.008, garment_secondary, root, major_segments=12, minor_segments=4)
            add_ring("character_coat_cuff_left", (-0.38, -0.020, height * 0.36), 0.092, 0.026, garment_primary, root, major_segments=12, minor_segments=4)
            add_ring("character_coat_cuff_right", (0.38, -0.020, height * 0.36), 0.092, 0.026, garment_primary, root, major_segments=12, minor_segments=4)

    elif role == "merchant":  # Maeve: Fishmonger & Market Master
        hair_z = head_center_z + head_half_height * 0.25
        add_ico("character_hair_cap", (0, 0.02, hair_z), (head_half_width * 1.04, head_half_depth * 1.04, head_half_height * 0.80), dark, root, subdivisions=ico_div)
        add_ico("character_hair_bun", (0, 0.16, hair_z), (0.12, 0.11, 0.12), dark, root, subdivisions=ico_div)
        add_ring("character_neck_scarf", (0, -0.01, neck_z + 0.04), 0.12, 0.028, garment_secondary, root, major_segments=8, minor_segments=4)
        add_ico("character_apron_bib", (0, -0.03, height * 0.58), (0.295, 0.205, 0.32), garment_secondary, root, subdivisions=ico_div)
        add_box("character_apron_skirt", (0, -0.04, height * 0.40), (0.40, 0.26, 0.28), garment_secondary, root, bevel=0.022)
        add_box("character_dress_skirt", (0, 0.0, height * 0.38), (0.44, 0.28, 0.32), garment_primary, root, bevel=0.026)
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
    white, black, canvas, leather, teal, ochre = spec["palette"]
    lod_index = spec.get("_lodIndex", 0)
    detail = lod_index == 0
    s = params.get("scale", 1.0)
    ear_length = params.get("earLength", 1.0)
    leg_length = params.get("legLength", 1.0)
    suffix = "" if detail else "_lod1"
    prefix = spec["id"]

    def named(part: str) -> str:
        return f"{prefix}_{part}{suffix}"

    head_pivot = _fauna_motion_node(
        named("head_pivot"), lod_root, (0.0, -0.84 * s, 1.53 * s)
    )
    ear_left_pivot = _fauna_motion_node(
        named("ear_left_pivot"), lod_root, (-0.20 * s, -0.96 * s, 1.98 * s)
    )
    ear_right_pivot = _fauna_motion_node(
        named("ear_right_pivot"), lod_root, (0.20 * s, -0.96 * s, 1.98 * s)
    )
    tail_pivot = _fauna_motion_node(
        named("tail_pivot"), lod_root, (0.0, 0.86 * s, 1.27 * s)
    )

    body_meshes = []
    body_meshes.append(add_ico(named("body_main"), (0.0, 0.08 * s, 1.17 * s), (0.54 * s, 0.88 * s, 0.48 * s), white, lod_root, subdivisions=2 if detail else 1))
    body_meshes.append(add_ico(named("chest"), (0.0, -0.47 * s, 1.18 * s), (0.48 * s, 0.43 * s, 0.47 * s), white, lod_root, subdivisions=2 if detail else 1))
    body_meshes.append(add_ico(named("haunch"), (0.0, 0.60 * s, 1.20 * s), (0.51 * s, 0.43 * s, 0.50 * s), white, lod_root, subdivisions=2 if detail else 1))
    body_meshes.append(add_box(named("belly"), (0.0, 0.08 * s, 0.96 * s), (0.78 * s, 1.25 * s, 0.43 * s), white, lod_root, bevel=0.055 * s))

    if detail:
        body_meshes.extend([
            add_ico(named("shoulder_patch"), (-0.39 * s, -0.39 * s, 1.30 * s), (0.15 * s, 0.22 * s, 0.22 * s), black, lod_root, subdivisions=1),
            add_ico(named("rump_patch"), (0.36 * s, 0.66 * s, 1.33 * s), (0.19 * s, 0.23 * s, 0.22 * s), black, lod_root, subdivisions=1),
            add_ico(named("flank_patch"), (-0.47 * s, 0.18 * s, 1.07 * s), (0.10 * s, 0.32 * s, 0.20 * s), black, lod_root, subdivisions=1),
        ])

    neck = add_tapered_beam(
        named("neck"), (0.0, -0.40 * s, 1.20 * s), (0.0, -0.82 * s, 1.58 * s),
        0.29 * s, 0.22 * s, white, lod_root, vertices=7,
    )
    body_meshes.append(neck)
    for index in range(5 if detail else 3):
        body_meshes.append(add_tri_prism(
            named(f"mane_{index}"),
            (0.0, (-0.55 + index * -0.075) * s, (1.58 + index * 0.09) * s),
            (0.10 * s, 0.07 * s, 0.23 * s), black, lod_root,
            rotation=(0.0, math.radians(8), 0.0),
        ))

    head_meshes = [
        add_ico(named("head"), (0.0, -1.03 * s, 1.75 * s), (0.35 * s, 0.39 * s, 0.33 * s), white, lod_root, subdivisions=2 if detail else 1),
        add_ico(named("muzzle"), (0.0, -1.34 * s, 1.62 * s), (0.27 * s, 0.25 * s, 0.19 * s), canvas, lod_root, subdivisions=1),
        add_box(named("jaw"), (0.0, -1.25 * s, 1.48 * s), (0.27 * s, 0.22 * s, 0.12 * s), canvas, lod_root, bevel=0.02 * s),
    ]
    if detail:
        head_meshes.extend([
            add_ico(named("eye_left"), (-0.22 * s, -1.31 * s, 1.84 * s), (0.035 * s, 0.024 * s, 0.040 * s), black, lod_root, subdivisions=1),
            add_ico(named("eye_right"), (0.22 * s, -1.31 * s, 1.84 * s), (0.035 * s, 0.024 * s, 0.040 * s), black, lod_root, subdivisions=1),
            add_ico(named("nostril_left"), (-0.10 * s, -1.55 * s, 1.66 * s), (0.028 * s, 0.018 * s, 0.020 * s), black, lod_root, subdivisions=1),
            add_ico(named("nostril_right"), (0.10 * s, -1.55 * s, 1.66 * s), (0.028 * s, 0.018 * s, 0.020 * s), black, lod_root, subdivisions=1),
            add_box(named("mouth"), (0.0, -1.56 * s, 1.55 * s), (0.13 * s, 0.014 * s, 0.012 * s), black, lod_root, bevel=0.002 * s),
        ])

    ear_meshes = []
    ear_height = 0.34 * ear_length * s
    for side, sign in (("left", -1.0), ("right", 1.0)):
        ear_meshes.append(add_tri_prism(
            named(f"ear_{side}"),
            (sign * 0.20 * s, -0.96 * s, 1.98 * s + ear_height * 0.50),
            (0.16 * s, 0.12 * s, ear_height), white, lod_root,
            rotation=(math.radians(-5), sign * math.radians(10), sign * math.radians(4)),
        ))

    bridle = add_box(named("bridle_band"), (0.0, -1.19 * s, 1.77 * s), (0.61 * s, 0.07 * s, 0.07 * s), leather, lod_root, bevel=0.012 * s)
    body_meshes.append(bridle)
    saddle_blanket = add_box(named("saddle_blanket"), (0.0, 0.03 * s, 1.63 * s), (1.08 * s, 0.88 * s, 0.12 * s), canvas, lod_root, bevel=0.05 * s)
    saddle_pad = add_box(named("saddle_pad"), (0.0, 0.03 * s, 1.71 * s), (0.90 * s, 0.65 * s, 0.09 * s), teal, lod_root, bevel=0.04 * s)
    saddle = add_ico(named("saddle"), (0.0, 0.03 * s, 1.79 * s), (0.43 * s, 0.40 * s, 0.14 * s), leather, lod_root, subdivisions=1)
    pommel = add_box(named("saddle_pommel"), (0.0, -0.28 * s, 1.86 * s), (0.26 * s, 0.16 * s, 0.12 * s), leather, lod_root, bevel=0.025 * s)
    body_meshes.extend([saddle_blanket, saddle_pad, saddle, pommel])
    for side, sign in (("left", -1.0), ("right", 1.0)):
        body_meshes.append(add_box(
            named(f"saddle_stirrup_{side}"), (sign * 0.45 * s, 0.03 * s, 1.28 * s),
            (0.06 * s, 0.10 * s, 0.48 * s), leather, lod_root, bevel=0.012 * s,
        ))
        body_meshes.append(add_box(
            named(f"saddle_buckle_{side}"), (sign * 0.45 * s, -0.04 * s, 1.53 * s),
            (0.09 * s, 0.035 * s, 0.07 * s), ochre, lod_root, bevel=0.008 * s,
        ))
    if detail:
        add_rope_line(
            named("rein_left"), [(-0.20 * s, -1.40 * s, 1.68 * s), (-0.33 * s, -0.85 * s, 1.72 * s), (-0.33 * s, -0.22 * s, 1.82 * s)],
            0.012 * s, leather, lod_root, vertices=5,
        )
        add_rope_line(
            named("rein_right"), [(0.20 * s, -1.40 * s, 1.68 * s), (0.33 * s, -0.85 * s, 1.72 * s), (0.33 * s, -0.22 * s, 1.82 * s)],
            0.012 * s, leather, lod_root, vertices=5,
        )

    tail_meshes = [
        add_tapered_beam(named("tail"), (0.0, 0.88 * s, 1.28 * s), (0.0, 1.16 * s, 0.87 * s), 0.055 * s, 0.030 * s, white, lod_root, vertices=5),
        add_ico(named("tail_tuft"), (0.0, 1.18 * s, 0.80 * s), (0.12 * s, 0.10 * s, 0.18 * s), black, lod_root, subdivisions=1),
    ]

    leg_pivots = {}
    lower_pivots = {}
    leg_layout = (
        ("front_left", -0.36, -0.55),
        ("front_right", 0.36, -0.55),
        ("rear_left", -0.38, 0.58),
        ("rear_right", 0.38, 0.58),
    )
    hip_z = 1.08 * s
    knee_z = 0.58 * leg_length * s
    ankle_z = 0.11 * s
    for leg_name, x, y in leg_layout:
        pivot = _fauna_motion_node(named(f"leg_{leg_name}_pivot"), lod_root, (x * s, y * s, hip_z))
        lower = _fauna_motion_node(named(f"leg_{leg_name}_lower_pivot"), pivot, (0.0, 0.0, knee_z - hip_z))
        upper_mesh = add_tapered_beam(
            named(f"leg_{leg_name}_upper"), (x * s, y * s, hip_z), (x * s, (y - 0.025) * s, knee_z),
            0.14 * s, 0.105 * s, white, lod_root, vertices=7,
        )
        knee_mesh = add_ico(named(f"leg_{leg_name}_knee"), (x * s, (y - 0.025) * s, knee_z), (0.13 * s, 0.12 * s, 0.12 * s), white, lod_root, subdivisions=1)
        lower_mesh = add_tapered_beam(
            named(f"leg_{leg_name}_lower"), (x * s, (y - 0.025) * s, knee_z), (x * s, y * s, ankle_z),
            0.105 * s, 0.072 * s, white, lod_root, vertices=7,
        )
        hoof_mesh = add_box(
            named(f"hoof_{leg_name}"), (x * s, (y - 0.07) * s, 0.065 * s),
            (0.25 * s, 0.32 * s, 0.13 * s), ochre, lod_root, bevel=0.018 * s,
        )
        _reparent_preserving_world(upper_mesh, pivot)
        for mesh in (knee_mesh, lower_mesh, hoof_mesh):
            _reparent_preserving_world(mesh, lower)
        leg_pivots[leg_name] = pivot
        lower_pivots[leg_name] = lower

    for mesh in head_meshes:
        _reparent_preserving_world(mesh, head_pivot)
    for mesh, pivot in zip(ear_meshes, (ear_left_pivot, ear_right_pivot)):
        _reparent_preserving_world(mesh, pivot)
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
        (duration, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    ]


def _donkey_swing(duration: float, amount: float, phase: float = 1.0):
    return [
        (0.0, (phase * amount, 0.0, 0.0), (0.0, 0.0, 0.0)),
        (duration * 0.25, (phase * amount * 0.35, 0.0, 0.0), (0.0, 0.0, 0.0)),
        (duration * 0.50, (-phase * amount, 0.0, 0.0), (0.0, 0.0, 0.0)),
        (duration * 0.75, (-phase * amount * 0.35, 0.0, 0.0), (0.0, 0.0, 0.0)),
        (duration, (phase * amount, 0.0, 0.0), (0.0, 0.0, 0.0)),
    ]


def _donkey_phase_swing(duration: float, amount: float, phase_offset: float):
    """Sample a periodic joint swing at a stable phase offset."""
    keyframes = []
    for sample in (0.0, 0.25, 0.50, 0.75, 1.0):
        swing = math.sin(((sample + phase_offset) % 1.0) * math.tau)
        keyframes.append((
            duration * sample,
            (swing * amount, 0.0, 0.0),
            (0.0, 0.0, 0.0),
        ))
    return keyframes


def _donkey_pelvis_track(duration: float, lift: float, roll: float):
    """Give the body a restrained four-beat weight transfer."""
    return [
        (0.0, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        (duration * 0.25, (math.radians(0.8), 0.0, roll), (0.0, 0.0, lift)),
        (duration * 0.50, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        (duration * 0.75, (math.radians(-0.8), 0.0, -roll), (0.0, 0.0, lift)),
        (duration, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
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
        f"{spec['id']}_rider_socket", (0.0, 0.03 * spec["parameters"].get("scale", 1.0), 1.82 * spec["parameters"].get("scale", 1.0)),
        motion_root, marker_type="socket",
    )
    rider_socket["neva_socket"] = True

    if not pivots:
        return
    legs = pivots["legs"]
    lower_legs = pivots["lower_legs"]
    walk_duration = 0.8
    trot_duration = 0.56
    walk_tracks = [
        (motion_root, _donkey_pelvis_track(walk_duration, 0.025, math.radians(0.9))),
        (pivots["tail"], _donkey_swing(walk_duration, math.radians(8), 1.0)),
        (pivots["ear_left"], _donkey_swing(walk_duration, math.radians(4), 1.0)),
        (pivots["ear_right"], _donkey_swing(walk_duration, math.radians(4), -1.0)),
    ]
    trot_tracks = [
        (motion_root, _donkey_pelvis_track(trot_duration, 0.038, math.radians(1.3))),
        (pivots["tail"], _donkey_swing(trot_duration, math.radians(13), 1.0)),
        (pivots["ear_left"], _donkey_swing(trot_duration, math.radians(6), 1.0)),
        (pivots["ear_right"], _donkey_swing(trot_duration, math.radians(6), -1.0)),
    ]
    walk_phases = {
        "rear_left": 0.00,
        "front_left": 0.25,
        "rear_right": 0.50,
        "front_right": 0.75,
    }
    for leg_name, pivot in legs.items():
        walk_phase = walk_phases[leg_name]
        walk_tracks.append((pivot, _donkey_phase_swing(walk_duration, math.radians(25), walk_phase)))
        walk_tracks.append((lower_legs[leg_name], _donkey_phase_swing(
            walk_duration, math.radians(13), (walk_phase + 0.10) % 1.0
        )))
        trot_phase = 0.0 if leg_name in ("front_left", "rear_right") else 0.5
        trot_tracks.append((pivot, _donkey_phase_swing(trot_duration, math.radians(34), trot_phase)))
        trot_tracks.append((lower_legs[leg_name], _donkey_phase_swing(
            trot_duration, math.radians(18), (trot_phase + 0.10) % 1.0
        )))

    _author_fauna_tracks(spec, "idle", [(motion_root, [
        (0.0, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        (0.8, (math.radians(1.0), 0.0, 0.0), (0.0, 0.0, 0.012)),
        (1.6, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    ])])
    _author_fauna_tracks(spec, "graze", [
        (motion_root, _donkey_identity(2.4)),
        (pivots["head"], [
            (0.0, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
            (0.6, (math.radians(28), 0.0, 0.0), (0.0, -0.04, -0.05)),
            (1.2, (math.radians(44), 0.0, math.radians(-4)), (0.0, -0.06, -0.08)),
            (1.8, (math.radians(32), 0.0, math.radians(4)), (0.0, -0.04, -0.05)),
            (2.4, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        ]),
    ])
    _author_fauna_tracks(spec, "look", [
        (motion_root, _donkey_identity(1.8)),
        (pivots["head"], [
            (0.0, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
            (0.45, (math.radians(-4), 0.0, math.radians(-15)), (0.0, 0.0, 0.0)),
            (0.90, (math.radians(-2), 0.0, math.radians(14)), (0.0, 0.0, 0.0)),
            (1.35, (math.radians(-3), 0.0, math.radians(-10)), (0.0, 0.0, 0.0)),
            (1.8, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        ]),
        (pivots["ear_left"], _donkey_swing(1.8, math.radians(7), 1.0)),
        (pivots["ear_right"], _donkey_swing(1.8, math.radians(7), -1.0)),
    ])
    _author_fauna_tracks(spec, "walk", walk_tracks)
    _author_fauna_tracks(spec, "trot", trot_tracks)
    _author_fauna_tracks(spec, "mount", [
        (motion_root, [
            (0.0, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
            (0.32, (math.radians(-2), 0.0, 0.0), (0.0, 0.0, -0.025)),
            (0.8, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        ]),
        (pivots["head"], _donkey_identity(0.8)),
    ])
    _author_fauna_tracks(spec, "dismount", [
        (motion_root, [
            (0.0, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
            (0.36, (math.radians(2), 0.0, 0.0), (0.0, 0.0, 0.02)),
            (0.8, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        ]),
        (pivots["head"], _donkey_identity(0.8)),
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
