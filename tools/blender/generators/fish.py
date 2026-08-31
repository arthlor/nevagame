"""Species-readable authored fish generators."""

from __future__ import annotations

import math

import bmesh
import bpy

from common.geometry import add_ico, add_tri_prism, apply_vertex_values
from common.materials import get_or_create_material


FRAME_RATE = 25.0


def _motion_node(name: str, parent, location=(0.0, 0.0, 0.0)):
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


def _author_node_action(spec: dict, clip_name: str, node, keyframes) -> None:
    clip = next((entry for entry in spec.get("animationClips", []) if entry["name"] == clip_name), None)
    if clip is None:
        return
    bpy.context.scene.render.fps = int(FRAME_RATE)
    bpy.context.scene.render.fps_base = 1.0
    action = bpy.data.actions.new(name=clip_name)
    action["neva_loop"] = clip.get("loop", False)
    if "commitMarkerSeconds" in clip:
        action["neva_commit_marker_seconds"] = clip["commitMarkerSeconds"]
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


def _smoothstep(edge0: float, edge1: float, value: float) -> float:
    amount = max(0.0, min(1.0, (value - edge0) / max(1e-6, edge1 - edge0)))
    return amount * amount * (3.0 - 2.0 * amount)


def _longitudinal_profile(species: str, position: float, tail_peduncle: float) -> float:
    """Return a deliberate nose-to-tail radius, with position in [-1, 1]."""
    if species == "trout":
        nose = 0.12 + 0.82 * _smoothstep(-1.0, -0.48, position)
        shoulder = 0.94 + 0.06 * _smoothstep(-0.48, -0.05, position)
        rear = 1.0 - (1.0 - tail_peduncle) * _smoothstep(0.04, 1.0, position)
        return min(nose, shoulder, rear)
    if species == "catfish":
        nose = 0.48 + 0.56 * _smoothstep(-1.0, -0.62, position)
        belly = 1.04 - 0.07 * max(0.0, position)
        rear = 1.0 - (1.0 - tail_peduncle) * _smoothstep(0.0, 1.0, position)
        return min(nose, belly, rear)
    if species in {"pike", "arowana"}:
        nose = 0.16 + 0.86 * _smoothstep(-1.0, -0.64, position)
        shoulder = 0.98 + 0.04 * (1.0 - abs(position + 0.10))
        rear = 1.0 - (1.0 - tail_peduncle) * _smoothstep(0.24, 1.0, position)
        return min(nose, shoulder, rear)
    if species == "sturgeon":
        nose = 0.08 + 0.96 * _smoothstep(-1.0, -0.50, position)
        shoulder = 1.06 - 0.10 * max(0.0, position)
        rear = 1.0 - (1.0 - tail_peduncle) * _smoothstep(0.10, 1.0, position)
        return min(nose, shoulder, rear)
    if species in {"swordfish", "blue_marlin"}:
        nose = 0.10 + 0.96 * _smoothstep(-1.0, -0.58, position)
        shoulder = 1.03 + 0.05 * (1.0 - abs(position + 0.22))
        rear = 1.0 - (1.0 - tail_peduncle) * _smoothstep(0.20, 1.0, position)
        return min(nose, shoulder, rear)
    nose = 0.18 + 0.86 * _smoothstep(-1.0, -0.55, position)
    shoulder = 1.04 + 0.08 * (1.0 - abs(position + 0.20))
    rear = 1.0 - (1.0 - tail_peduncle) * _smoothstep(0.18, 1.0, position)
    return min(nose, shoulder, rear)


