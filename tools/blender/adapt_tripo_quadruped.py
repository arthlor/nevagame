"""Rig and animate an explicitly requested Tripo quadruped as a Neva Blender library.

Run in a fresh background Blender process, writing to a new directory:

    blender --background --factory-startup --python tools/blender/adapt_tripo_quadruped.py -- \
        --asset fauna_donkey_a --output-dir output/tripo-fauna_donkey_a

The helper reads the selected catalog entry's ``skinnedAuthoring`` contract and
verifies the immutable capture digest. Tripo's own auto-rig is unusable (its
inverse binds sit in a rotated frame and its weights collapse onto one or two
joints), so the capture is imported without its skin. The textured surface is
yawed so the head faces runtime +Z, uniformly scaled to the declared length and
ground-centred; only zero-area triangles, which shade nothing, are removed.

A Neva quadruped rig is then built at landmarks measured for that source (the
``SOURCES`` table), with each leg's joints placed on the mesh's own measured leg
centreline. Weights come from Blender's heat solver and are cleaned to four
normalized influences; any vertex the solver leaves unweighted takes its
nearest bone. Every catalog clip is authored procedurally: gaits plant each hoof
on the ground with analytic two-bone IK over the catalog duration, reference
speed and hoof-step events, and idle clips breathe, swish and look around. Clip
channels are baked to every frame, stored as actions named for the catalog clip
and exposed as same-named NLA tracks.

The helper writes a Blender library plus a JSON report. It never exports or
publishes; the registered ``imported_blend`` generator remains the only
publication path.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
import sys

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector
from mathutils.kdtree import KDTree


PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "tools" / "blender"))

from common.materials import MATERIAL_SPECS  # noqa: E402

FPS = 30
TAU = math.tau

# Landmarks are Blender metres after normalization: +X is the animal's left,
# -Y is forward (runtime +Z) and +Z is up. They were read off orthographic
# grid renders of the normalized capture. Leg joint heights are listed here;
# the leg's x/y at each height comes from the mesh's measured centreline.
SOURCES = {
    "fauna_donkey_a": {
        "prefix": "donkey",
        "yawDegrees": 90.0,
        "lengthMeters": 2.6,
        "bones": {
            "body": ((0.0, 0.62, 1.30), (0.0, -0.36, 1.34)),
            "neck_1": ((0.0, -0.36, 1.34), (0.0, -0.66, 1.56)),
            "neck_2": ((0.0, -0.66, 1.56), (0.0, -0.92, 1.84)),
            "head": ((0.0, -0.92, 1.84), (0.0, -1.24, 1.36)),
            "ear_left": ((0.11, -0.94, 1.96), (0.25, -1.0, 2.34)),
            "ear_right": ((-0.11, -0.94, 1.96), (-0.25, -1.0, 2.34)),
            "tail_1": ((0.0, 0.96, 1.36), (0.0, 1.09, 0.98)),
            "tail_2": ((0.0, 1.09, 0.98), (0.0, 1.16, 0.64)),
        },
        "legs": {
            "front": {"top": (-0.46, 1.08), "knee": 0.52, "fetlock": 0.2, "belly": 0.78, "reach": 0.34},
            "rear": {"top": (0.58, 1.18), "knee": 0.6, "fetlock": 0.2, "belly": 0.9, "reach": 0.34},
        },
        "legLateral": 0.2,
        "pivotBones": {
            "head_pivot": "head", "ear_left_pivot": "ear_left", "ear_right_pivot": "ear_right",
            "tail_pivot": "tail_1",
            "leg_front_left_pivot": "front_left_upper", "leg_front_left_lower_pivot": "front_left_lower",
            "leg_front_right_pivot": "front_right_upper", "leg_front_right_lower_pivot": "front_right_lower",
            "leg_rear_left_pivot": "rear_left_upper", "leg_rear_left_lower_pivot": "rear_left_lower",
            "leg_rear_right_pivot": "rear_right_upper", "leg_rear_right_lower_pivot": "rear_right_lower",
        },
        # Rider contract: static root-level sockets like the retired procedural
        # donkey, so the rider's authored mounted bounce is not doubled.
        "sockets": {
            "rider_socket": ((0.0, -0.06, 1.5), None),
            "stirrup_left_socket": ((0.36, -0.1, 0.98), None),
            "stirrup_right_socket": ((-0.36, -0.1, 0.98), None),
            # Runtime quaternions (x, y, z, w) of the retired donkey's rein grips.
            "rein_grip_left": ((0.135, -0.42, 1.6), (0.708, -0.178, -0.655, 0.196)),
            "rein_grip_right": ((-0.136, -0.42, 1.6), (0.716, 0.157, 0.657, 0.176)),
        },
        "motionRoot": True,
    },
    "fauna_horse_draft_a": {
        "prefix": "horse",
        "yawDegrees": 90.0,
        "lengthMeters": 3.1,
        "bones": {
            "body": ((0.0, 0.52, 1.68), (0.0, -0.42, 1.74)),
            "neck_1": ((0.0, -0.42, 1.74), (0.0, -0.8, 2.0)),
            "neck_2": ((0.0, -0.8, 2.0), (0.0, -1.16, 2.48)),
            "head": ((0.0, -1.16, 2.48), (0.0, -1.52, 1.86)),
            "ear_left": ((0.09, -1.2, 2.56), (0.13, -1.25, 2.74)),
            "ear_right": ((-0.09, -1.2, 2.56), (-0.13, -1.25, 2.74)),
            "tail_1": ((0.0, 0.76, 1.8), (0.0, 1.04, 1.24)),
            "tail_2": ((0.0, 1.04, 1.24), (0.0, 1.3, 0.3)),
        },
        "legs": {
            "front": {"top": (-0.72, 1.36), "knee": 0.6, "fetlock": 0.22, "belly": 1.0, "reach": 0.4},
            "rear": {"top": (0.46, 1.52), "knee": 0.72, "fetlock": 0.22, "belly": 1.1, "reach": 0.36},
        },
        "legLateral": 0.24,
        "pivotBones": {},
        "sockets": {
            "trace_left": ((0.4, -0.78, 1.36), None),
            "trace_right": ((-0.4, -0.78, 1.36), None),
        },
        "boneSockets": {
            "bit_left": ("head", (0.16, -1.51, 1.91)),
            "bit_right": ("head", (-0.16, -1.51, 1.91)),
        },
        "motionRoot": False,
    },
}

LEGS = ("front_left", "front_right", "rear_left", "rear_right")

# Gait tables: per-leg touchdown phase (a clip's catalog hoof-step events,
# when declared, replace these; see _gait_for_clip), duty factor, hoof lift
# and body motion. Stride follows the catalog reference speed so a hoof stays
# planted while the entity travels at that speed.
GAITS = {
    "walk": {
        "phases": {"rear_left": 0.0, "front_left": 0.25, "rear_right": 0.5, "front_right": 0.75},
        "duty": 0.64, "lift": 0.11, "bob": 0.014, "pitch": 1.2, "roll": 1.4, "nod": 4.0, "flex": 55.0,
        "tail": 7.0, "bobCycles": 2,
    },
    "trot": {
        "phases": {"front_left": 0.0, "rear_right": 0.0, "front_right": 0.5, "rear_left": 0.5},
        "duty": 0.44, "lift": 0.16, "bob": 0.03, "pitch": 1.5, "roll": 1.0, "nod": 3.0, "flex": 75.0,
        "tail": 10.0, "bobCycles": 2,
    },
    "gallop": {
        "phases": {"rear_left": 0.0, "rear_right": 0.12, "front_left": 0.46, "front_right": 0.58},
        "duty": 0.32, "lift": 0.24, "bob": 0.05, "pitch": 6.0, "roll": 0.8, "nod": 7.0, "flex": 90.0,
        "tail": 14.0, "bobCycles": 1,
    },
}


def _sha256(path: Path) -> str:
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def _strip_skin(source: Path, destination: Path) -> None:
    """Write a skinless copy of the capture so Blender imports its bind surface as-is."""
    data = source.read_bytes()
    length = struct.unpack_from("<I", data, 12)[0]
    document = json.loads(data[20:20 + length])
    rest = data[20 + length:]
    for node in document.get("nodes", []):
        node.pop("skin", None)
    for mesh in document.get("meshes", []):
        for primitive in mesh["primitives"]:
            for key in [key for key in primitive["attributes"] if key.startswith(("JOINTS_", "WEIGHTS_"))]:
                del primitive["attributes"][key]
    document.pop("skins", None)
    payload = json.dumps(document, separators=(",", ":")).encode("utf-8")
    payload += b" " * ((-len(payload)) % 4)
    body = struct.pack("<II", len(payload), 0x4E4F534A) + payload + rest
    destination.write_bytes(b"glTF" + struct.pack("<II", 2, 12 + len(body)) + body)


def _empty(collection, name, parent=None, location=(0.0, 0.0, 0.0)):
    obj = bpy.data.objects.new(name, None)
    collection.objects.link(obj)
    obj.parent = parent
    obj.location = location
    obj.empty_display_type = "PLAIN_AXES"
    return obj


def _import_surface(scene, capture: Path, config: dict) -> tuple[bpy.types.Object, dict]:
    bpy.ops.import_scene.gltf(filepath=str(capture))
    meshes = [obj for obj in scene.objects if obj.type == "MESH" and obj.data.uv_layers]
    if len(meshes) != 1:
        raise ValueError(f"Expected one textured source surface; found {[obj.name for obj in meshes]}")
    surface = meshes[0]
    for obj in list(scene.objects):
        if obj is not surface:
            bpy.data.objects.remove(obj, do_unlink=True)
    surface.parent = None
    mesh = surface.data
    mesh.transform(surface.matrix_world)
    surface.matrix_world = Matrix.Identity(4)
    mesh.transform(Matrix.Rotation(math.radians(config["yawDegrees"]), 4, "Z"))
    points = [vertex.co for vertex in mesh.vertices]
    minimum = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    maximum = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    scale = config["lengthMeters"] / (maximum.y - minimum.y)
    centre = Vector(((minimum.x + maximum.x) / 2, (minimum.y + maximum.y) / 2, minimum.z))
    mesh.transform(Matrix.Diagonal((scale, scale, scale, 1.0)) @ Matrix.Translation(-centre))
    removed = _remove_zero_area(mesh)
    mesh.update()
    points = [vertex.co for vertex in mesh.vertices]
    minimum = [min(point[axis] for point in points) for axis in range(3)]
    maximum = [max(point[axis] for point in points) for axis in range(3)]
    return surface, {
        "uniformScale": scale,
        "yawDegrees": config["yawDegrees"],
        "dimensions": [maximum[axis] - minimum[axis] for axis in range(3)],
        "removedZeroAreaTriangles": removed,
        "policy": "uniform-ground-centre-textured-surface",
    }


def _remove_zero_area(mesh: bpy.types.Mesh) -> int:
    bm = bmesh.new()
    try:
        bm.from_mesh(mesh)
        faces = [face for face in bm.faces if face.calc_area() < 1e-8]
        count = len(faces)
        if faces:
            bmesh.ops.delete(bm, geom=faces, context="FACES_ONLY")
            loose = [vertex for vertex in bm.verts if not vertex.link_faces]
            bmesh.ops.delete(bm, geom=loose, context="VERTS")
        bm.to_mesh(mesh)
    finally:
        bm.free()
    return count


def _leg_centreline(mesh: bpy.types.Mesh, side: float, end_y: float, belly: float, reach: float):
    """Return f(z) -> (x, y) along one leg column, measured from the surface."""
    column = [
        vertex.co.copy() for vertex in mesh.vertices
        if vertex.co.z < belly and vertex.co.x * side > 0.06 and abs(vertex.co.y - end_y) < reach
    ]
    if len(column) < 20:
        raise ValueError(f"Leg column near y={end_y:.2f} side={side:+.0f} has too few vertices")

    def at(height: float) -> tuple[float, float]:
        for band in (0.04, 0.07, 0.11, 0.16):
            ring = [point for point in column if abs(point.z - height) < band]
            if len(ring) >= 4:
                xs = sorted(point.x for point in ring)
                ys = sorted(point.y for point in ring)
                return (xs[0] + xs[-1]) / 2, (ys[0] + ys[-1]) / 2
        raise ValueError(f"No leg surface near z={height:.2f}")
    return at


def _build_rig(collection, root, mesh: bpy.types.Mesh, config: dict, rig_name: str):
    prefix = config["prefix"]
    armature = bpy.data.armatures.new(f"{rig_name}_data")
    rig = bpy.data.objects.new(rig_name, armature)
    collection.objects.link(rig)
    rig.parent = root
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    edit = armature.edit_bones
    names = {}

    def bone(key, head, tail, parent=None):
        eb = edit.new(f"{prefix}_{key}")
        eb.head = Vector(head)
        eb.tail = Vector(tail)
        # Roll so every bone's local X is the body's lateral axis: a local X
        # rotation is then a pitch, and positive pitch turns the bone down.
        eb.align_roll(Vector((1.0, 0.0, 0.0)).cross((eb.tail - eb.head).normalized()))
        if parent is not None:
            eb.parent = edit[names[parent]]
        names[key] = eb.name
        return eb

    table = config["bones"]
    bone("body", *table["body"])
    bone("neck_1", *table["neck_1"], parent="body")
    bone("neck_2", *table["neck_2"], parent="neck_1")
    bone("head", *table["head"], parent="neck_2")
    bone("ear_left", *table["ear_left"], parent="head")
    bone("ear_right", *table["ear_right"], parent="head")
    bone("tail_1", *table["tail_1"], parent="body")
    bone("tail_2", *table["tail_2"], parent="tail_1")
    legs = {}
    for end in ("front", "rear"):
        spec = config["legs"][end]
        top_y, top_z = spec["top"]
        for side_name, side in (("left", 1.0), ("right", -1.0)):
            at = _leg_centreline(mesh, side, top_y + (0.08 if end == "front" else 0.2), spec["belly"], spec["reach"])
            knee_x, knee_y = at(spec["knee"])
            fetlock_x, fetlock_y = at(spec["fetlock"])
            hoof_x, hoof_y = at(0.04)
            top = Vector((knee_x * 0.85, top_y, top_z))
            knee = Vector((knee_x, knee_y, spec["knee"]))
            fetlock = Vector((fetlock_x, fetlock_y, spec["fetlock"]))
            toe = Vector((hoof_x, hoof_y - 0.1, 0.02))
            key = f"{end}_{side_name}"
            bone(f"{key}_upper", top, knee, parent="body")
            bone(f"{key}_lower", knee, fetlock, parent=f"{key}_upper")
            bone(f"{key}_hoof", fetlock, toe, parent=f"{key}_lower")
            legs[key] = {"top": top, "knee": knee, "fetlock": fetlock, "toe": toe}
    for eb in edit:
        eb.use_connect = False
        eb.use_deform = True
    bpy.ops.object.mode_set(mode="OBJECT")
    for pose in rig.pose.bones:
        pose.rotation_mode = "QUATERNION"
    return rig, names, legs


def _weights(surface: bpy.types.Object, rig: bpy.types.Object, scene, collection) -> dict:
    """Solve heat weights on a welded proxy and copy them to the textured surface.

    Faceted provider meshes split every hard edge and UV seam into separate
    vertices, which leaves the heat solver a pile of disconnected shells. The
    proxy welds coincident vertices so heat diffuses across the whole body; each
    original vertex then takes the weights of the proxy vertex at its position.
    """
    proxy_mesh = surface.data.copy()
    bm = bmesh.new()
    try:
        bm.from_mesh(proxy_mesh)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=2e-4)
        bm.to_mesh(proxy_mesh)
    finally:
        bm.free()
    proxy = bpy.data.objects.new("neva_weight_proxy", proxy_mesh)
    collection.objects.link(proxy)
    for obj in scene.objects:
        obj.select_set(False)
    proxy.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    with bpy.context.temp_override(
        active_object=rig, object=rig, selected_objects=[proxy, rig], selected_editable_objects=[proxy, rig]
    ):
        bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    tree = KDTree(len(proxy_mesh.vertices))
    for vertex in proxy_mesh.vertices:
        tree.insert(vertex.co, vertex.index)
    tree.balance()
    proxy_names = {group.index: group.name for group in proxy.vertex_groups}
    proxy_weights = [
        [(proxy_names[item.group], item.weight) for item in vertex.groups if item.weight > 1e-4]
        for vertex in proxy_mesh.vertices
    ]
    bpy.data.objects.remove(proxy, do_unlink=True)
    bpy.data.meshes.remove(proxy_mesh)
    modifier = surface.modifiers.new(name="Armature", type="ARMATURE")
    modifier.object = rig
    # Heat weighting can still leave a shell it cannot see unweighted. Such a
    # vertex takes its nearest bone segment so no part stays at bind pose.
    bones = [(bone.name, bone.head_local.copy(), bone.tail_local.copy()) for bone in rig.data.bones]
    groups = {name: surface.vertex_groups.new(name=name) for name, _, _ in bones}
    fallback = 0
    trimmed = 0
    for vertex in surface.data.vertices:
        _, index, _ = tree.find(vertex.co)
        entries = list(proxy_weights[index])
        if not entries:
            best = min(bones, key=lambda entry: _segment_distance(vertex.co, entry[1], entry[2]))
            entries = [(best[0], 1.0)]
            fallback += 1
        entries.sort(key=lambda item: -item[1])
        if len(entries) > 4:
            trimmed += 1
        entries = entries[:4]
        total = sum(weight for _, weight in entries)
        for name, weight in entries:
            groups[name].add([vertex.index], weight / total, "REPLACE")
    return {"fallbackVertices": fallback, "trimmedToFourInfluences": trimmed, "solver": "blender-heat-on-welded-proxy"}


def _segment_distance(point: Vector, head: Vector, tail: Vector) -> float:
    segment = tail - head
    t = max(0.0, min(1.0, (point - head).dot(segment) / max(segment.length_squared, 1e-12)))
    return (point - (head + segment * t)).length


def _swing(frm: Vector, to: Vector) -> Matrix:
    return frm.normalized().rotation_difference(to.normalized()).to_matrix().to_4x4()


def _aim(head: Vector, base: Matrix, direction: Vector) -> Matrix:
    """A pose matrix at head whose bone axis points along direction with minimal twist from base."""
    rotation = base.to_3x3().to_4x4()
    axis = Vector(rotation.col[1][:3])
    return Matrix.Translation(head) @ _swing(axis, direction) @ rotation


def _two_bone(root: Vector, target: Vector, upper: float, lower: float, pole: Vector) -> tuple[Vector, Vector]:
    offset = target - root
    distance = max(abs(upper - lower) + 1e-4, min(upper + lower - 1e-4, offset.length))
    direction = offset.normalized()
    along = (upper * upper - lower * lower + distance * distance) / (2 * distance)
    height = math.sqrt(max(upper * upper - along * along, 0.0))
    bend = (pole - direction * pole.dot(direction)).normalized()
    knee = root + direction * along + bend * height
    return knee, root + direction * distance


class Poser:
    """Computes armature-space targets per frame and keys them as local channels."""

    def __init__(self, rig, names, legs):
        self.rig = rig
        self.names = names
        self.legs = legs
        self.rest = {key: rig.data.bones[name].matrix_local.copy() for key, name in names.items()}
        self.length = {key: rig.data.bones[name].length for key, name in names.items()}
        self.parent = {
            key: next((other for other, name in names.items() if rig.data.bones[bone].parent
                       and rig.data.bones[bone].parent.name == name), None)
            for key, bone in names.items()
        }
        self.pole = {}
        for key, joints in legs.items():
            line = (joints["fetlock"] - joints["top"]).normalized()
            bend = joints["knee"] - joints["top"]
            perpendicular = bend - line * bend.dot(line)
            default = Vector((0.0, -1.0, 0.0)) if key.startswith("front") else Vector((0.0, 1.0, 0.0))
            self.pole[key] = perpendicular.normalized() if perpendicular.length > 0.01 else default
        self.previous = {}

    def follow(self, targets, key, local=Matrix.Identity(4)):
        parent = self.parent[key]
        targets[key] = targets[parent] @ self.rest[parent].inverted() @ self.rest[key] @ local

    def key(self, targets, frame):
        order = list(self.names)
        for key in order:
            pose = self.rig.pose.bones[self.names[key]]
            bone = pose.bone
            kwargs = {}
            parent = self.parent[key]
            if parent is not None:
                kwargs = {"parent_matrix": targets[parent], "parent_matrix_local": self.rest[parent]}
            local = bone.convert_local_to_pose(targets[key], bone.matrix_local, invert=True, **kwargs)
            position, rotation, _ = local.decompose()
            previous = self.previous.get(key)
            if previous is not None and rotation.dot(previous) < 0:
                rotation.negate()
            self.previous[key] = rotation.copy()
            pose.location = position
            pose.rotation_quaternion = rotation
            pose.scale = (1.0, 1.0, 1.0)
            pose.keyframe_insert("location", frame=frame)
            pose.keyframe_insert("rotation_quaternion", frame=frame)
            pose.keyframe_insert("scale", frame=frame)


def _euler(x=0.0, y=0.0, z=0.0) -> Matrix:
    return (Matrix.Rotation(math.radians(z), 4, "Z") @ Matrix.Rotation(math.radians(y), 4, "Y")
            @ Matrix.Rotation(math.radians(x), 4, "X"))


def _body_motion(poser, bob=0.0, pitch=0.0, roll=0.0, sway=0.0) -> Matrix:
    body = poser.rest["body"]
    pivot = (body.translation + (body @ Vector((0.0, poser.length["body"], 0.0)))) / 2
    return (Matrix.Translation(pivot + Vector((sway, 0.0, bob))) @ _euler(x=pitch, y=roll)
            @ Matrix.Translation(-pivot))


def _pose_frame(poser, body, head=(0.0, 0.0, 0.0), neck=(0.0, 0.0), tail=(0.0, 0.0), ears=(0.0, 0.0),
                leg_targets=None, hoof_flex=None, neck_2=None):
    """Compose one frame. head/neck/tail/ears are local degrees; legs follow IK targets.

    neck is (pitch, yaw) of the neck root; the upper neck repeats 80% of it
    unless neck_2 gives its own (pitch, yaw).
    """
    targets = {"body": body @ poser.rest["body"]}
    upper = neck_2 if neck_2 is not None else (neck[0] * 0.8, neck[1] * 0.8)
    poser.follow(targets, "neck_1", _euler(x=neck[0], z=neck[1]))
    poser.follow(targets, "neck_2", _euler(x=upper[0], z=upper[1]))
    poser.follow(targets, "head", _euler(x=head[0], y=head[2], z=head[1]))
    poser.follow(targets, "ear_left", _euler(x=ears[0], z=ears[1]))
    poser.follow(targets, "ear_right", _euler(x=ears[0], z=-ears[1]))
    poser.follow(targets, "tail_1", _euler(x=tail[0], z=tail[1]))
    poser.follow(targets, "tail_2", _euler(x=tail[0] * 1.3, z=tail[1] * 1.4))
    for leg, joints in poser.legs.items():
        upper_key, lower_key, hoof_key = f"{leg}_upper", f"{leg}_lower", f"{leg}_hoof"
        top = body @ joints["top"]
        goal = (leg_targets or {}).get(leg, joints["fetlock"])
        knee, fetlock = _two_bone(top, goal, (joints["knee"] - joints["top"]).length,
                                  (joints["fetlock"] - joints["knee"]).length, body.to_3x3() @ poser.pole[leg])
        upper_base = body @ poser.rest[upper_key]
        targets[upper_key] = _aim(top, upper_base, knee - top)
        lower_base = targets[upper_key] @ poser.rest[upper_key].inverted() @ poser.rest[lower_key]
        targets[lower_key] = _aim(knee, lower_base, fetlock - knee)
        rest_hoof = poser.rest[hoof_key]
        flex = (hoof_flex or {}).get(leg, 0.0)
        direction = Matrix.Rotation(math.radians(flex), 3, "X") @ Vector(rest_hoof.col[1][:3])
        hoof_base = targets[lower_key] @ poser.rest[lower_key].inverted() @ rest_hoof
        targets[hoof_key] = _aim(fetlock, hoof_base, direction)
    return targets


def _gait_targets(poser, gait: dict, phase: float, stride: float):
    targets, flex = {}, {}
    for leg, joints in poser.legs.items():
        local = (phase - gait["phases"][leg]) % 1.0
        partner = leg.replace("left", "right") if "left" in leg else leg.replace("right", "left")
        neutral_y = (joints["fetlock"].y + poser.legs[partner]["fetlock"].y) / 2
        rest = joints["fetlock"]
        duty = gait["duty"]
        if local < duty:
            s = local / duty
            y = neutral_y - stride / 2 + stride * s
            lift = 0.0
            flex[leg] = 0.0
        else:
            s = (local - duty) / (1.0 - duty)
            ease = s * s * (3.0 - 2.0 * s)
            y = neutral_y + stride / 2 - stride * ease
            if gait.get("smoothRecovery"):
                # Match stance velocity at lift-off/touchdown; flatten vertical
                # and hoof-roll velocities at the boundaries of ground contact.
                tangent = stride * (1.0 - duty) / duty
                y += tangent * (2 * s**3 - 3 * s**2 + s)
                lift = gait["lift"] * math.sin(math.pi * s)**2
                flex[leg] = gait["flex"] * math.sin(math.pi * s)**2
            else:
                lift = gait["lift"] * math.sin(math.pi * s)
                flex[leg] = gait["flex"] * math.sin(math.pi * min(1.0, s * 1.15))
        targets[leg] = Vector((rest.x, y, rest.z + lift))
    return targets, flex


def _new_action(rig, clip: dict):
    action = bpy.data.actions.new(clip["name"])
    action.use_fake_user = True
    action["neva_loop"] = clip["loop"]
    if "referenceSpeedMetersPerSecond" in clip:
        action["neva_reference_speed_meters_per_second"] = clip["referenceSpeedMetersPerSecond"]
    if "commitMarkerSeconds" in clip:
        action["neva_commit_marker_seconds"] = clip["commitMarkerSeconds"]
    rig.animation_data.action = action
    if action.slots:
        rig.animation_data.action_slot = action.slots[0]
    return action


def _author_clips(rig, poser, spec: dict) -> list[dict]:
    rig.animation_data_create()
    rig.animation_data.use_nla = False
    report = []
    for clip in spec["animationClips"]:
        name = clip["name"]
        sample_hz = 60 if spec["id"] == "fauna_horse_draft_a" else FPS
        frames = round(clip["durationSeconds"] * sample_hz)
        if abs(frames / sample_hz - clip["durationSeconds"]) > 1e-4:
            raise ValueError(f"{spec['id']}: clip {name} is not on the {FPS} fps grid")
        _new_action(rig, clip)
        poser.previous = {}
        for frame in range(frames + 1):
            t = frame / frames
            targets = _clip_frame(poser, spec, clip, name, t)
            poser.key(targets, frame * FPS / sample_hz)
        for layer in rig.animation_data.action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for point in curve.keyframe_points:
                            point.interpolation = "LINEAR"
        report.append({"name": name, "frames": frames, "durationSeconds": clip["durationSeconds"],
                       "loop": clip["loop"], "referenceSpeedMetersPerSecond": clip.get("referenceSpeedMetersPerSecond")})
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
    return report


def _gait_for_clip(name: str, clip: dict) -> dict:
    """The gait table with touchdown phases taken from the catalog's hoof-step events.

    The catalog owns when each hoof lands (audio and dust read the same
    events), so a clip that declares hoof-step events plants exactly those legs
    at exactly those times; the table's phases only fill a gait without events.
    """
    gait = dict(GAITS[name])
    events = [event for event in clip.get("events", []) if event["name"].startswith("hoofstep_")]
    if not events:
        return gait
    phases = {}
    for event in events:
        parts = event["name"].removeprefix("hoofstep_").split("_")
        for leg in ("_".join(parts[index:index + 2]) for index in range(0, len(parts), 2)):
            if leg not in GAITS[name]["phases"] or leg in phases:
                raise ValueError(f"{name}: hoof-step event {event['name']} names an unknown or repeated leg {leg}")
            phases[leg] = event["timeSeconds"] / clip["durationSeconds"]
    if set(phases) != set(GAITS[name]["phases"]):
        raise ValueError(f"{name}: hoof-step events must plant every leg once, got {sorted(phases)}")
    gait["phases"] = phases
    return gait


def _clip_frame(poser, spec, clip, name, t):
    w = TAU * t
    if name in GAITS:
        gait = _gait_for_clip(name, clip)
        if spec["id"] == "fauna_horse_draft_a":
            gait["smoothRecovery"] = True
            # A pulling draft horse uses a low economical recovery. The hoof
            # rotates modestly; a large digit curl reads as a broken ankle.
            gait.update({"lift": 0.10 if name == "walk" else 0.145,
                         "flex": 18.0 if name == "walk" else 28.0,
                         "roll": 0.65, "pitch": 0.8, "nod": 2.5,
                         "bob": 0.012 if name == "walk" else 0.022})
        speed = clip["referenceSpeedMetersPerSecond"]
        stride = speed * clip["durationSeconds"] * gait["duty"]
        cycles = gait["bobCycles"]
        if name == "gallop":
            body = _body_motion(poser, bob=gait["bob"] * math.sin(w), pitch=gait["pitch"] * math.sin(w + 0.9),
                                roll=gait["roll"] * math.sin(w))
            neck = (-gait["nod"] * math.sin(w + 0.4), 0.0)
        else:
            body = _body_motion(poser, bob=-gait["bob"] * math.cos(cycles * w),
                                pitch=gait["pitch"] * math.sin(cycles * w), roll=gait["roll"] * math.sin(w))
            neck = (gait["nod"] * math.sin(cycles * w + 0.6), 0.0)
        legs, flex = _gait_targets(poser, gait, t, stride)
        return _pose_frame(poser, body, neck=neck, tail=(4.0 * math.sin(cycles * w), gait["tail"] * math.sin(w)),
                           ears=(3.0 * math.sin(cycles * w), 2.0 * math.sin(w)), leg_targets=legs, hoof_flex=flex)
    if name == "idle":
        body = _body_motion(poser, bob=0.006 * math.sin(2 * w), pitch=0.4 * math.sin(w))
        return _pose_frame(poser, body, head=(2.0 * math.sin(w + 0.5), 1.5 * math.sin(w), 0.0),
                           neck=(1.5 * math.sin(w), 0.0), tail=(3.0 * math.sin(2 * w), 12.0 * math.sin(w)),
                           ears=(6.0 * max(0.0, math.sin(3 * w)) - 2.0, 5.0 * math.sin(2 * w)))
    if name == "graze":
        body = _body_motion(poser, bob=0.004 * math.sin(2 * w), pitch=1.2)
        chew = 3.0 * math.sin(6 * w)
        neck_1, neck_2, head = GRAZE_ANGLES[spec["id"]]
        return _pose_frame(poser, body, head=(head + chew, 3.0 * math.sin(w), 0.0),
                           neck=(neck_1, 4.0 * math.sin(w)), neck_2=(neck_2, 2.0 * math.sin(w)),
                           tail=(2.0 * math.sin(2 * w), 14.0 * math.sin(w)),
                           ears=(-8.0 + 4.0 * math.sin(2 * w), 6.0 * math.sin(w)))
    if name == "look":
        turn = math.sin(math.pi * t) ** 2
        body = _body_motion(poser, bob=0.004 * math.sin(2 * w))
        return _pose_frame(poser, body, head=(-6.0 * turn, 14.0 * turn, -6.0 * turn), neck=(-8.0 * turn, 16.0 * turn),
                           tail=(2.0 * math.sin(2 * w), 9.0 * math.sin(w)), ears=(8.0 * turn, 10.0 * turn))
    if name in ("mount", "dismount"):
        settle = math.sin(math.pi * t) * (1.0 - t * 0.3)
        body = _body_motion(poser, bob=-0.035 * settle, pitch=-1.5 * settle, roll=2.0 * math.sin(TAU * t) * (1 - t))
        shake = 6.0 * math.sin(3 * w) * settle if name == "dismount" else 0.0
        return _pose_frame(poser, body, head=(-5.0 * settle, shake, 0.0), neck=(-6.0 * settle, 0.0),
                           tail=(4.0 * settle, 10.0 * math.sin(2 * w) * settle), ears=(10.0 * settle, 6.0 * settle))
    raise ValueError(f"{spec['id']}: no authored performance for clip {name}")


GRAZE_ANGLES = {}


def _solve_graze(poser, spec, surface) -> dict:
    """Pitch neck root, upper neck and head so the muzzle reaches the grass ahead of the forelegs.

    Positive X rotation turns a forward-pointing bone down. The search prefers
    the least total bend that puts the muzzle 0.1 m above ground and clear in
    front of both front hooves.
    """
    muzzle = poser.rest["head"] @ Vector((0.0, poser.length["head"], 0.0))
    front_toe = min(poser.legs[leg]["toe"].y for leg in ("front_left", "front_right"))
    body = _body_motion(poser, pitch=1.2)
    best = None
    for neck_1 in range(40, 125, 3):
        for neck_2 in range(-30, 45, 3):
            for head in range(-90, 31, 5):
                targets = _pose_frame(poser, body, head=(head, 0.0, 0.0), neck=(neck_1, 0.0), neck_2=(neck_2, 0.0))
                tip = targets["head"] @ poser.rest["head"].inverted() @ muzzle
                score = abs(tip.z - 0.1) * 4 + max(0.0, tip.y - (front_toe - 0.15)) * 4
                score += (abs(neck_1) + abs(neck_2) + abs(head)) / 900
                if best is None or score < best[0]:
                    best = (score, neck_1, neck_2, head, tip.copy())
    _, neck_1, neck_2, head, tip = best
    GRAZE_ANGLES[spec["id"]] = (float(neck_1), float(neck_2), float(head))
    return {"neckDegrees": neck_1, "upperNeckDegrees": neck_2, "headDegrees": head, "muzzle": list(tip)}


def _lod(surface, rig, spec, collection, scene, lod_empty):
    level = spec["lodLevels"][1]
    ratio = min(0.45, level["triangleRatioMax"] * 0.8)
    copy = surface.copy()
    copy.data = surface.data.copy()
    collection.objects.link(copy)
    modifier = copy.modifiers.new(name="NEVA_LOD_Simplification", type="DECIMATE")
    modifier.decimate_type = "COLLAPSE"
    modifier.ratio = ratio
    modifier.use_collapse_triangulate = True
    armature = [mod for mod in copy.modifiers if mod.type == "ARMATURE"]
    for mod in armature:
        copy.modifiers.remove(mod)
    scene.view_layers[0].update()
    graph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(copy.evaluated_get(graph), preserve_all_data_layers=True, depsgraph=graph)
    bpy.data.objects.remove(copy, do_unlink=True)
    _remove_zero_area(mesh)
    obj = bpy.data.objects.new(f"{spec['id']}_LOD1_surface", mesh)
    collection.objects.link(obj)
    for group in surface.vertex_groups:
        obj.vertex_groups.new(name=group.name)
    # Decimation keeps the deform layer but blends collapsed vertices, so trim
    # back to four influences and re-normalize.
    for vertex in obj.data.vertices:
        entries = sorted(((item.group, item.weight) for item in vertex.groups if item.weight > 1e-4),
                         key=lambda item: -item[1])[:4]
        total = sum(weight for _, weight in entries)
        if total <= 0:
            raise ValueError("LOD1 decimation dropped a vertex's weights")
        # Read the indices first: removing a group reorders vertex.groups.
        for group in [item.group for item in vertex.groups]:
            obj.vertex_groups[group].remove([vertex.index])
        for group, weight in entries:
            obj.vertex_groups[group].add([vertex.index], weight / total, "REPLACE")
    obj.parent = lod_empty
    obj.matrix_parent_inverse = Matrix.Identity(4)
    modifier = obj.modifiers.new(name="Armature", type="ARMATURE")
    modifier.object = rig
    return obj


def _materials(surface, spec) -> list[dict]:
    authoring = spec["skinnedAuthoring"]
    mesh = surface.data
    if len(mesh.materials) != 1:
        raise ValueError("Tripo quadrupeds carry exactly one textured provider material")
    source = mesh.materials[0]
    regions = [(region, mapping) for region, mapping in authoring["materialMap"].items()]
    if len(regions) != 1 or regions[0][1]["sourceMaterial"] != source.name:
        raise ValueError(f"materialMap must name the single source material {source.name!r}")
    region, mapping = regions[0]
    material = source.copy()
    material.name = region
    if material.name != region:
        raise ValueError(f"Material name collision for {region}")
    value = mapping["value"]
    token = mapping["token"]
    principled = [node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"]
    if len(principled) != 1 or not any(node.type == "TEX_IMAGE" and node.image for node in material.node_tree.nodes):
        raise ValueError("Source material must be one textured Principled shader")
    shader = principled[0]
    shader.inputs["Base Color"].default_value = (value, value, value, 1.0)
    shader.inputs["Roughness"].default_value = MATERIAL_SPECS[token]["roughness"]
    shader.inputs["Metallic"].default_value = MATERIAL_SPECS[token]["metalness"]
    material.diffuse_color = (value, value, value, 1.0)
    material["neva_palette_token"] = token
    material["neva_source_material"] = region
    mesh.materials[0] = material
    for image in bpy.data.images:
        if image.source == "FILE" and not image.packed_file:
            image.pack()
    return [{"region": region, "sourceMaterial": source.name, "token": token, "value": value, "texturePolicy": "preserve"}]


def adapt(args) -> dict:
    catalog = json.loads((PROJECT_ROOT / "assets/specs/asset-catalog.json").read_text())
    spec = next((asset for asset in catalog["assets"] if asset["id"] == args.asset), None)
    if spec is None or args.asset not in SOURCES:
        raise ValueError(f"No reviewed Tripo quadruped adaptation for {args.asset!r}")
    authoring = spec.get("skinnedAuthoring")
    if spec.get("generator") != "imported_blend" or not authoring:
        raise ValueError("Quadruped adaptation requires an imported_blend skinnedAuthoring contract")
    config = SOURCES[args.asset]
    capture = (PROJECT_ROOT / authoring["sourceFile"]).resolve(strict=True)
    if not capture.is_relative_to(PROJECT_ROOT) or _sha256(capture) != authoring["sourceSha256"]:
        raise ValueError("skinnedAuthoring capture path or SHA-256 does not match the catalog")
    output_dir = Path(args.output_dir).resolve()
    blend_path = output_dir / f"{args.asset}.blend"
    report_path = output_dir / f"{args.asset}-adaptation-report.json"
    if blend_path.exists() or report_path.exists():
        raise FileExistsError("Use a new staging directory; this helper does not overwrite an earlier candidate")
    output_dir.mkdir(parents=True, exist_ok=True)
    skinless = output_dir / f"{args.asset}-skinless-source.glb"
    _strip_skin(capture, skinless)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = "NEVA_TRIPO_QUADRUPED_ADAPTATION"
    scene.render.fps = FPS
    scene.render.fps_base = 1
    surface, normalization = _import_surface(scene, skinless, config)
    skinless.unlink()

    collection = bpy.data.collections.new(args.asset)
    scene.collection.children.link(collection)
    for owner in list(surface.users_collection):
        owner.objects.unlink(surface)
    collection.objects.link(surface)
    root = _empty(collection, spec["rootNode"])
    root["neva_asset_root"] = True
    provenance = spec["sourceProvenance"]
    root["neva_source_provider"] = provenance["provider"]
    root["neva_source_model_id"] = provenance["modelId"]
    root["neva_source_sha256"] = authoring["sourceSha256"]
    rig_name = f"{args.asset}_rig"
    materials = _materials(surface, spec)
    rig, names, legs = _build_rig(collection, root, surface.data, config, rig_name)
    lod0 = _empty(collection, f"{args.asset}_LOD0", root)
    lod1 = _empty(collection, f"{args.asset}_LOD1", root)
    for index, (empty, level) in enumerate(((lod0, spec["lodLevels"][0]), (lod1, spec["lodLevels"][1]))):
        empty["neva_lod_index"] = index
        empty["neva_lod_distance_meters"] = level["distanceMeters"]
    weights = _weights(surface, rig, scene, collection)
    surface.name = f"{args.asset}_LOD0_surface"
    surface.data.name = f"{args.asset}_LOD0_surface_mesh"
    surface.parent = lod0
    surface.matrix_parent_inverse = Matrix.Identity(4)
    lod1_surface = _lod(surface, rig, spec, collection, scene, lod1)
    lod1_surface.data.name = f"{args.asset}_LOD1_surface_mesh"

    scene.view_layers[0].update()
    if config["motionRoot"]:
        motion = _empty(collection, f"{args.asset}_motion_root", root)
        motion["neva_marker"] = "presentation_pivot"
    for suffix, key in config["pivotBones"].items():
        bone = rig.data.bones[names[key]]
        marker = _empty(collection, f"{args.asset}_{suffix}", rig)
        marker.parent_type = "BONE"
        marker.parent_bone = bone.name
        marker.matrix_world = Matrix.Translation(bone.head_local)
        marker["neva_marker"] = "presentation_pivot"
    for suffix, (location, quaternion) in config["sockets"].items():
        socket = _empty(collection, f"{args.asset}_{suffix}", root, location)
        socket["neva_marker"] = "socket"
        if quaternion is not None:
            x, y, z, w = quaternion
            # Runtime Y-up (x, y, z) is Blender Z-up (x, -z, y).
            socket.rotation_mode = "QUATERNION"
            socket.rotation_quaternion = Quaternion((w, x, -z, y))
            # An oriented socket is a hand contact: the rider's palm aligns to
            # it only when it declares the shared palm frame, exactly as
            # common.geometry.add_grip_marker marks procedural grips.
            socket["neva_marker"] = "grip"
            socket["neva_grip_frame"] = "palm-y-fingers-z-contact-v1"

    for suffix, (key, location) in config.get("boneSockets", {}).items():
        socket = _empty(collection, f"{args.asset}_{suffix}", rig)
        socket.parent_type = "BONE"
        socket.parent_bone = names[key]
        socket.matrix_world = Matrix.Translation(location)
        socket["neva_marker"] = "socket"

    poser = Poser(rig, names, legs)
    graze = _solve_graze(poser, spec, surface) if any(clip["name"] == "graze" for clip in spec["animationClips"]) else None
    clips = _author_clips(rig, poser, spec)
    scene.frame_set(0)
    for pose in rig.pose.bones:
        pose.location = (0.0, 0.0, 0.0)
        pose.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
        pose.scale = (1.0, 1.0, 1.0)

    metrics = _validate(spec, collection, [surface, lod1_surface], rig)
    report = {
        "assetId": args.asset,
        "sourceModelId": provenance["modelId"],
        "sourceFile": authoring["sourceFile"],
        "sourceSha256": authoring["sourceSha256"],
        "adapter": "tools/blender/adapt_tripo_quadruped.py",
        "providerSkin": "discarded (inverse binds in a rotated frame; weights collapsed onto head joints)",
        "normalization": normalization,
        "rig": {"bones": sorted(bone.name for bone in rig.data.bones),
                "legs": {key: {joint: list(point) for joint, point in value.items()} for key, value in legs.items()}},
        "weights": weights,
        "graze": graze,
        "materials": materials,
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
    print(json.dumps({key: report[key] for key in ("assetId", "normalization", "weights", "graze", "metrics")}, indent=2))
    return report


def _validate(spec, collection, surfaces, rig) -> dict:
    nodes = {obj.name for obj in collection.all_objects}
    missing = sorted(set(spec["requiredNodes"]) - nodes)
    if missing:
        raise ValueError(f"Missing catalog nodes: {missing}")
    unstable = [name for name in nodes if "." in name]
    if unstable:
        raise ValueError(f"Unstable Blender names: {unstable}")
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
    points = [vertex.co for vertex in surfaces[0].data.vertices]
    minimum = [min(point[axis] for point in points) for axis in range(3)]
    maximum = [max(point[axis] for point in points) for axis in range(3)]
    return {"lod0Triangles": counts[0], "lod1Triangles": counts[1], "lod1Ratio": ratio,
            "bounds": {"min": minimum, "max": maximum}, "bones": len(rig.data.bones)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--asset", required=True)
    parser.add_argument("--output-dir", required=True)
    arguments = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    adapt(parser.parse_args(arguments))


if __name__ == "__main__":
    main()
