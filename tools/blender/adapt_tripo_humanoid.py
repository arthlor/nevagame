"""Re-skin the Neva player rig and its authored performances onto a Tripo character.

Run in a fresh background Blender process, writing to a new directory:

    blender --background --factory-startup --python tools/blender/adapt_tripo_humanoid.py -- \
        --asset char_player_a --output-dir output/tripo-char_player_a

The player's rig, every catalog action and every socket already exist in the
previous durable library (``SOURCES[...]["donorLibrary"]``). Wearable anchors,
equipment grips, ``humanoidRig`` semantics and clip contacts all name those
bones, so the new body is fitted to that rig rather than the other way round:

* Every performance is sampled once from the previous library as armature-space
  bone matrices.
* The Tripo capture is imported without its unusable provider skin (all weight
  on the hips) and scaled to the declared stature. Tripo's inverse bind matrices
  still mark sensible joint centres; after the declared frame correction they
  place the spine, neck, head, arm and finger joints of the rig's new rest pose.
* The lower body keeps its proportions and is scaled uniformly to the capture's
  hip height, so the rig's detached feet keep meeting its shins.
* Each re-rested bone keeps its old orientation up to the minimal swing onto its
  new direction. Baking every frame with the *old* armature-space rotations
  therefore reproduces each performance on the new proportions.
* The provider's UV-seam duplicates are welded. Below the armpit each hanging
  arm is cut free of the flank, hip and thigh the provider fused it to.
* Weights transfer from the previous player skin morphed into the new rest,
  diffuse by distance within each part, and keep four influences without a
  jump where a fifth overtakes the fourth.
* Faces are split into the adapter's declared material regions (starter vest
  and boots, which equipment can hide) that all keep the source texture.
* On-foot reference speeds must equal the donor stance speeds times the
  lower-body scale, or feet would slide at runtime.

The helper writes a Blender library plus a JSON report. It never exports or
publishes; the registered ``imported_blend`` generator remains the only
publication path.
"""

from __future__ import annotations

import argparse
import colorsys
import hashlib
import json
import math
from pathlib import Path
import struct
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
from mathutils.interpolate import poly_3d_calc


PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "tools" / "blender"))

from common.materials import MATERIAL_SPECS  # noqa: E402
from common.player_skin import blend_crotch  # noqa: E402

FPS = 30

SOURCES = {
    "char_player_a": {
        "donorLibrary": "art/imported/poly-pizza/char_player_a.blend",
        "donorCollection": "char_player_a",
        "rig": "char_player_rig",
        "heightMeters": 1.9,
        # Tripo's inverse binds sit in a frame yawed -90 degrees from the mesh:
        # mesh = Ry(-90) * bind. The adapter verifies the result is anatomical.
        "bindFrameYawDegrees": -90.0,
        "lowerBody": ["Root", "Body", "UpperLeg.L", "LowerLeg.L", "Foot.L", "PT.L",
                      "UpperLeg.R", "LowerLeg.R", "Foot.R", "PT.R"],
        "nonDeforming": ["Root", "PT.L", "PT.R"],
        "handSockets": ["char_player_hand_left", "char_player_hand_right", "char_player_hand_socket_left",
                        "char_player_hand_socket_right", "char_player_tool_socket"],
        # Face regions equipment can hide. A face belongs to the first region
        # whose height band and texel colour rule it satisfies; the rest keep
        # the default region. Heights are metres above the ground.
        "regions": [
            {"region": "char_player_a_boots", "maxHeight": 0.3},
            # The vest is a desaturated slate: hue ~0.6, saturation 0.1-0.25.
            {"region": "char_player_a_vest", "minHeight": 0.95, "maxHeight": 1.5,
             "hue": (0.5, 0.72), "minSaturation": 0.06, "minValue": 0.12, "maxValue": 0.62, "maxArmReach": 0.22},
        ],
        "defaultRegion": "char_player_a_body",
    },
}


def _sha256(path: Path) -> str:
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def _read_glb(path: Path) -> tuple[dict, bytes]:
    data = path.read_bytes()
    length = struct.unpack_from("<I", data, 12)[0]
    document = json.loads(data[20:20 + length])
    offset = 20 + length
    binary_length = struct.unpack_from("<I", data, offset)[0]
    return document, data[offset + 8:offset + 8 + binary_length]


def _bind_joints(capture: Path, yaw_degrees: float) -> dict[str, Vector]:
    """Joint centres in glTF mesh space from the provider inverse bind matrices."""
    document, binary = _read_glb(capture)
    skin = document["skins"][0]
    accessor = document["accessors"][skin["inverseBindMatrices"]]
    view = document["bufferViews"][accessor["bufferView"]]
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    yaw = Matrix.Rotation(math.radians(yaw_degrees), 4, "Y")
    joints = {}
    for index, node in enumerate(skin["joints"]):
        values = struct.unpack_from("<16f", binary, start + index * 64)
        inverse_bind = Matrix([values[column * 4:(column + 1) * 4] for column in range(4)]).transposed()
        joints[document["nodes"][node]["name"].removeprefix("mixamorig:")] = yaw @ inverse_bind.inverted().translation
    if not (joints["LeftUpLeg"].x > 0 > joints["RightUpLeg"].x and joints["LeftToeBase"].z > joints["LeftFoot"].z):
        raise ValueError("Declared bind-frame yaw does not put the left leg at +X with toes forward")
    return joints


def _strip_skin(source: Path, destination: Path) -> None:
    document, binary = _read_glb(source)
    for node in document.get("nodes", []):
        node.pop("skin", None)
    for mesh in document.get("meshes", []):
        for primitive in mesh["primitives"]:
            for key in [key for key in primitive["attributes"] if key.startswith(("JOINTS_", "WEIGHTS_"))]:
                del primitive["attributes"][key]
    document.pop("skins", None)
    payload = json.dumps(document, separators=(",", ":")).encode("utf-8")
    payload += b" " * ((-len(payload)) % 4)
    binary += b"\0" * ((-len(binary)) % 4)
    body = struct.pack("<II", len(payload), 0x4E4F534A) + payload + struct.pack("<II", len(binary), 0x004E4942) + binary
    destination.write_bytes(b"glTF" + struct.pack("<II", 2, 12 + len(body)) + body)


def _remove_zero_area(mesh: bpy.types.Mesh) -> int:
    bm = bmesh.new()
    try:
        bm.from_mesh(mesh)
        faces = [face for face in bm.faces if face.calc_area() < 1e-8]
        if faces:
            bmesh.ops.delete(bm, geom=faces, context="FACES_ONLY")
            bmesh.ops.delete(bm, geom=[vertex for vertex in bm.verts if not vertex.link_faces], context="VERTS")
        bm.to_mesh(mesh)
    finally:
        bm.free()
    return len(faces)


