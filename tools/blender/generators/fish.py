"""Species-readable authored fish generators."""

from __future__ import annotations

from common.geometry import add_limb_tube

import math

import bmesh
import bpy

from common.geometry import add_box, add_caudal_fin, add_ico, add_tri_prism, apply_vertex_values, set_surface_normals
from common.materials import get_or_create_material
from common.creature import author_creature_clip, bone, build_creature_armature, build_skinned_surface, rest_creature_pose


FRAME_RATE = 25.0

# Static payloads (fish trade packs) flatten the catch and declare no clips,
# but the shared body builder still authors its wave on a neutral timeline.
_STATIC_PAYLOAD_CLIP_SECONDS = {"swim": 0.8, "turn": 0.48, "burst": 0.4, "struggle": 0.6}

# A tail is the one silhouette cue a player reads at fishing distance, so each
# species gets the caudal form it actually has rather than a shared star.
CAUDAL_FORMS = {
    "trout": "forked",
    "catfish": "rounded",
    "pike": "forked",
    "arowana": "square",
    "sturgeon": "heterocercal",
    "tuna": "lunate",
    "sailfish": "lunate",
    "swordfish": "lunate",
    "blue_marlin": "lunate",
    "sardine": "forked",
    "sea_bream": "forked",
    "amberjack": "lunate",
}


def _motion_node(name: str, parent, location=(0.0, 0.0, 0.0)):
    node = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(node)
    node.parent = parent
    node.location = location
    return node


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
    if species == "sea_bream":
        # Deep and laterally compressed, with the steep forehead that separates a
        # bream from every torpedo-shaped fish in the catalog.
        nose = 0.30 + 0.74 * _smoothstep(-1.0, -0.72, position)
        shoulder = 1.10 - 0.16 * max(0.0, position + 0.30)
        rear = 1.0 - (1.0 - tail_peduncle) * _smoothstep(-0.10, 1.0, position)
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



