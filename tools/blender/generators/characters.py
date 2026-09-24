"""Authored coastal and farm fauna; humanoids use immutable source imports."""
from __future__ import annotations
import math
import bpy
from mathutils import Vector
from common.geometry import add_box, add_collision_primitives, add_cone, add_cylinder, add_grip_marker, graft_limb, add_ico, add_leaf_blade, add_limb_tube, add_lofted_form, add_marker, add_ring, add_tapered_beam, add_tri_prism, remember_rest_transform
from common.authored import add_rope_line
from common.creature import (
    author_creature_clip,
    bake_pivot_skin,
    bind_creature_skin,
    bone,
    build_creature_armature,
    build_skinned_surface,
    decimate_skinned_lod,
    join_creature_surface,
    rest_creature_pose,
)
from common.lod import consolidate_lod_level, create_lod_roots

FRAME_RATE = 30.0
FAUNA_FRAME_RATE = 25.0
DONKEY_FRAME_RATE = 30.0
# Suspension coverage remains bounded by authored donkey hoof reach.
DONKEY_TROT_SUSPENSION_COVERAGE = 1.12
DONKEY_GALLOP_SUSPENSION_COVERAGE = 1.355
# Measured source mounted-idle palm frames after pelvis-to-saddle seating.
# Coordinates are Blender metres; geometry and contacts share these endpoints.
DONKEY_REIN_GRIPS = {
    'left': {'position':(.13468038,-.33288563,1.60851154),'fingers':(.00446208,-.50941227,-.86051100),'normal':(-.99677937,.06663532,-.04461601)},
    'right': {'position':(-.13631820,-.32579963,1.60452144),'fingers':(-.00695942,-.45901079,-.88840339),'normal':(.99611706,.07479040,-.04644512)},
}

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
    remember_rest_transform(node)
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
    expanded = []
    for node, keyframes in tracks:
        expanded.append((node, keyframes))
        sibling = bpy.data.objects.get(node.name + "_lod1")
        if sibling is not None:
            expanded.append((sibling, keyframes))
    for track_index, (node, keyframes) in enumerate(expanded):
        remember_rest_transform(node)
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
    # The deforming body remains separate from the rigid feet and feathers.
    _reparent_preserving_world(anatomy, root)
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


def _donkey_anatomy(spec, parent, name):
    """Stockier donkey barrel: shorter denser legs, thicker neck, heavier muzzle."""
    from common.materials import get_or_create_material
    s = spec["parameters"].get("scale", 1.0)
    length = spec["parameters"].get("legLength", 1.0)
    coat, mealy = spec["palette"][:2]
    # Rings: (x, y, z, radius_x, radius_z). -Y is forward.
    # Deeper barrel, thicker neck, slightly larger head vs horse-lean prior.
    sections = [
        (0, .74, 1.14, .14, .18), (0, .58, 1.14, .28, .27),
        (0, .36, 1.10, .36, .31), (0, .02, 1.06, .37, .32),
        (0, -.26, 1.07, .34, .30), (0, -.44, 1.14, .29, .28),
        (0, -.58, 1.30, .24, .25), (0, -.74, 1.46, .19, .22),
        (0, -.90, 1.58, .195, .17), (0, -1.06, 1.54, .165, .145),
        (0, -1.22, 1.48, .145, .115), (0, -1.38, 1.45, .125, .095),
    ]
    surface = add_limb_tube(name, [tuple(v * s for v in row[:3]) for row in sections],
                            [(row[3] * s, row[4] * s) for row in sections], coat, parent, sides=12)
    surface.data.materials.append(get_or_create_material(mealy))
    for face in surface.data.polygons:
        if face.center.y < -1.10 * s or (face.center.z < 1.00 * s and face.center.y > -.55 * s):
            face.material_index = 1
    bpy.context.view_layer.update()
    limbs = {}
    # Lower attachment band + thicker columns read as donkey, not racehorse.
    for label, x, y in (("front_left", -.26, -.40), ("front_right", .26, -.40),
                         ("rear_left", -.26, .44), ("rear_right", .26, .44)):
        target = Vector((x * s, y * s, 0.98 * s))
        candidates = [face for face in surface.data.polygons
                      if len(face.vertices) == 4 and face.center.z > .90 * s
                      and face.normal.x * x > .03]
        opening = min(candidates, key=lambda face: (face.center - target).length_squared).index
        opening_vertices = set(surface.data.polygons[opening].vertices)
        neighbors = [face for face in candidates if face.index != opening
                     and len(opening_vertices.intersection(face.vertices)) == 2]
        neighbor = min(neighbors, key=lambda face: (face.center - target).length_squared).index
        knee_y = y - .015 if label.startswith("front") else y + .035
        knee_z = .46 * length + (0 if label.startswith("front") else .03)
        upper_radius = .145 if label.startswith("front") else .165
        limbs[label] = graft_limb(surface, [opening, neighbor],
            [(x * s, y * s, .86 * s), (x * s, y * s, .70 * s),
             (x * s, knee_y * s, (knee_z + .05) * s),
             (x * s, knee_y * s, knee_z * s),
             (x * s, y * s, .26 * s),
             (x * s, y * s, .12 * s), (x * s, (y - .015) * s, .075 * s)],
            [upper_radius * s, upper_radius * .84 * s, .095 * s,
             .098 * s, .068 * s, .070 * s, .072 * s], token=coat)
    return {"surface": surface, "limbs": limbs}