def _sample_performances(scene, rig) -> dict:
    """Armature-space matrices for every bone at every integer frame of every action."""
    rig.animation_data.use_nla = False
    performances = {}
    for track in rig.animation_data.nla_tracks:
        action = bpy.data.actions[track.name]
        rig.animation_data.action = action
        rig.animation_data.action_slot = action.slots[0]
        start, end = (round(value) for value in action.frame_range)
        frames = []
        for frame in range(start, end + 1):
            scene.frame_set(frame)
            frames.append({bone.name: bone.matrix.copy() for bone in rig.pose.bones})
        properties = {}
        for key in action.keys():
            value = action[key]
            properties[key] = value.to_dict() if hasattr(value, "to_dict") else (
                value.to_list() if hasattr(value, "to_list") else value)
        performances[action.name] = {"frames": frames, "properties": properties}
    rig.animation_data.action = None
    for pose in rig.pose.bones:
        pose.location = (0.0, 0.0, 0.0)
        pose.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
        pose.rotation_euler = (0.0, 0.0, 0.0)
        pose.scale = (1.0, 1.0, 1.0)
    scene.frame_set(0)
    return performances


def _fit_rest(rig, joints: dict[str, Vector], lower_scale: float, config: dict) -> dict:
    """Re-rest the rig on the new body; returns per-bone head/tail/swing evidence."""
    to_local = rig.matrix_world.inverted()
    old = {bone.name: bone.matrix_local.copy() for bone in rig.data.bones}
    old_head = {bone.name: bone.head_local.copy() for bone in rig.data.bones}
    old_tail = {bone.name: bone.tail_local.copy() for bone in rig.data.bones}
    # The bake scales lower-body pose positions in armature space; the rest uses
    # the same frame so rest and performances stay proportional.
    targets = {}
    for name in config["lowerBody"]:
        targets[name] = (old_head[name] * lower_scale, old_tail[name] * lower_scale)

    def local(joint):
        return to_local @ joints[joint]

    targets["Hips"] = (old_head["Hips"] * lower_scale, local("Spine"))
    targets["Abdomen"] = (local("Spine"), local("Spine1"))
    targets["Torso"] = (local("Spine1"), local("Spine2"))
    targets["Chest"] = (local("Spine2"), local("Spine2").lerp(local("Neck"), 0.75))
    targets["Neck"] = (local("Neck"), local("Head"))
    crown = joints["Head"].copy()
    crown.z = joints["Head"].z + (joints["_top"].z - joints["Head"].z) * 0.45
    targets["Head"] = (local("Head"), to_local @ crown)
    hand_ratio = {}
    for side, source in (("L", "Left"), ("R", "Right")):
        targets[f"Shoulder.{side}"] = (local(f"{source}Shoulder"), local(f"{source}Arm"))
        targets[f"UpperArm.{side}"] = (local(f"{source}Arm"), local(f"{source}ForeArm"))
        targets[f"LowerArm.{side}"] = (local(f"{source}ForeArm"), local(f"{source}Hand"))
        wrist = local(f"{source}Hand")
        knuckle = local(f"{source}HandMiddle1")
        old_palm = (old_head[f"Middle2.{side}"] - old_head[f"Wrist.{side}"]).length
        ratio = (knuckle - wrist).length / old_palm
        hand_ratio[side] = ratio
        old_wrist = (old_tail[f"Wrist.{side}"] - old_head[f"Wrist.{side}"]).length
        targets[f"Wrist.{side}"] = (wrist, wrist + (knuckle - wrist).normalized() * old_wrist * ratio)
        for finger in ("Index", "Middle", "Ring", "Pinky"):
            chain = [wrist] + [local(f"{source}Hand{finger}{index}") for index in (1, 2, 3)]
            chain.append(chain[-1] + (chain[-1] - chain[-2]))
            for index in range(4):
                targets[f"{finger}{index + 1}.{side}"] = (chain[index], chain[index + 1])
        thumb = [local(f"{source}HandThumb{index}") for index in (1, 2, 3)]
        thumb.append(thumb[-1] + (thumb[-1] - thumb[-2]))
        for index in range(3):
            targets[f"Thumb{index + 1}.{side}"] = (thumb[index], thumb[index + 1])
    missing = sorted(set(old) - set(targets))
    if missing:
        raise ValueError(f"No fitted rest for bones: {missing}")
    rest, evidence = {}, {}
    for name, (head, tail) in targets.items():
        old_direction = (old_tail[name] - old_head[name]).normalized()
        new_direction = (tail - head).normalized()
        swing = old_direction.rotation_difference(new_direction).to_matrix()
        rest[name] = (Matrix.Translation(head) @ (swing @ old[name].to_3x3()).to_4x4(), (tail - head).length)
        evidence[name] = {"swingDegrees": math.degrees(old_direction.angle(new_direction)),
                          "length": (tail - head).length}
    return {"rest": rest, "bones": evidence, "handRatio": hand_ratio, "lowerBodyScale": lower_scale}


def _apply_rest(rig, rest) -> None:
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    try:
        edit = rig.data.edit_bones
        for bone in edit:
            bone.use_connect = False
        for name, (matrix, length) in rest.items():
            edit[name].matrix = matrix
            edit[name].length = length
    finally:
        bpy.ops.object.mode_set(mode="OBJECT")


def _bone_order(rig) -> list[str]:
    order, pending = [], [bone for bone in rig.data.bones if bone.parent is None]
    while pending:
        bone = pending.pop(0)
        order.append(bone.name)
        pending.extend(bone.children)
    return order


def _weight_template(scene, rig, donor_meshes, rest) -> dict:
    """Morph the previous player body into the fitted rest and freeze it with its skin.

    The previous body was skinned to this very rig by an artist and animated in
    game; posing its rig into the new rest carries that body onto the new joint
    positions, so each part of it sits where the matching part of the new body
    does. Its surface, face normals and weights become the transfer template.
    """
    order = _bone_order(rig)
    for name in order:
        bone = rig.data.bones[name]
        kwargs = {}
        if bone.parent is not None:
            kwargs = {"parent_matrix": rest[bone.parent.name][0], "parent_matrix_local": bone.parent.matrix_local}
        local = bone.convert_local_to_pose(rest[name][0], bone.matrix_local, invert=True, **kwargs)
        location, rotation, _ = local.decompose()
        pose = rig.pose.bones[name]
        pose.rotation_mode = "QUATERNION"
        pose.location = location
        pose.rotation_quaternion = rotation
        pose.scale = (1.0, 1.0, 1.0)
    scene.view_layers[0].update()
    graph = bpy.context.evaluated_depsgraph_get()
    positions, polygons, normals, weights = [], [], [], []
    for obj in donor_meshes:
        names = {group.index: group.name for group in obj.vertex_groups}
        evaluated = obj.evaluated_get(graph)
        mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=graph)
        offset = len(positions)
        world = obj.matrix_world
        for vertex in mesh.vertices:
            positions.append(world @ vertex.co)
            weights.append({names[item.group]: item.weight for item in vertex.groups if item.weight > 1e-4})
        for polygon in mesh.polygons:
            polygons.append([offset + index for index in polygon.vertices])
            normals.append((world.to_3x3() @ polygon.normal).normalized())
        bpy.data.meshes.remove(mesh)
    for pose in rig.pose.bones:
        pose.location = (0.0, 0.0, 0.0)
        pose.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
        pose.scale = (1.0, 1.0, 1.0)
    scene.view_layers[0].update()
    return {"positions": positions, "polygons": polygons, "normals": normals, "weights": weights,
            "tree": BVHTree.FromPolygons(positions, polygons)}