def _add_profiled_body(species: str, params: dict, dorsal: str, belly: str, root):
    length = params["length"]
    girth = params["girth"]
    body_depth = params["bodyDepth"]
    body_segments = params["bodySegments"]
    radial_segments = params["radialSegments"]
    tail_peduncle = params["tailPeduncle"]
    vertices = []
    rings = []
    for longitudinal_index in range(body_segments + 1):
        progress = longitudinal_index / body_segments
        position = progress * 2.0 - 1.0
        radius = _longitudinal_profile(species, position, tail_peduncle)
        y = position * length * 0.5
        center_lift = {
            "trout": 0.055,
            "catfish": -0.035,
            "arowana": 0.075,
            "sturgeon": -0.02,
        }.get(species, 0.025)
        center_z = math.sin(progress * math.pi) * girth * center_lift
        ring = []
        for radial_index in range(radial_segments):
            angle = radial_index * math.tau / radial_segments
            side_factor = 0.96 + 0.04 * math.cos(angle * 2.0)
            x = math.cos(angle) * girth * radius * side_factor
            z = center_z + math.sin(angle) * girth * body_depth * radius
            ring.append(len(vertices))
            vertices.append((x, y, z))
        rings.append(tuple(ring))

    nose_index = len(vertices)
    vertices.append((0.0, -length * 0.515, -girth * 0.02))
    tail_index = len(vertices)
    vertices.append((0.0, length * 0.515, 0.0))
    faces = []
    material_indices = []
    for longitudinal_index in range(body_segments):
        current, following = rings[longitudinal_index], rings[longitudinal_index + 1]
        for radial_index in range(radial_segments):
            following_radial = (radial_index + 1) % radial_segments
            faces.append(
                (
                    current[radial_index],
                    following[radial_index],
                    following[following_radial],
                    current[following_radial],
                )
            )
            midpoint_angle = (radial_index + 0.5) * math.tau / radial_segments
            material_indices.append(1 if math.sin(midpoint_angle) < -0.08 else 0)
    for radial_index in range(radial_segments):
        following_radial = (radial_index + 1) % radial_segments
        faces.append((nose_index, rings[0][following_radial], rings[0][radial_index]))
        material_indices.append(
            1 if math.sin((radial_index + 0.5) * math.tau / radial_segments) < -0.08 else 0
        )
        faces.append((tail_index, rings[-1][radial_index], rings[-1][following_radial]))
        material_indices.append(0)

    mesh = bpy.data.meshes.new(f"{species}_body_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(get_or_create_material(dorsal))
    mesh.materials.append(get_or_create_material(belly))
    mesh.validate(clean_customdata=False)
    mesh.update(calc_edges=True)
    editable = bmesh.new()
    editable.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(editable, faces=editable.faces)
    editable.to_mesh(mesh)
    editable.free()
    for polygon, material_index in zip(mesh.polygons, material_indices, strict=True):
        polygon.material_index = material_index
        polygon.use_smooth = False
    body = bpy.data.objects.new(f"{species}_body", mesh)
    bpy.context.collection.objects.link(body)
    body.parent = root
    apply_vertex_values(body)
    return body


def stylized_fish(spec: dict, root) -> None:
    params = spec["parameters"]
    species = params["species"]
    dorsal, belly, accent = spec["palette"]
    length, girth = params["length"], params["girth"]
    body_depth = params["bodyDepth"]
    height = girth * body_depth
    is_trout = species == "trout"
    is_billfish = species in {"swordfish", "blue_marlin"}
    is_pelagic = species in {"tuna", "sailfish", "swordfish", "blue_marlin"}
    _add_profiled_body(species, params, dorsal, belly, root)

    jaw_length = {
        "trout": 0.11,
        "catfish": 0.16,
        "pike": 0.18,
        "arowana": 0.16,
        "sturgeon": 0.12,
    }.get(species, 0.14)
    add_ico(
        f"{species}_jaw",
        (0, -length * (0.455 if species == "catfish" else 0.47), -height * 0.24),
        (
            girth * (0.48 if species == "catfish" else 0.32 if is_trout else 0.40),
            length * jaw_length,
            height * 0.16,
        ),
        belly,
        root,
        subdivisions=2,
        rotation=(math.radians(-4 if is_trout else -1), 0, 0),
    )

    if is_billfish:
        bill_length = length * (0.42 if species == "swordfish" else 0.34)
        add_ico(
            f"{species}_bill",
            (0, -length * 0.515 - bill_length * 0.48, height * 0.05),
            (girth * (0.10 if species == "swordfish" else 0.13), bill_length, height * 0.075),
            accent,
            root,
            subdivisions=1,
        )

    # Fish travel along Y. Vertical fins live in the Y/Z plane and use only a
    # thin X extrusion, preserving their side-view silhouette.
    vertical_fin_rotation = (0, 0, math.pi / 2)
    inverted_vertical_fin_rotation = (math.pi, 0, math.pi / 2)
    tail_y = length * 0.54
    tail_height = height * {
        "trout": 0.82,
        "catfish": 0.78,
        "pike": 0.90,
        "arowana": 0.68,
        "sturgeon": 0.86,
        "tuna": 1.15,
        "sailfish": 1.12,
        "swordfish": 1.22,
        "blue_marlin": 1.28,
    }[species]
    tail_length = length * (0.23 if is_trout or species == "catfish" else 0.28)
    add_tri_prism(
        f"{species}_tail_upper",
        (0, tail_y, tail_height * 0.25),
        (tail_length, girth * 0.14, tail_height),
        accent,
        root,
        rotation=vertical_fin_rotation,
    )
    add_tri_prism(
        f"{species}_tail_lower",
        (0, tail_y, -tail_height * 0.25),
        (tail_length, girth * 0.14, tail_height),
        accent,
        root,
        rotation=inverted_vertical_fin_rotation,
    )

    dorsal_y = -length * (0.02 if is_trout else 0.13)
    dorsal_height = height * {
        "trout": 0.56,
        "catfish": 0.46,
        "pike": 0.58,
        "arowana": 0.42,
        "tuna": 0.86,
        "sturgeon": 0.48,
        "sailfish": 2.35,
        "swordfish": 0.78,
        "blue_marlin": 1.05,
    }[species] * params["finScale"]
    add_tri_prism(
        f"{species}_dorsal_fin",
        (0, dorsal_y, height * 0.88),
        (length * (0.44 if species == "sailfish" else 0.28 if is_trout else 0.22), girth * 0.12, dorsal_height),
        dorsal,
        root,
        rotation=vertical_fin_rotation,
    )

    pectoral_y = -length * (0.17 if is_trout else 0.22)
    pectoral_reach = girth * (
        1.34 if species in {"sailfish", "blue_marlin"}
        else 0.82 if species in {"catfish", "sturgeon"}
        else 0.62 if is_trout else 1.05
    )
    for side, x in (("left", -girth * 0.88), ("right", girth * 0.88)):
        add_tri_prism(
            f"{species}_pectoral_{side}",
            (x, pectoral_y, -height * 0.10),
            (pectoral_reach, height * 0.09, length * (0.22 if is_trout else 0.31)),
            accent,
            root,
            rotation=(-math.pi / 2, 0, 0),
        )
        eye_y = -length * (0.37 if is_trout else 0.39)
        eye_z = height * (0.30 if species == "catfish" else 0.36 if is_trout else 0.32)
        eye_x = x * (0.76 if is_trout else 0.83)
        eye_r = girth * (0.14 if is_trout else 0.10)
        eye_d = eye_r * 0.75
        add_ico(
            f"{species}_eye_{side}",
            (eye_x, eye_y, eye_z),
            (eye_r, eye_d, eye_r),
            dorsal,
            root,
            subdivisions=1,
        )
        add_ico(
            f"{species}_gill_plate_{side}",
            (x * 0.64, -length * 0.29, height * 0.015),
            (
                girth * 0.10,
                length * 0.085,
                height * (0.40 if is_trout else 0.48),
            ),
            accent,
            root,
            subdivisions=2,
        )
        add_tri_prism(
            f"{species}_pelvic_{side}",
            (x * 0.50, length * 0.05, -height * 0.72),
            (girth * 0.38, height * 0.07, length * 0.16),
            accent,
            root,
            rotation=(-math.pi / 2, 0, 0),
        )
    add_tri_prism(
        f"{species}_anal_fin",
        (0, length * 0.24, -height * 0.82),
        (length * (0.34 if species in {"arowana", "catfish"} else 0.20),
         girth * 0.11,
         height * (0.30 if is_trout else 0.42)),
        accent,
        root,
        rotation=inverted_vertical_fin_rotation,
    )

    if is_trout:
        add_tri_prism(
            "trout_adipose_fin",
            (0, length * 0.28, height * 0.76),
            (length * 0.12, girth * 0.09, height * 0.20),
            accent,
            root,
            rotation=vertical_fin_rotation,
        )
        spot_r = girth * 0.16
        spot_d = girth * 0.10
        for index in range(7):
            angle = index * 2.39996
            add_ico(
                f"trout_spot_{index:02d}",
                (
                    math.cos(angle) * girth * 0.84,
                    -length * 0.15 + index * length * 0.052,
                    height * (0.10 + 0.11 * (index % 2)),
                ),
                (spot_r, spot_d, spot_r),
                accent,
                root,
                subdivisions=1,
            )
    elif is_pelagic:
        # Pelagic fish keep a narrow caudal peduncle and paired finlets so their
        # high-speed silhouette reads even when the fish is far from the boat.
        for index in range(5):
            y = length * (0.16 + index * 0.065)
            finlet_size = (length * 0.07, girth * 0.07, height * 0.18)
            add_tri_prism(
                f"tuna_finlet_{index:02d}",
                (0, y, height * 0.84),
                finlet_size,
                accent,
                root,
                rotation=vertical_fin_rotation,
            )
            add_tri_prism(
                f"tuna_finlet_lower_{index:02d}",
                (0, y, -height * 0.84),
                finlet_size,
                accent,
                root,
                rotation=inverted_vertical_fin_rotation,
            )

    if species == "catfish":
        for side in (-1, 1):
            for index in range(2):
                add_tri_prism(
                    f"catfish_barbel_{'left' if side < 0 else 'right'}_{index}",
                    (side * girth * 0.34, -length * (0.50 + index * 0.025), -height * 0.18),
                    (length * 0.18, girth * 0.035, height * 0.035),
                    accent,
                    root,
                    rotation=(0, math.radians(side * (22 + index * 12)), math.pi / 2),
                )
    elif species == "sturgeon":
        for index in range(7):
            y = -length * 0.28 + index * length * 0.09
            add_ico(
                f"sturgeon_scute_{index:02d}",
                (0, y, height * 0.92),
                (girth * 0.12, length * 0.035, height * 0.12),
                accent,
                root,
                subdivisions=1,
            )
    elif species in {"pike", "arowana"}:
        marking_count = 5 if species == "pike" else 7
        for side in (-1, 1):
            for index in range(marking_count):
                add_ico(
                    f"{species}_mark_{'left' if side < 0 else 'right'}_{index:02d}",
                    (side * girth * 0.91,
                     -length * 0.22 + index * length * 0.07,
                     height * (0.10 if index % 2 == 0 else -0.06)),
                    (girth * 0.055, length * 0.025, height * 0.13),
                    accent,
                    root,
                    subdivisions=1,
                )

    motion_root = _motion_node(f"{spec['id']}_motion_root", root)
    _motion_node(
        f"{spec['id']}_mouth_hook",
        motion_root,
        (0.0, -length * 0.515, -height * 0.10),
    )
    tail_pivot = _motion_node(
        f"{spec['id']}_tail_pivot",
        motion_root,
        (0.0, length * 0.43, 0.0),
    )
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH" or obj.parent is not root:
            continue
        if obj.name in {f"{species}_tail_upper", f"{species}_tail_lower"}:
            _reparent_preserving_world(obj, tail_pivot)
        else:
            _reparent_preserving_world(obj, motion_root)

    _author_node_action(spec, "swim", tail_pivot, [
        (0.0, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        (0.2, (0.0, 0.0, math.radians(15)), (0.0, 0.0, 0.0)),
        (0.4, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        (0.6, (0.0, 0.0, math.radians(-15)), (0.0, 0.0, 0.0)),
        (0.8, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    ])
    _author_node_action(spec, "turn", motion_root, [
        (0.0, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        (0.24, (0.0, 0.0, math.radians(24)), (-girth * 0.08, 0.0, 0.0)),
        (0.48, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    ])
    _author_node_action(spec, "burst", tail_pivot, [
        (0.0, (0.0, 0.0, math.radians(-22)), (0.0, 0.0, 0.0)),
        (0.1, (0.0, 0.0, math.radians(22)), (0.0, 0.0, 0.0)),
        (0.2, (0.0, 0.0, math.radians(-22)), (0.0, 0.0, 0.0)),
        (0.3, (0.0, 0.0, math.radians(22)), (0.0, 0.0, 0.0)),
        (0.4, (0.0, 0.0, math.radians(-22)), (0.0, 0.0, 0.0)),
    ])
    _author_node_action(spec, "struggle", motion_root, [
        (0.0, (0.0, math.radians(-16), math.radians(-7)), (0.0, 0.0, 0.0)),
        (0.15, (0.0, math.radians(18), math.radians(8)), (0.0, 0.0, girth * 0.08)),
        (0.3, (0.0, math.radians(-18), math.radians(-8)), (0.0, 0.0, 0.0)),
        (0.45, (0.0, math.radians(16), math.radians(7)), (0.0, 0.0, girth * 0.05)),
        (0.6, (0.0, math.radians(-16), math.radians(-7)), (0.0, 0.0, 0.0)),
    ])