def _flank_point(species, params, y, height_fraction, side, offset=0.0):
    """Seat detail on the authored polygonal head/flank, not a global girth box.

    Longitudinal ring interpolation matches the body's sampled silhouette;
    angular interpolation follows the radial polygon rather than an ellipsoid.
    """
    length, girth = params["length"], params["girth"]
    count, radial = params["bodySegments"], params["radialSegments"]
    progress = max(0.0, min(1.0, y / length + .5))
    ring = min(count - 1, int(progress * count))
    t = progress * count - ring
    p0, p1 = ring / count, (ring + 1) / count
    radius = (1-t)*_longitudinal_profile(species, 2*p0-1, params["tailPeduncle"]) + t*_longitudinal_profile(species, 2*p1-1, params["tailPeduncle"])
    lift = {"trout": .055, "catfish": -.035, "arowana": .075, "sturgeon": -.02}.get(species, .025)
    center_z = ((1-t)*math.sin(p0*math.pi) + t*math.sin(p1*math.pi))*girth*lift
    h = max(-.92, min(.92, height_fraction))
    angle = math.asin(h)
    step = math.tau / radial
    a = math.floor(angle / step) * step
    b = a + step
    v = (h-math.sin(a)) / (math.sin(b)-math.sin(a))
    x0 = math.cos(a)*(.96+.04*math.cos(2*a))
    x1 = math.cos(b)*(.96+.04*math.cos(2*b))
    return (side * (girth*radius*((1-v)*x0+v*x1)+offset),
            y, center_z + h*girth*params["bodyDepth"]*radius)


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
    set_surface_normals(body, "rounded")
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
    is_pelagic = species in {"tuna", "amberjack", "sailfish", "swordfish", "blue_marlin"}
    _add_profiled_body(species, params, dorsal, belly, root)

    jaw_length = {
        "trout": 0.11,
        "catfish": 0.16,
        "pike": 0.18,
        "arowana": 0.16,
        "sturgeon": 0.12,
    }.get(species, 0.14)
    # The nose vertex sits at -length * 0.515. Seat the jaw so its front lands on
    # that point instead of overshooting it, which is what turned the snout into
    # a pelican pouch on every species.
    add_ico(
        f"{species}_jaw",
        (0, -length * (0.515 - jaw_length), -height * 0.30),
        (
            girth * (0.46 if species == "catfish" else 0.30 if is_trout else 0.38),
            length * jaw_length,
            height * 0.13,
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
    tail_y = length * 0.505
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
        "sardine": 0.82,
        "sea_bream": 0.92,
        "amberjack": 1.02,
    }[species]
    tail_span = length * (0.21 if is_trout or species == "catfish" else 0.27)
    add_caudal_fin(
        f"{species}_tail",
        (0, tail_y, 0.0),
        tail_span,
        tail_height * 2.0,
        CAUDAL_FORMS[species],
        dorsal,
        root,
        thickness=girth * 0.11,
        rays=6,
    )

    dorsal_y = length * {"trout": -0.02, "pike": 0.24, "arowana": 0.08}.get(species, -0.13)
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
        "sardine": 0.52,
        "sea_bream": 0.74,
        "amberjack": 0.78,
    }[species] * params["finScale"]
    if species == "sailfish":
        # The sail runs most of the back and peaks a third of the way along it;
        # one short triangle over the shoulder reads as an ordinary dorsal.
        segments = 9
        sail_length = length * 0.62
        for index in range(segments):
            progress = index / (segments - 1)
            panel = dorsal_height * (0.34 + 0.66 * math.sin(math.pi * (0.20 + 0.68 * progress)))
            add_box(
                f"sailfish_sail_{index:02d}",
                (
                    0,
                    -length * 0.30 + progress * sail_length,
                    height * 0.86 + panel * 0.5,
                ),
                (girth * 0.11, sail_length / (segments - 1) * 1.06, panel),
                dorsal,
                root,
                bevel=0.0,
            )
    else:
        add_tri_prism(
            f"{species}_dorsal_fin",
            (0, dorsal_y, height * 0.88),
            (length * (0.28 if is_trout else 0.22), girth * 0.12, dorsal_height),
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
            dorsal,
            root,
            rotation=(-math.pi / 2, 0, 0),
        )
        sign = -1 if x < 0 else 1
        eye_y = -length * (0.38 if is_trout else 0.40)
        eye_r = girth * (0.17 if is_trout else 0.13)
        eye_d = eye_r * .62
        eye_x, _, eye_z = _flank_point(species, params, eye_y, .42, sign, eye_d*.28)
        add_ico(
            f"{species}_eye_{side}", (eye_x, eye_y, eye_z),
            (eye_d, eye_r, eye_r), dorsal, root, subdivisions=1,
        )
        add_ico(
            f"{species}_eye_glint_{side}",
            (eye_x + sign*eye_d*.86, eye_y-eye_r*.24, eye_z+eye_r*.24),
            (eye_d*.22, eye_r*.28, eye_r*.28), belly, root, subdivisions=1,
        )
        # One closed gill seam follows the body; its existing name retains head binding.
        gill_points = [
            _flank_point(species, params, -length*(.29-.018*math.cos(t*math.pi)),
                         -.48+.99*t, sign, girth*.006)
            for t in (0, .2, .4, .6, .8, 1)
        ]
        add_limb_tube(f"{species}_gill_plate_{side}", gill_points,
                      [girth*.017]*len(gill_points), accent, root, sides=5)
        add_tri_prism(
            f"{species}_pelvic_{side}",
            (x * 0.50, length * 0.05, -height * 0.72),
            (girth * 0.38, height * 0.07, length * 0.16),
            dorsal,
            root,
            rotation=(-math.pi / 2, 0, 0),
        )
    add_tri_prism(
        f"{species}_anal_fin",
        (0, length * 0.24, -height * 0.82),
        (length * (0.34 if species in {"arowana", "catfish"} else 0.20),
         girth * 0.11,
         height * (0.30 if is_trout else 0.42)),
        dorsal,
        root,
        rotation=inverted_vertical_fin_rotation,
    )

    if is_trout:
        add_tri_prism(
            "trout_adipose_fin",
            (0, length * 0.28, height * 0.76),
            (length * 0.12, girth * 0.09, height * 0.20),
            dorsal,
            root,
            rotation=vertical_fin_rotation,
        )
        # cos(angle) * girth swept the spots through the whole body width, so most
        # of them ended up inside the fish. Project them onto both flanks instead.
        spot_r = girth * 0.075
        spot_d = girth * 0.030
        for side_sign in (-1, 1):
            for index in range(9):
                add_ico(
                    f"trout_spot_{'l' if side_sign < 0 else 'r'}_{index:02d}",
                    _flank_point(species, params,
                                 -length*.28 + index*length*.068,
                                 .08+.20*(index%3)/2, side_sign, spot_d*.20),
                    (spot_d, spot_r, spot_r),
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
                f"{species}_finlet_{index:02d}",
                (0, y, height * 0.84),
                finlet_size,
                accent,
                root,
                rotation=vertical_fin_rotation,
            )
            add_tri_prism(
                f"{species}_finlet_lower_{index:02d}",
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
                    (side * girth * 0.99,
                     -length * 0.22 + index * length * 0.07,
                     height * (0.10 if index % 2 == 0 else -0.06)),
                    (girth * 0.055, length * 0.025, height * 0.13),
                    accent,
                    root,
                    subdivisions=1,
                )

    parts = [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and obj.parent is root]
    motion_root = _motion_node(f"{spec['id']}_motion_root", root)
    _motion_node(
        f"{spec['id']}_mouth_hook",
        motion_root,
        (0.0, -length * 0.515, -height * 0.10),
    )
    # Inert since the body bends on bones; kept because the catalog requires it
    # and `WorldScene` still resolves it by name.
    _motion_node(
        f"{spec['id']}_tail_pivot",
        motion_root,
        (0.0, length * 0.43, 0.0),
    )

    # A fish swims with its body, not a hinged tail. The chain runs head to tail
    # so a bend accumulates rearward, and the head bone is never keyed: that
    # keeps the mouth exactly on `_mouth_hook`, which the fishing line follows.
    bones = [
        bone("spine_0", (0.0, -length * 0.52, 0.0), (0.0, -length * 0.16, 0.0)),
        bone("spine_1", (0.0, -length * 0.16, 0.0), (0.0, length * 0.06, 0.0), "spine_0"),
        bone("spine_2", (0.0, length * 0.06, 0.0), (0.0, length * 0.26, 0.0), "spine_1"),
        bone("spine_3", (0.0, length * 0.26, 0.0), (0.0, length * 0.44, 0.0), "spine_2"),
        bone("caudal", (0.0, length * 0.44, 0.0), (0.0, length * 0.70, 0.0), "spine_3"),
    ]
    rig = build_creature_armature(f"{spec['id']}_rig", bones, motion_root)
    spine = ["spine_0", "spine_1", "spine_2", "spine_3", "caudal"]
    head_parts = ("_jaw", "_bill", "_eye_", "_gill_plate_", "_pectoral_", "_barbel_")

    def drivers(name: str) -> list[str]:
        if name == f"{species}_body":
            return spine
        if name == f"{species}_tail":
            return ["caudal", "spine_3"]
        if any(marker in name for marker in head_parts):
            return ["spine_0"]
        # Fins and markings ride whatever stretch of spine they sit on.
        return spine

    build_skinned_surface(
        f"{spec['id']}_surface", rig, bones, [(part, drivers(part.name)) for part in parts]
    )
    rest_creature_pose(rig)

    def durations(name: str) -> float:
        clips = spec.get("animationClips") or []
        return next((clip["durationSeconds"] for clip in clips if clip["name"] == name),
                    _STATIC_PAYLOAD_CLIP_SECONDS.get(name, 0.8))

    def wave(name: str, amplitudes, cycles: float = 1.0, lag: float = 0.12, step: int = 2):
        """A travelling body wave: each bone lags the one ahead of it."""
        duration = durations(name)
        frames = max(1, math.floor(duration * FRAME_RATE + 0.5))
        samples = list(range(0, frames, step)) + [frames]
        tracks = []
        for index, (bone_name, amplitude) in enumerate(amplitudes):
            keys = []
            for frame in samples:
                seconds = duration if frame == frames else frame / FRAME_RATE
                phase = math.tau * (cycles * seconds / duration - lag * index)
                keys.append((seconds, (0.0, 0.0, math.radians(amplitude) * math.sin(phase)), (0.0, 0.0, 0.0)))
            tracks.append((rig, bone_name, keys))
        return tuple(tracks)

    author_creature_clip(
        spec, "swim", frame_rate=FRAME_RATE,
        bone_tracks=wave("swim", (("spine_1", 3), ("spine_2", 5), ("spine_3", 7), ("caudal", 10))),
    )
    author_creature_clip(
        spec, "burst", frame_rate=FRAME_RATE,
        bone_tracks=wave("burst", (("spine_1", 5), ("spine_2", 8), ("spine_3", 11), ("caudal", 15)), cycles=2.0, step=1),
    )
    # A turn keeps its whole-body yaw on the motion root and adds the C-bend a
    # fish actually makes: the rear curls back against the yaw, so head and tail
    # both point into the turn instead of the body simply pivoting harder.
    turn_duration = durations("turn")
    author_creature_clip(
        spec, "turn", frame_rate=FRAME_RATE,
        object_tracks=((motion_root, [
            (0.0, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
            (turn_duration * 0.5, (0.0, 0.0, math.radians(24)), (-girth * 0.08, 0.0, 0.0)),
            (turn_duration, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        ]),),
        bone_tracks=tuple(
            (rig, bone_name, [
                (0.0, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
                (turn_duration * 0.5, (0.0, 0.0, math.radians(amount)), (0.0, 0.0, 0.0)),
                (turn_duration, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
            ])
            for bone_name, amount in (("spine_1", -4), ("spine_2", -7), ("spine_3", -9), ("caudal", -6))
        ),
    )
    # A hooked fish thrashes: the roll and lift stay on the motion root, where the
    # line endpoint follows them, and the body whips behind the head.
    struggle_duration = durations("struggle")
    author_creature_clip(
        spec, "struggle", frame_rate=FRAME_RATE,
        # Phase-shifted a quarter cycle from the old rigid clip so frame 0 is
        # neutral; the amplitudes, two-beat period and lift are unchanged.
        object_tracks=((motion_root, [
            (0.0, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
            (struggle_duration * 0.125, (0.0, math.radians(18), math.radians(8)), (0.0, 0.0, girth * 0.08)),
            (struggle_duration * 0.25, (0.0, 0.0, 0.0), (0.0, 0.0, girth * 0.03)),
            (struggle_duration * 0.375, (0.0, math.radians(-18), math.radians(-8)), (0.0, 0.0, 0.0)),
            (struggle_duration * 0.5, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
            (struggle_duration * 0.625, (0.0, math.radians(16), math.radians(7)), (0.0, 0.0, girth * 0.05)),
            (struggle_duration * 0.75, (0.0, 0.0, 0.0), (0.0, 0.0, girth * 0.02)),
            (struggle_duration * 0.875, (0.0, math.radians(-16), math.radians(-7)), (0.0, 0.0, 0.0)),
            (struggle_duration, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        ]),),
        bone_tracks=wave("struggle", (("spine_1", 6), ("spine_2", 10), ("spine_3", 12), ("caudal", 14)), cycles=2.0, step=1),
    )