def _limb_tolerance(bone: str) -> float:
    """How much farther from a bone's axis than the template surface a vertex may lie."""
    if bone.startswith(("Index", "Middle", "Ring", "Pinky", "Thumb")):
        return 0.03
    if bone.startswith(("UpperArm", "LowerArm", "Wrist")):
        return 0.045
    if bone.startswith(("UpperLeg", "LowerLeg", "Foot")):
        return 0.06
    return 0.14


def _arm_bones() -> dict:
    return {side: {f"UpperArm.{side}", f"LowerArm.{side}", f"Wrist.{side}"}
            | {f"{finger}{index}.{side}" for finger in ("Index", "Middle", "Ring", "Pinky") for index in range(1, 5)}
            | {f"Thumb{index}.{side}" for index in range(1, 4)} for side in ("L", "R")}


HAND_PREFIXES = ("Wrist", "Index", "Middle", "Ring", "Pinky", "Thumb")
# Weight diffusion reach (Gaussian sigma, metres). Hands keep crisp finger
# joints; everywhere else a weight change is spread over several centimetres.
BODY_DIFFUSION_SIGMA = 0.035
HAND_DIFFUSION_SIGMA = 0.008
# Raising an arm opens the armpit crease; a wider blend around each shoulder
# joint lets the side of the chest follow the arm instead of one edge tearing.
SHOULDER_DIFFUSION_SIGMA = 0.07
SHOULDER_ZONE_METERS = (0.2, 0.32)


def _four_influences(weights: dict) -> dict:
    """Keep at most four influences without a jump when the fifth overtakes the fourth.

    A hard top-four cut drops a 0.1 weight on one vertex while its neighbour
    keeps it, and a millimetre edge then tears open under a raised arm.
    Subtracting the fifth-largest weight from all of them is continuous in the
    input and leaves only the four that exceed it.
    """
    ranked = sorted(weights.values(), reverse=True)
    floor = ranked[4] if len(ranked) > 4 else 0.0
    kept = {name: weight - floor for name, weight in weights.items() if weight - floor > 1e-4}
    total = sum(kept.values())
    return {name: weight / total for name, weight in kept.items()}


def _smooth_weights(surface, weights, kinds, joints) -> tuple[list[dict], dict]:
    """Diffuse transferred weights over the welded surface by distance, not by edge count.

    Nearest-surface transfer jumps where two neighbouring vertices land on
    different template faces. The provider mesh mixes millimetre and
    centimetre edges, so a fixed number of neighbour-averaging passes leaves
    dense patches noisy; an edge stretches by roughly the weight gradient times
    how far its bones pull apart, whatever its length. One implicit heat step
    with edge stiffness 1/length^2 spreads every weight over a Gaussian of a
    fixed metric radius instead, and gives every UV-seam duplicate the same
    skin. Coincident vertices of different parts (both sides of an arm/body
    cut) stay apart, so the diffusion never re-joins what the partition split.
    """
    mesh = surface.data
    tree = KDTree(len(mesh.vertices))
    for vertex in mesh.vertices:
        tree.insert(vertex.co, vertex.index)
    tree.balance()
    cluster = list(range(len(mesh.vertices)))
    for vertex in mesh.vertices:
        for _, other, _ in tree.find_range(vertex.co, 2e-4):
            if other < cluster[vertex.index] and kinds[other] == kinds[vertex.index]:
                cluster[vertex.index] = cluster[other]
    members = {}
    for index, root in enumerate(cluster):
        members.setdefault(root, []).append(index)
    roots = sorted(members)
    slot = {root: position for position, root in enumerate(roots)}
    names = sorted({name for entry in weights for name in entry})
    column = {name: position for position, name in enumerate(names)}
    initial = np.zeros((len(roots), len(names)))
    for root, indices in members.items():
        for index in indices:
            for name, weight in weights[index].items():
                initial[slot[root], column[name]] += weight / len(indices)
    value = [{name: initial[slot[root], column[name]] for name in names if initial[slot[root], column[name]] > 0}
             for root in roots]
    lengths = {}
    for edge in mesh.edges:
        a, b = (slot[cluster[index]] for index in edge.vertices)
        if a == b:
            continue
        key = (min(a, b), max(a, b))
        length = (mesh.vertices[edge.vertices[0]].co - mesh.vertices[edge.vertices[1]].co).length
        lengths[key] = min(lengths.get(key, length), length)
    pairs = np.array(list(lengths), dtype=np.int64)
    stiffness = 1.0 / np.maximum(np.array(list(lengths.values())), 5e-4) ** 2
    hand = np.array([max(entry, key=entry.get).startswith(HAND_PREFIXES) for entry in value])
    centres = np.array([[mesh.vertices[root].co[axis] for axis in range(3)] for root in roots])
    shoulder = np.min([np.linalg.norm(centres - np.array(joints[name][:]), axis=1) for name in ("LeftArm", "RightArm")], axis=0)
    inner, outer = SHOULDER_ZONE_METERS
    blend = np.clip((outer - shoulder) / (outer - inner), 0.0, 1.0)
    blend = blend * blend * (3.0 - 2.0 * blend)
    sigma = BODY_DIFFUSION_SIGMA + (SHOULDER_DIFFUSION_SIGMA - BODY_DIFFUSION_SIGMA) * blend
    sigma = np.where(hand, HAND_DIFFUSION_SIGMA, sigma)
    # One implicit step of du/dt = lap(u) over time t spreads a step to a
    # Gaussian of variance ~3t on a triangle mesh; solve (1/t + L) u = u0 / t.
    inertia = 3.0 / sigma ** 2
    first, second = pairs[:, 0], pairs[:, 1]
    diagonal = inertia + np.bincount(first, stiffness, len(roots)) + np.bincount(second, stiffness, len(roots))

    def apply(matrix):
        flux = stiffness[:, None] * (matrix[first] - matrix[second])
        result = inertia[:, None] * matrix
        np.add.at(result, first, flux)
        np.add.at(result, second, -flux)
        return result

    rhs = inertia[:, None] * initial
    solution = initial.copy()
    residual = rhs - apply(solution)
    conditioned = residual / diagonal[:, None]
    direction = conditioned.copy()
    alignment = np.sum(residual * conditioned, axis=0)
    scale = np.linalg.norm(rhs, axis=0) + 1e-12
    for iteration in range(4000):
        product = apply(direction)
        step = alignment / np.maximum(np.sum(direction * product, axis=0), 1e-30)
        solution += step * direction
        residual -= step * product
        if np.max(np.linalg.norm(residual, axis=0) / scale) < 1e-8:
            break
        conditioned = residual / diagonal[:, None]
        updated = np.sum(residual * conditioned, axis=0)
        direction = conditioned + (updated / np.maximum(alignment, 1e-30)) * direction
        alignment = updated
    else:
        raise ValueError("Weight diffusion did not converge")
    solution = np.maximum(solution, 0.0)
    smoothed = []
    for row in solution:
        smoothed.append({name: float(row[position]) for position, name in enumerate(names) if row[position] > 1e-6})
    evidence = {"method": "implicit metric heat diffusion over welded vertices",
                "bodySigmaMeters": BODY_DIFFUSION_SIGMA, "handSigmaMeters": HAND_DIFFUSION_SIGMA,
                "shoulderSigmaMeters": SHOULDER_DIFFUSION_SIGMA, "shoulderZoneMeters": list(SHOULDER_ZONE_METERS),
                "iterations": iteration + 1}
    return [smoothed[slot[cluster[index]]] for index in range(len(mesh.vertices))], evidence