def _skin_donkey(spec, motion_root, levels):
    s = spec["parameters"].get("scale", 1.0)
    pivots = levels[0]
    bpy.context.view_layer.update()
    inverse = motion_root.matrix_world.inverted()
    mapping = {"donkey_spine": motion_root, "donkey_head": pivots["head"]}
    bones = [bone("donkey_spine", (0, .5 * s, 1.15 * s), (0, -.4 * s, 1.15 * s)),
             bone("donkey_head", (0, -.78 * s, 1.44 * s), (0, -1.35 * s, 1.48 * s))]
    for label, upper in pivots["legs"].items():
        lower = pivots["lower_legs"][label]
        hip = inverse @ upper.matrix_world.translation
        knee = inverse @ lower.matrix_world.translation
        foot = Vector((hip.x, hip.y, .075 * s))
        bones.extend([bone("donkey_" + label, hip, knee), bone("donkey_lower_" + label, knee, foot)])
        mapping["donkey_" + label] = upper
        mapping["donkey_lower_" + label] = lower
    rig = build_creature_armature(spec["id"] + "_rig", bones, motion_root)
    surface = pivots["anatomy"]["surface"]
    bind_creature_skin(surface, rig, bones)

    def weights(indices, values):
        for index in indices:
            for group in list(surface.data.vertices[index].groups):
                surface.vertex_groups[group.group].remove([index])
            for name, value in values.items():
                if value > 0:
                    surface.vertex_groups[name].add([index], value, "REPLACE")

    for vertex in surface.data.vertices:
        head = max(0.0, min(1.0, (-vertex.co.y / s - .48) / .40))
        weights([vertex.index], {"donkey_spine": 1 - head, "donkey_head": head})
    for label, rings in pivots["anatomy"]["limbs"].items():
        upper, lower = "donkey_" + label, "donkey_lower_" + label
        for ring, values in zip(rings, [
            {"donkey_spine": .70, upper: .30}, {upper: 1.0}, {upper: 1.0},
            {upper: .85, lower: .15}, {upper: .5, lower: .5},
            {lower: 1.0}, {lower: 1.0}, {lower: 1.0},
        ]):
            weights(ring, values)
    for index, level in enumerate(levels[1:], 1):
        old = level["anatomy"]["surface"]
        parent, name = old.parent, old.name
        bpy.data.objects.remove(old, do_unlink=True)
        ratio = min(.50, spec["lodLevels"][index]["triangleRatioMax"])
        level["anatomy"]["surface"] = decimate_skinned_lod(surface, rig, ratio, name, parent)
    bake_pivot_skin(spec, rig, mapping, frame_rate=DONKEY_FRAME_RATE)


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

    # One barrel-to-neck-to-muzzle surface. Pale regions share its vertices.
    anatomy = _donkey_anatomy(spec, lod_root, named("anatomy"))

    body_meshes.append(add_limb_tube(named("mane_crest"),
        [(0, y * s, z * s) for y, z in
         ((-.32, 1.38), (-.43, 1.48), (-.54, 1.61), (-.67, 1.72), (-.80, 1.735))],
        [(width * s, depth * s) for width, depth in
         ((.025, .025), (.035, .050), (.038, .058), (.030, .05), (.018, .025))],
        dark, lod_root, sides=8 if detail else 6))

    # 4. Authored Low-Poly Head & Snout (parented to head_pivot)
    head_meshes = []
    if detail:
        head_meshes.append(add_tri_prism(
            named("forelock_tuft"), (0.0, -0.88 * s, 1.74 * s),
            (0.07 * s, 0.08 * s, 0.11 * s), dark, lod_root,
            rotation=(math.radians(-14), 0.0, 0.0),
        ))
        head_meshes.append(add_ico(
            named("nostril_left"), (-0.068 * s, -1.372 * s, 1.48 * s),
            (0.025 * s, 0.012 * s, 0.018 * s), dark, lod_root, subdivisions=1,
        ))
        head_meshes.append(add_ico(
            named("nostril_right"), (0.068 * s, -1.372 * s, 1.48 * s),
            (0.025 * s, 0.012 * s, 0.018 * s), dark, lod_root, subdivisions=1,
        ))
        head_meshes.append(add_box(
            named("mouth_seam"), (0.0, -1.32 * s, 1.41 * s),
            (0.09 * s, 0.03 * s, 0.01 * s), dark, lod_root, bevel=0.0,
        ))
        for side, sign in (("left", -1.0), ("right", 1.0)):
            head_meshes.append(add_ico(
                named(f"eye_ring_{side}"), (sign * 0.155 * s, -1.02 * s, 1.60 * s),
                (0.018 * s, 0.045 * s, 0.032 * s), mealy, lod_root, subdivisions=2,
            ))
            head_meshes.append(add_ico(
                named(f"eye_pupil_{side}"), (sign * 0.172 * s, -1.025 * s, 1.60 * s),
                (0.012 * s, 0.025 * s, 0.023 * s), dark, lod_root, subdivisions=2,
            ))
            head_meshes.append(add_limb_tube(named(f"eyelid_{side}"),
                [(sign * .171 * s, y * s, z * s) for y, z in
                 ((-1.058, 1.603), (-1.045, 1.624), (-1.018, 1.630), (-.990, 1.612))],
                [.009 * s] * 4, coat, lod_root, sides=6))

    # 5. Long Cupped Ears (parented to ear pivots)
    ear_left_meshes = []
    ear_right_meshes = []
    ear_h = 0.52 * ear_length * s
    for side, sign in (("left", -1.0), ("right", 1.0)):
        target_list = ear_left_meshes if side == "left" else ear_right_meshes
        # Shared rings give the ear a tapered rim instead of stacked wedges.
        ear = add_lofted_form(named(f"ear_cup_{side}"), [
            ((sign * .12 * s, -.88 * s, 1.69 * s), .035 * s, .030 * s),
            ((sign * .15 * s, -.88 * s, 1.70 * s + ear_h * .28), .068 * s, .032 * s),
            ((sign * .19 * s, -.87 * s, 1.70 * s + ear_h * .65), .057 * s, .024 * s),
            ((sign * .215 * s, -.85 * s, 1.70 * s + ear_h * .90), .032 * s, .016 * s),
            ((sign * .22 * s, -.84 * s, 1.70 * s + ear_h), .008 * s, .007 * s),
        ], coat, lod_root, sides=8 if detail else 6)
        from common.materials import get_or_create_material
        ear.data.materials.append(get_or_create_material(mealy))
        ear_sides = 8 if detail else 6
        for face in ear.data.polygons:
            if face.normal.y < -.65 and ear_sides <= face.index < 3 * ear_sides:
                face.material_index = 1
        target_list.append(ear)

    # 6. Tail (parented to tail_pivot)
    tail_meshes = [
        add_limb_tube(named("tail_dock"),
            [(x * s, y * s, z * s) for x, y, z in
             ((0, .72, 1.24), (.015, .83, 1.17), (.025, .92, .99), (0, .96, .83))],
            [.042 * s, .036 * s, .025 * s, .022 * s], coat, lod_root,
            sides=8 if detail else 6),
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
    blanket_path = [(x * s, .04 * s, z * s) for x, z in
                    ((-.35, 1.02), (-.32, 1.19), (-.22, 1.34), (0, 1.405),
                     (.22, 1.34), (.32, 1.19), (.35, 1.02))]
    saddle_blanket = add_limb_tube(
        named("saddle_blanket"), blanket_path, [(.36 * s, .018 * s)] * 7,
        mealy, lod_root, sides=8 if detail else 4,
    )
    saddle_base = add_limb_tube(named("saddle_seat"),
        [(0, y * s, z * s) for y, z in
         ((-.21, 1.455), (-.12, 1.435), (.04, 1.425), (.18, 1.45), (.25, 1.49))],
        [(width * s, .028 * s) for width in (.13, .18, .21, .22, .19)],
        leather, lod_root, sides=12 if detail else 8)
    body_meshes.extend([saddle_blanket, saddle_base])

    if detail:
        saddle_trim = add_limb_tube(
            named("saddle_trim"), [(x, y, z - .024 * s) for x, y, z in blanket_path],
            [(.38 * s, .012 * s)] * 7, teal, lod_root, sides=8,
        )
        saddle_pommel = add_limb_tube(named("saddle_pommel"),
            [(x * s, -.19 * s, z * s) for x, z in
             ((-.14, 1.45), (-.08, 1.49), (0, 1.51), (.08, 1.49), (.14, 1.45))],
            [.025 * s] * 5, leather, lod_root, sides=8)
        saddle_cantle = add_limb_tube(named("saddle_cantle"),
            [(x * s, y * s, z * s) for x, y, z in
             ((-.20, .18, 1.46), (-.16, .25, 1.50), (0, .28, 1.535),
              (.16, .25, 1.50), (.20, .18, 1.46))],
            [.027 * s] * 5, leather, lod_root, sides=8)
        saddle_girth = add_limb_tube(named("saddle_girth"),
            [(x * s, -.02 * s, z * s) for x, z in
             ((-.30, 1.32), (-.34, 1.12), (-.26, .91), (0, .80),
              (.26, .91), (.34, 1.12), (.30, 1.32))],
            [(.030 * s, .009 * s)] * 7, leather, lod_root, sides=6)
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

        for side, sign in (("left", 1.0), ("right", -1.0)):
            stirrup_leather = add_box(
                named(f"stirrup_leather_{side}"), (sign * 0.38 * s, -0.06 * s, 1.22 * s),
                (0.025 * s, 0.05 * s, 0.32 * s), leather, lod_root, bevel=0.004 * s,
            )
            stirrup_iron = add_ring(
                named(f"stirrup_iron_{side}"), (sign * 0.38 * s, -0.08 * s, 1.08 * s),
                0.075 * s, 0.008 * s, brass, lod_root, major_segments=8, minor_segments=4,
                rotation=(math.pi / 2, 0.0, 0.0),
            )
            body_meshes.extend([stirrup_leather, stirrup_iron])

        # Narrow fitted straps leave the cheeks and forehead visible.
        bridle_headstall = add_limb_tube(named("bridle_headstall"),
            [(x * s, y * s, z * s) for x, y, z in
             ((-.15, -.95, 1.48), (-.17, -.93, 1.59), (-.12, -.90, 1.71),
              (0, -.88, 1.745), (.12, -.90, 1.71), (.17, -.93, 1.59), (.15, -.95, 1.48))],
            [(.016 * s, .009 * s)] * 7, leather, lod_root, sides=6)
        bridle_browband = add_limb_tube(named("bridle_browband"),
            [(x * s, y * s, z * s) for x, y, z in
             ((-.155, -.98, 1.65), (-.10, -1.02, 1.69), (0, -1.035, 1.71),
              (.10, -1.02, 1.69), (.155, -.98, 1.65))],
            [(.016 * s, .008 * s)] * 5, leather, lod_root, sides=6)
        bridle_noseband = add_limb_tube(named("bridle_noseband"),
            [(x * s, -1.22 * s, z * s) for x, z in
             ((-.10, 1.42), (-.135, 1.48), (-.09, 1.565), (0, 1.59),
              (.09, 1.565), (.135, 1.48), (.10, 1.42))],
            [(.018 * s, .009 * s)] * 7, leather, lod_root, sides=6)
        head_meshes.extend([bridle_headstall, bridle_browband, bridle_noseband])

        for side, sign in (("left", 1.0), ("right", -1.0)):
            head_meshes.append(add_ring(
                named(f"bridle_bit_ring_{side}"), (sign * 0.115 * s, -1.26 * s, 1.45 * s),
                0.020 * s, 0.004 * s, brass, lod_root, major_segments=8, minor_segments=4,
                rotation=(0.0, math.pi / 2, 0.0),
            ))
    for side, sign in (("left", 1.0), ("right", -1.0)):
        grip=DONKEY_REIN_GRIPS[side]
        center=Vector(grip['position'])*s
        tangent=Vector(grip['fingers']).cross(Vector(grip['normal'])).normalized()
        add_rope_line(named(f"rein_{side}"), [
            (sign*.115*s,-1.26*s,1.45*s),
            (sign*.22*s,-.68*s,1.52*s),
            center-tangent*.04*s,
            center+tangent*.04*s,
        ], .008*s, leather, lod_root, vertices=5)

    # 8. Articulated Legs, Joints & Sturdy Donkey Hooves
    leg_pivots = {}
    lower_pivots = {}
    leg_layout = (
        ("front_left", -0.24, -0.42, True),
        ("front_right", 0.24, -0.42, True),
        ("rear_left", -0.24, 0.46, False),
        ("rear_right", 0.24, 0.46, False),
    )
    hip_z = 0.90 * s
    knee_z = 0.46 * leg_length * s
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
                0.13 * s, 0.10 * s, coat, lod_root, vertices=6 if detail else 4,
            )
            knee_mesh = add_box(
                named(f"leg_{leg_name}_knee"),
                (lx * s, (ly - 0.015) * s, knee_z),
                (0.13 * s, 0.13 * s, 0.11 * s), coat, lod_root, bevel=0.014 * s if detail else 0.0,
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
                0.15 * s, 0.11 * s, coat, lod_root, vertices=6 if detail else 4,
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

        bpy.data.objects.remove(upper_mesh, do_unlink=True)
        for mesh in lower_parts:
            if "hoof" in mesh.name:
                _reparent_preserving_world(mesh, lower)
            else:
                bpy.data.objects.remove(mesh, do_unlink=True)
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
        "anatomy": anatomy,
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
    hip_z = 0.90 * s
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
    levels = []
    if spec.get("lodLevels"):
        for lod_index, lod_root in create_lod_roots(spec, root):
            _reparent_preserving_world(lod_root, motion_root)
            lod_spec = {**spec, "parameters": dict(spec["parameters"]), "_lodIndex": lod_index}
            level_pivots = _build_donkey_lod(lod_spec, lod_root)
            levels.append(level_pivots)
            if lod_index == 0:
                pivots = level_pivots
    else:
        pivots = _build_donkey_lod(spec, root)
        levels.append(pivots)
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
    for side, sign in (("left", 1.0), ("right", -1.0)):
        stirrup_socket = add_marker(
            f"{spec['id']}_stirrup_{side}_socket",
            # Sole contact sits on the inner top of the lower tread, inside
            # the forward-facing opening sized for the source adult boot.
            (sign * 0.38 * donkey_scale, -0.08 * donkey_scale, (1.08 - 0.075 + 0.008) * donkey_scale),
            motion_root,
            marker_type="socket",
        )
        stirrup_socket["neva_socket"] = True
        grip=DONKEY_REIN_GRIPS[side]
        add_grip_marker(f"{spec['id']}_rein_grip_{side}",Vector(grip['position'])*donkey_scale,
                        motion_root,fingers=grip['fingers'],contact_normal=grip['normal'])

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
    _skin_donkey(spec, motion_root, levels)