def _transfer_weights(surface, rig, template, non_deforming, rest, joints) -> dict:
    """Each vertex takes the interpolated skin of the nearest compatible template surface.

    A compatible match faces the vertex's way and, when it belongs to a limb, is
    about as far from that limb's axis as the vertex is. That keeps a loose vest
    panel under an A-pose armpit on the template torso rather than the arm
    hanging beside it, and a hand beside the thigh on the template hand.
    """
    surface.data.update()
    tree = template["tree"]
    positions = template["positions"]
    world = rig.matrix_world
    axes = {name: (world @ matrix.translation, world @ (matrix @ Vector((0.0, length, 0.0))))
            for name, (matrix, length) in rest.items()}
    face_bone = []
    for corners in template["polygons"]:
        totals = {}
        for index in corners:
            for name, weight in template["weights"][index].items():
                totals[name] = totals.get(name, 0.0) + weight
        face_bone.append(max(totals, key=totals.get) if totals else None)

    def compatible(point, normal, hit):
        location, _, face, _ = hit
        if template["normals"][face].dot(normal) <= 0.0:
            return False
        bone = face_bone[face]
        if bone is None or bone not in axes:
            return True
        head, tail = axes[bone]
        return _segment_distance(point, head, tail) <= _segment_distance(location, head, tail) + _limb_tolerance(bone)

    groups = {bone.name: surface.vertex_groups.new(name=bone.name) for bone in rig.data.bones}
    corner_normals = [Vector((0.0, 0.0, 0.0)) for _ in surface.data.vertices]
    for polygon in surface.data.polygons:
        for index in polygon.vertices:
            corner_normals[index] += polygon.normal * polygon.area
    matched = flipped = unmatched = 0
    transferred = []
    for vertex in surface.data.vertices:
        normal = corner_normals[vertex.index].normalized()
        hits = sorted(tree.find_nearest_range(vertex.co, 0.22), key=lambda hit: hit[3])
        hit = next((candidate for candidate in hits if compatible(vertex.co, normal, candidate)), None)
        if hit is None:
            hit = tree.find_nearest(vertex.co)
            flipped += 1 if hits else 0
            unmatched += 0 if hits else 1
        else:
            matched += 1
        location, _, face, _ = hit
        corners = template["polygons"][face]
        factors = poly_3d_calc([positions[index] for index in corners], location)
        blended = {}
        for index, factor in zip(corners, factors):
            for name, weight in template["weights"][index].items():
                if name in non_deforming or name not in groups:
                    continue
                blended[name] = blended.get(name, 0.0) + weight * factor
        if sum(blended.values()) <= 0:
            raise ValueError(f"Template gave vertex {vertex.index} no deforming weight")
        transferred.append(blended)
    for vertex, blended in zip(surface.data.vertices, transferred):
        for name, weight in blended.items():
            if weight > 1e-4:
                groups[name].add([vertex.index], weight, "REPLACE")
    return {"compatibleMatches": matched, "nearestWithoutCompatibleMatch": flipped,
            "outsideSearchRadius": unmatched,
            "solver": "barycentric transfer from the previous player skin morphed into the fitted rest"}


def _relax_skin(surface, joints, kinds) -> dict:
    """Diffuse the transferred skin within each part, then keep four influences."""
    names = {group.index: group.name for group in surface.vertex_groups}
    groups = {group.name: group for group in surface.vertex_groups}
    weights = [{names[item.group]: item.weight for item in vertex.groups if item.weight > 1e-4}
               for vertex in surface.data.vertices]
    smoothed, diffusion = _smooth_weights(surface, weights, kinds, joints)
    trimmed = 0
    for vertex in surface.data.vertices:
        # Read the indices first: removing a group reorders vertex.groups.
        for group in [item.group for item in vertex.groups]:
            surface.vertex_groups[group].remove([vertex.index])
    for vertex in surface.data.vertices:
        entries = smoothed[vertex.index]
        if sum(1 for weight in entries.values() if weight > 1e-4) > 4:
            trimmed += 1
        for name, weight in _four_influences(entries).items():
            groups[name].add([vertex.index], weight, "REPLACE")
    return {**diffusion, "trimmedToFourInfluences": trimmed}


BODY, ARM_L, ARM_R, JUNCTION = 0, 1, 2, 3
# The armpit sits this far below the shoulder joints; above it arm and body
# stay one blended surface.
ARMPIT_DROP_METERS = 0.1
# Arm skin lies within this distance of the arm bones; a rolled cuff stands
# well off the forearm, the flank and hip beyond it never reach the arm axis.
ARM_REACH_METERS = 0.13
# Hand faces this close to the wrist-to-fingertip axis are hand, whichever
# way curled fingers face.
HAND_REACH_METERS = 0.08


def _weld(mesh) -> int:
    """Merge the provider's UV-seam duplicates; UVs stay per corner."""
    bm = bmesh.new()
    try:
        bm.from_mesh(mesh)
        before = len(bm.verts)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=2e-5)
        merged = before - len(bm.verts)
        bm.to_mesh(mesh)
    finally:
        bm.free()
    mesh.update()
    return merged


def _arm_chain(rig, side) -> list[Vector]:
    world = rig.matrix_world
    bones = rig.data.bones
    return [world @ bones[f"UpperArm.{side}"].head_local, world @ bones[f"LowerArm.{side}"].head_local,
            world @ bones[f"Wrist.{side}"].head_local, world @ bones[f"Middle4.{side}"].tail_local]


def _closest_on_chain(point, chain):
    best = None
    for segment, (head, tail) in enumerate(zip(chain, chain[1:])):
        axis = tail - head
        t = max(0.0, min(1.0, (point - head).dot(axis) / max(axis.length_squared, 1e-12)))
        foot = head + axis * t
        distance = (point - foot).length
        if best is None or distance < best[0]:
            best = (distance, segment, foot)
    return best


def _partition_arms(surface, rig) -> tuple[list[int], dict]:
    """Cut A-pose arms free of the flank, waist and thighs they are fused to.

    The provider surface joins each hanging arm to the body from the armpit to
    the hand wherever they touch, so no weighting can both keep that surface
    continuous and let the arm swing. Below the armpit each arm is grown over
    the surface from its outer skin and stops at faces that turn back towards
    the arm bones (flank, hip, thigh) or lie beside it facing forward or back
    (chest, shoulder blade); loose provider parts (belt fittings, pouches)
    follow their majority, and isolated labels are cleaned up. The surface is then split along the label
    boundary, arm vertices keep only their arm's bones and body vertices lose
    every arm bone. Returns each vertex's part for the weight diffusion.
    """
    arm = _arm_bones()
    names = {group.index: group.name for group in surface.vertex_groups}
    by_name = {group.name: group.index for group in surface.vertex_groups}
    chains = {side: _arm_chain(rig, side) for side in ("L", "R")}
    armpit = min(chain[0].z for chain in chains.values()) - ARMPIT_DROP_METERS
    sides = {ARM_L: "L", ARM_R: "R"}
    bm = bmesh.new()
    try:
        bm.from_mesh(surface.data)
        deform = bm.verts.layers.deform.verify()
        part = bm.faces.layers.int.new("neva_part")
        faces = list(bm.faces)
        shell_of, shells = {}, []
        for face in faces:
            if face in shell_of:
                continue
            members, pending = [], [face]
            shell_of[face] = len(shells)
            while pending:
                current = pending.pop()
                members.append(current)
                for edge in current.edges:
                    for other in edge.link_faces:
                        if other not in shell_of:
                            shell_of[other] = len(shells)
                            pending.append(other)
            shells.append(members)
        main = max(range(len(shells)), key=lambda index: len(shells[index]))

        def locate(face, side):
            centre = face.calc_center_median()
            distance, segment, foot = _closest_on_chain(centre, chains[side])
            return centre, distance, segment, (centre - foot).normalized()

        for face in faces:
            face[part] = JUNCTION if face.calc_center_median().z >= armpit else BODY
        # Grow each arm from its outer skin, which never touches the body,
        # across every face that does not face back at the arm: the flank,
        # hip and thigh a hanging arm rests against all do, so the growth
        # stops at the fused seam however puffy the sleeve is.
        grown = {}
        for side, label in (("L", ARM_L), ("R", ARM_R)):
            outward = 1.0 if side == "L" else -1.0
            pending = []
            for face in shells[main]:
                if face[part] != BODY:
                    continue
                centre, distance, segment, radial = locate(face, side)
                if distance < ARM_REACH_METERS and radial.x * outward > 0.5 and face.normal.dot(radial) > 0.5:
                    face[part] = label
                    pending.append(face)
            while pending:
                current = pending.pop()
                for edge in current.edges:
                    for other in edge.link_faces:
                        if other[part] != BODY:
                            continue
                        centre, distance, segment, radial = locate(other, side)
                        # On the side towards the body only the inner arm,
                        # which itself faces the body, belongs to the arm;
                        # the chest and back beside it face forward or back.
                        medial = radial.x * outward < -0.3
                        if segment == 2 and distance < HAND_REACH_METERS:
                            other[part] = label
                        elif (distance < ARM_REACH_METERS and other.normal.dot(radial) >= -0.2
                              and (not medial or other.normal.x * outward < -0.3)):
                            other[part] = label
                        else:
                            continue
                        pending.append(other)
            grown[side] = sum(1 for face in shells[main] if face[part] == label)
        # Loose provider parts (belt fittings, pouches, straps) move with the
        # part their faces mostly sit on.
        for index, members in enumerate(shells):
            lower = [face for face in members if face[part] != JUNCTION]
            if index == main or not lower:
                continue
            counts = {}
            for face in lower:
                centre = face.calc_center_median()
                (distance, segment, foot), side = min(((_closest_on_chain(centre, chains[side]), side)
                                                       for side in ("L", "R")), key=lambda item: item[0][0])
                label = (ARM_L if side == "L" else ARM_R) if distance < HAND_REACH_METERS else BODY
                counts[label] = counts.get(label, 0) + 1
            majority = max(counts, key=counts.get)
            for face in lower:
                face[part] = majority

        def neighbours(face):
            return [other for edge in face.edges for other in edge.link_faces
                    if other is not face and other[part] != JUNCTION]

        lower_main = [face for face in shells[main] if face[part] != JUNCTION]
        relabelled = 0
        seen = set()
        for face in lower_main:
            if face in seen:
                continue
            component, pending = [], [face]
            seen.add(face)
            while pending:
                current = pending.pop()
                component.append(current)
                for other in neighbours(current):
                    if other not in seen and other[part] == face[part]:
                        seen.add(other)
                        pending.append(other)
            if len(component) >= 12:
                continue
            around = [other[part] for current in component for other in neighbours(current) if other[part] != face[part]]
            if around:
                label = max(set(around), key=around.count)
                for current in component:
                    current[part] = label
                relabelled += len(component)
        cut = [edge for edge in bm.edges if len(edge.link_faces) == 2
               and JUNCTION not in {other[part] for other in edge.link_faces}
               and edge.link_faces[0][part] != edge.link_faces[1][part]]
        bmesh.ops.split_edges(bm, edges=cut)
        kinds = []
        restricted = {BODY: 0, ARM_L: 0, ARM_R: 0}
        empty = []
        for vertex in bm.verts:
            labels = {face[part] for face in vertex.link_faces}
            kind = labels.pop() if len(labels) == 1 else JUNCTION
            kinds.append(kind)
            if kind == JUNCTION:
                continue
            layer = vertex[deform]
            for group in list(layer.keys()):
                name = names[group]
                keep = name not in arm["L"] and name not in arm["R"] if kind == BODY else name in arm[sides[kind]]
                if not keep:
                    del layer[group]
                    restricted[kind] += 1
            if not layer.keys():
                empty.append(vertex)
        bodies = [vertex for vertex, kind in zip(bm.verts, kinds) if kind == BODY and vertex[deform].keys()]
        tree = KDTree(len(bodies))
        for index, vertex in enumerate(bodies):
            tree.insert(vertex.co, index)
        tree.balance()
        for vertex in empty:
            kind = kinds[vertex.index]
            if kind == BODY:
                _, index, _ = tree.find(vertex.co)
                for group, weight in bodies[index][deform].items():
                    vertex[deform][group] = weight
            else:
                _, segment, _ = _closest_on_chain(vertex.co, chains[sides[kind]])
                bone = ("UpperArm", "LowerArm", "Wrist")[segment]
                vertex[deform][by_name[f"{bone}.{sides[kind]}"]] = 1.0
        mixed = sum(1 for vertex in bm.verts
                    if len({face[part] for face in vertex.link_faces} - {JUNCTION}) > 1
                    and JUNCTION not in {face[part] for face in vertex.link_faces})
        counts = {label: sum(1 for face in bm.faces if face[part] == label) for label in (BODY, ARM_L, ARM_R, JUNCTION)}
        bm.faces.layers.int.remove(part)
        bm.to_mesh(surface.data)
    finally:
        bm.free()
    surface.data.update()
    evidence = {"armpitHeightMeters": armpit, "armReachMeters": ARM_REACH_METERS, "handReachMeters": HAND_REACH_METERS,
                "cutEdges": len(cut), "relabelledFaces": relabelled,
                "faces": {"body": counts[BODY], "armLeft": counts[ARM_L], "armRight": counts[ARM_R],
                          "junction": counts[JUNCTION]},
                "removedCrossPartWeights": {"body": restricted[BODY], "arms": restricted[ARM_L] + restricted[ARM_R]},
                "refilledVertices": len(empty), "unseparatedMixedVertices": mixed}
    return kinds, evidence


def _segment_distance(point, head, tail):
    segment = tail - head
    t = max(0.0, min(1.0, (point - head).dot(segment) / max(segment.length_squared, 1e-12)))
    return (point - (head + segment * t)).length


def _regions(surface, spec, config) -> dict:
    """Split faces into catalog-declared regions that all keep the source texture."""
    mesh = surface.data
    authoring = spec["skinnedAuthoring"]["materialMap"]
    source = mesh.materials[0]
    image = next(node.image for node in source.node_tree.nodes if node.type == "TEX_IMAGE" and node.image)
    width, height = image.size
    pixels = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    pixels = pixels.reshape(height, width, 4)
    uv = mesh.uv_layers.active.data
    order = [config["defaultRegion"]] + [rule["region"] for rule in config["regions"]]
    if set(order) != set(authoring):
        raise ValueError(f"Adapter regions {sorted(order)} differ from catalog materialMap {sorted(authoring)}")
    materials = {}
    mesh.materials.clear()
    for index, region in enumerate(order):
        mapping = authoring[region]
        if mapping["sourceMaterial"] != source.name:
            raise ValueError(f"{region} must keep source material {source.name!r}")
        material = source.copy()
        material.name = region
        if material.name != region:
            raise ValueError(f"Material name collision for {region}")
        shader = next(node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
        value = mapping["value"]
        shader.inputs["Base Color"].default_value = (value, value, value, 1.0)
        shader.inputs["Roughness"].default_value = MATERIAL_SPECS[mapping["token"]]["roughness"]
        shader.inputs["Metallic"].default_value = MATERIAL_SPECS[mapping["token"]]["metalness"]
        material.diffuse_color = (value, value, value, 1.0)
        material["neva_palette_token"] = mapping["token"]
        material["neva_source_material"] = region
        mesh.materials.append(material)
        materials[region] = index
    counts = {region: 0 for region in order}
    for polygon in mesh.polygons:
        centre = polygon.center
        u = sum(uv[loop].uv.x for loop in polygon.loop_indices) / polygon.loop_total
        v = sum(uv[loop].uv.y for loop in polygon.loop_indices) / polygon.loop_total
        texel = pixels[min(height - 1, max(0, int(v * height))), min(width - 1, max(0, int(u * width)))]
        # Byte images keep their stored sRGB values in `pixels`.
        hue, saturation, brightness = colorsys.rgb_to_hsv(*(float(channel) for channel in texel[:3]))
        chosen = config["defaultRegion"]
        for rule in config["regions"]:
            if centre.z > rule.get("maxHeight", 99) or centre.z < rule.get("minHeight", -99):
                continue
            if "hue" in rule and not (rule["hue"][0] <= hue <= rule["hue"][1] and saturation >= rule["minSaturation"]
                                      and rule["minValue"] <= brightness <= rule.get("maxValue", 1.0)):
                continue
            if "maxArmReach" in rule and abs(centre.x) > rule["maxArmReach"]:
                continue
            chosen = rule["region"]
            break
        polygon.material_index = materials[chosen]
        counts[chosen] += 1
    for image in bpy.data.images:
        if image.source == "FILE" and not image.packed_file:
            image.pack()
    return {"faces": counts, "texture": [width, height]}


def _lod1(surface, rig, spec, collection, scene, parent):
    level = spec["lodLevels"][1]
    copy = surface.copy()
    copy.data = surface.data.copy()
    collection.objects.link(copy)
    for modifier in [modifier for modifier in copy.modifiers if modifier.type == "ARMATURE"]:
        copy.modifiers.remove(modifier)
    # Hands keep their full surface: a collapsed hand grows fingertip-to-palm
    # edges that a closing fist squeezes to nothing.
    bone_names = {group.index: group.name for group in copy.vertex_groups}
    simplify = copy.vertex_groups.new(name="NEVA_LOD_Simplify")
    for vertex in copy.data.vertices:
        entries = [(item.weight, bone_names[item.group]) for item in vertex.groups if item.group in bone_names]
        hand = bool(entries) and max(entries)[1].startswith(HAND_PREFIXES)
        simplify.add([vertex.index], 0.0 if hand else 1.0, "REPLACE")
    decimate = copy.modifiers.new(name="NEVA_LOD_Simplification", type="DECIMATE")
    decimate.decimate_type = "COLLAPSE"
    decimate.ratio = min(0.45, level["triangleRatioMax"] * 0.8)
    decimate.use_collapse_triangulate = True
    decimate.delimit = {"MATERIAL"}
    decimate.vertex_group = simplify.name
    decimate.vertex_group_factor = 1.0
    scene.view_layers[0].update()
    graph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(copy.evaluated_get(graph), preserve_all_data_layers=True, depsgraph=graph)
    bpy.data.objects.remove(copy, do_unlink=True)
    _remove_zero_area(mesh)
    lod = bpy.data.objects.new(surface.name.replace("LOD0", "LOD1"), mesh)
    collection.objects.link(lod)
    for group in surface.vertex_groups:
        lod.vertex_groups.new(name=group.name)
    bones = len(surface.vertex_groups)
    for vertex in lod.data.vertices:
        entries = {item.group: item.weight for item in vertex.groups if item.weight > 1e-4 and item.group < bones}
        if not entries:
            raise ValueError("LOD1 decimation dropped a vertex's weights")
        for group in [item.group for item in vertex.groups if item.group < bones]:
            lod.vertex_groups[group].remove([vertex.index])
        for group, weight in _four_influences(entries).items():
            lod.vertex_groups[group].add([vertex.index], weight, "REPLACE")
    lod.parent = parent
    lod.matrix_parent_inverse = Matrix.Identity(4)
    modifier = lod.modifiers.new(name="Armature", type="ARMATURE")
    modifier.object = rig
    return lod


def _bake(scene, rig, performances, lower_scale, config, spec) -> list[dict]:
    """Key every frame with the previous armature-space rotations on the new rest."""
    lower = set(config["lowerBody"])
    bones = {bone.name: bone for bone in rig.data.bones}
    order = []
    pending = [bone for bone in rig.data.bones if bone.parent is None]
    while pending:
        bone = pending.pop(0)
        order.append(bone.name)
        pending.extend(bone.children)
    clips = {clip["name"]: clip for clip in [*spec["animationClips"], *spec.get("additionalAnimationClips", [])]}
    rig.animation_data.use_nla = False
    for track in list(rig.animation_data.nla_tracks):
        rig.animation_data.nla_tracks.remove(track)
    report = []
    for name, performance in performances.items():
        old = bpy.data.actions.get(name)
        if old is not None:
            bpy.data.actions.remove(old)
        action = bpy.data.actions.new(name)
        action.use_fake_user = True
        for key, value in performance["properties"].items():
            action[key] = value
        clip = clips.get(name)
        if clip is None:
            raise ValueError(f"Donor action {name} is not a catalog clip")
        action["neva_loop"] = clip["loop"]
        if "referenceSpeedMetersPerSecond" in clip:
            donor_speed = performance["properties"].get("neva_reference_speed_meters_per_second")
            if donor_speed is not None and not name.startswith("mounted_"):
                # The bake scales every lower-body position, so a planted foot
                # sweeps at the donor stance speed times that scale; the catalog
                # speed must match or feet slide at runtime. Mounted clips follow
                # the animal's gait instead.
                expected = donor_speed * lower_scale
                if abs(clip["referenceSpeedMetersPerSecond"] - expected) > 1e-4 * expected:
                    raise ValueError(f"{name}: catalog reference speed {clip['referenceSpeedMetersPerSecond']} m/s "
                                     f"must equal the scaled stance speed {expected:.6f} m/s")
            action["neva_reference_speed_meters_per_second"] = clip["referenceSpeedMetersPerSecond"]
        rig.animation_data.action = action
        frames = performance["frames"]
        if clip["loop"]:
            # Loop closure: a looping performance ends exactly where it began.
            frames = frames[:-1] + [frames[0]]
        previous = {}
        for frame, matrices in enumerate(frames):
            targets = {}
            for bone_name in order:
                bone = bones[bone_name]
                rotation = matrices[bone_name].to_3x3().normalized()
                if bone_name in lower:
                    head = matrices[bone_name].translation * lower_scale
                else:
                    parent = bone.parent
                    head = (targets[parent.name] @ parent.matrix_local.inverted() @ bone.matrix_local).translation
                targets[bone_name] = Matrix.Translation(head) @ rotation.to_4x4()
            for bone_name in order:
                bone = bones[bone_name]
                pose = rig.pose.bones[bone_name]
                kwargs = {}
                if bone.parent is not None:
                    kwargs = {"parent_matrix": targets[bone.parent.name], "parent_matrix_local": bone.parent.matrix_local}
                local = bone.convert_local_to_pose(targets[bone_name], bone.matrix_local, invert=True, **kwargs)
                location, rotation, _ = local.decompose()
                if bone_name in previous and rotation.dot(previous[bone_name]) < 0:
                    rotation.negate()
                previous[bone_name] = rotation.copy()
                pose.rotation_mode = "QUATERNION"
                pose.location = location
                pose.rotation_quaternion = rotation
                pose.scale = (1.0, 1.0, 1.0)
                pose.keyframe_insert("location", frame=frame)
                pose.keyframe_insert("rotation_quaternion", frame=frame)
                pose.keyframe_insert("scale", frame=frame)
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for point in curve.keyframe_points:
                            point.interpolation = "LINEAR"
        report.append({"name": name, "frames": len(frames), "loopClosed": clip["loop"]})
    rig.animation_data.action = None
    for name in performances:
        action = bpy.data.actions[name]
        track = rig.animation_data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 0, action)
        strip.action_slot = action.slots[0]
        strip.extrapolation = "NOTHING"
        strip.blend_type = "REPLACE"
    # Keep every performance as a named track but evaluate none at rest: the
    # pipeline measures the library at frame 0 and the character export
    # collects each action on its own.
    rig.animation_data.use_nla = False
    for pose in rig.pose.bones:
        pose.location = (0.0, 0.0, 0.0)
        pose.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
        pose.scale = (1.0, 1.0, 1.0)
    return report


def adapt(args) -> dict:
    catalog = json.loads((PROJECT_ROOT / "assets/specs/asset-catalog.json").read_text())
    spec = next((asset for asset in catalog["assets"] if asset["id"] == args.asset), None)
    if spec is None or args.asset not in SOURCES:
        raise ValueError(f"No reviewed Tripo humanoid adaptation for {args.asset!r}")
    authoring = spec.get("skinnedAuthoring")
    if spec.get("generator") != "imported_blend" or not authoring:
        raise ValueError("Humanoid adaptation requires an imported_blend skinnedAuthoring contract")
    config = SOURCES[args.asset]
    capture = (PROJECT_ROOT / authoring["sourceFile"]).resolve(strict=True)
    if not capture.is_relative_to(PROJECT_ROOT) or _sha256(capture) != authoring["sourceSha256"]:
        raise ValueError("skinnedAuthoring capture path or SHA-256 does not match the catalog")
    donor = (PROJECT_ROOT / config["donorLibrary"]).resolve(strict=True)
    output_dir = Path(args.output_dir).resolve()
    blend_path = output_dir / f"{args.asset}.blend"
    report_path = output_dir / f"{args.asset}-adaptation-report.json"
    if blend_path.exists() or report_path.exists():
        raise FileExistsError("Use a new staging directory; this helper does not overwrite an earlier candidate")
    output_dir.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = "NEVA_TRIPO_HUMANOID_ADAPTATION"
    scene.render.fps = FPS
    scene.render.fps_base = 1
    with bpy.data.libraries.load(str(donor), link=False) as (available, requested):
        if config["donorCollection"] not in available.collections:
            raise ValueError(f"Donor library lacks collection {config['donorCollection']!r}")
        requested.collections = [config["donorCollection"]]
    collection = requested.collections[0]
    scene.collection.children.link(collection)
    rig = bpy.data.objects[config["rig"]]
    rig.data.pose_position = "POSE"
    scene.view_layers[0].update()
    performances = _sample_performances(scene, rig)

    skinless = output_dir / f"{args.asset}-skinless-source.glb"
    _strip_skin(capture, skinless)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(skinless))
    skinless.unlink()
    imported = [obj for obj in bpy.data.objects if obj not in before]
    surfaces = [obj for obj in imported if obj.type == "MESH" and obj.data.uv_layers]
    if len(surfaces) != 1:
        raise ValueError("Expected one textured Tripo surface")
    surface = surfaces[0]
    for obj in imported:
        if obj is not surface:
            bpy.data.objects.remove(obj, do_unlink=True)
    surface.parent = None
    mesh = surface.data
    mesh.transform(surface.matrix_world)
    surface.matrix_world = Matrix.Identity(4)
    points = [vertex.co for vertex in mesh.vertices]
    minimum = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    maximum = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    scale = config["heightMeters"] / (maximum.z - minimum.z)
    centre = Vector(((minimum.x + maximum.x) / 2, (minimum.y + maximum.y) / 2, minimum.z))
    joints = {}
    for name, point in _bind_joints(capture, config["bindFrameYawDegrees"]).items():
        joints[name] = (Vector((point.x, -point.z, point.y)) - centre) * scale
    hips_world = rig.matrix_world @ rig.data.bones["UpperLeg.L"].head_local
    hips_world_right = rig.matrix_world @ rig.data.bones["UpperLeg.R"].head_local
    lower_scale = ((joints["LeftUpLeg"].z + joints["RightUpLeg"].z) / 2) / ((hips_world.z + hips_world_right.z) / 2)
    forward_shift = ((hips_world.y + hips_world_right.y) / 2) * lower_scale - (joints["LeftUpLeg"].y + joints["RightUpLeg"].y) / 2
    placement = Matrix.Translation((0.0, forward_shift, 0.0)) @ Matrix.Diagonal((scale, scale, scale, 1.0)) @ Matrix.Translation(-centre)
    mesh.transform(placement)
    for name in joints:
        joints[name] = joints[name] + Vector((0.0, forward_shift, 0.0))
    joints["_top"] = Vector((0.0, 0.0, config["heightMeters"]))
    removed = _remove_zero_area(mesh)
    welded = _weld(mesh)
    mesh.update()

    fit = _fit_rest(rig, joints, lower_scale, config)
    donor_meshes = [obj for obj in collection.all_objects if obj.type == "MESH"]
    template = _weight_template(scene, rig, [obj for obj in donor_meshes if obj.name.endswith("_LOD0")], fit["rest"])
    _apply_rest(rig, fit["rest"])
    scene.view_layers[0].update()
    for socket_name in config["handSockets"]:
        socket = bpy.data.objects[socket_name]
        side = "L" if socket.parent_bone.endswith(".L") else "R"
        socket.location = socket.location * fit["handRatio"][side]

    lod_parents = {level["node"]: bpy.data.objects[level["node"]] for level in spec["lodLevels"]}
    for obj in donor_meshes:
        mesh_data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if mesh_data.users == 0:
            bpy.data.meshes.remove(mesh_data)
    for owner in list(surface.users_collection):
        owner.objects.unlink(surface)
    collection.objects.link(surface)
    surface.name = f"{args.asset}_surface_LOD0"
    surface.data.name = f"{args.asset}_surface_LOD0_mesh"
    regions = _regions(surface, spec, config)
    weights = _transfer_weights(surface, rig, template, set(config["nonDeforming"]), fit["rest"], joints)
    kinds, weights["partition"] = _partition_arms(surface, rig)
    weights["diffusion"] = _relax_skin(surface, joints, kinds)
    # The transfer can give neighbouring seam vertices opposite thighs; a stride
    # would tear that edge. Rebuild the split across the midline (LOD1 copies it).
    weights["crotchSeam"] = blend_crotch(surface, rig)
    surface.parent = lod_parents[spec["lodLevels"][0]["node"]]
    surface.matrix_parent_inverse = Matrix.Identity(4)
    surface.matrix_basis = Matrix.Identity(4)
    armature = [modifier for modifier in surface.modifiers if modifier.type == "ARMATURE"]
    if not armature:
        armature = [surface.modifiers.new(name="Armature", type="ARMATURE")]
    armature[0].object = rig
    lod1 = _lod1(surface, rig, spec, collection, scene, lod_parents[spec["lodLevels"][1]["node"]])
    lod1.data.name = f"{args.asset}_surface_LOD1_mesh"

    clips = _bake(scene, rig, performances, lower_scale, config, spec)
    for material in list(bpy.data.materials):
        if material.users == 0:
            bpy.data.materials.remove(material)
    scene.frame_set(0)
    metrics = _validate(spec, collection, [surface, lod1], rig)
    report = {
        "assetId": args.asset,
        "sourceModelId": spec["sourceProvenance"]["modelId"],
        "sourceFile": authoring["sourceFile"],
        "sourceSha256": authoring["sourceSha256"],
        "donorLibrary": config["donorLibrary"],
        "donorLibrarySha256": _sha256(donor),
        "adapter": "tools/blender/adapt_tripo_humanoid.py",
        "providerSkin": "discarded (all weight on the hips); bind matrices used only as joint centres",
        "normalization": {"heightMeters": config["heightMeters"], "uniformScale": scale,
                          "forwardShiftMeters": forward_shift, "removedZeroAreaTriangles": removed,
                          "weldedSeamVertices": welded},
        "fit": {"lowerBodyScale": fit["lowerBodyScale"], "handRatio": fit["handRatio"],
                "maximumSwingDegrees": max(entry["swingDegrees"] for entry in fit["bones"].values())},
        "regions": regions,
        "weights": weights,
        "clips": clips,
        "metrics": metrics,
        "outputBlend": str(blend_path),
        "outputCollection": args.asset,
        "saveImpact": False,
        "publication": "not_performed",
        "visualStatus": "Awaiting human game review",
    }
    bpy.data.libraries.write(str(blend_path), {collection}, path_remap="RELATIVE", fake_user=True, compress=True)
    report["outputSha256"] = _sha256(blend_path)
    report_path.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({key: report[key] for key in ("normalization", "fit", "regions", "weights", "metrics")}, indent=2))
    return report


def _validate(spec, collection, surfaces, rig) -> dict:
    nodes = {obj.name: obj for obj in collection.all_objects}
    missing = sorted(set(spec["requiredNodes"]) - set(nodes))
    if missing:
        raise ValueError(f"Missing catalog nodes: {missing}")
    for socket in spec["socketNodes"]:
        obj = nodes[socket]
        if obj.parent is not rig or obj.parent_type != "BONE":
            raise ValueError(f"{socket} must stay bone-parented to {rig.name}")
    counts = []
    for obj in surfaces:
        obj.data.calc_loop_triangles()
        counts.append(len(obj.data.loop_triangles))
    ratio = counts[1] / counts[0]
    level = spec["lodLevels"][1]
    if not level["triangleRatioMin"] <= ratio <= level["triangleRatioMax"]:
        raise ValueError(f"LOD1 ratio {ratio:.3f} violates the catalog")
    budget = spec["budget"]
    if not budget["trianglesMin"] <= counts[0] <= budget["trianglesMax"]:
        raise ValueError(f"LOD0 has {counts[0]} triangles; catalog allows {budget['trianglesMin']}..{budget['trianglesMax']}")
    clip_names = {clip["name"] for clip in [*spec["animationClips"], *spec.get("additionalAnimationClips", [])]}
    missing_clips = sorted(clip_names - {action.name for action in bpy.data.actions})
    if missing_clips:
        raise ValueError(f"Missing baked clips: {missing_clips}")
    points = [vertex.co for vertex in surfaces[0].data.vertices]
    return {"lod0Triangles": counts[0], "lod1Triangles": counts[1], "lod1Ratio": ratio,
            "bounds": {"min": [min(point[axis] for point in points) for axis in range(3)],
                       "max": [max(point[axis] for point in points) for axis in range(3)]}}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--asset", required=True)
    parser.add_argument("--output-dir", required=True)
    arguments = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    adapt(parser.parse_args(arguments))


if __name__ == "__main__":
    main()
