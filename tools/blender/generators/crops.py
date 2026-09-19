"""Distinct deterministic starter-crop stage generators for the farming gold slice."""

from __future__ import annotations

from common.design_primitives import add_folded_leaf as _authored_leaf

import math

import bpy
from mathutils import Vector

from common.geometry import (
    add_beam,
    add_box,
    add_lofted_form,
    add_limb_tube,
    set_surface_normals,
    add_tapered_beam,
    apply_vertex_values,
    seeded_rng,
)
from common.materials import get_or_create_material


GOLDEN_ANGLE = math.pi * (3.0 - math.sqrt(5.0))


def _add_custom_mesh(
    name: str,
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    token: str,
    root,
    *, normal_mode="planar",
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(get_or_create_material(token))
    obj.parent = root
    set_surface_normals(obj, normal_mode)
    apply_vertex_values(obj)
    return obj


def _add_octahedron(
    name: str,
    center: tuple[float, float, float],
    scale: tuple[float, float, float],
    token: str,
    root,
    *,
    rotation: float = 0.0,
) -> None:
    cx, cy, cz = center
    sx, sy, sz = scale
    cos_r, sin_r = math.cos(rotation), math.sin(rotation)

    def rotate(x: float, y: float) -> tuple[float, float]:
        return cx + x * cos_r - y * sin_r, cy + x * sin_r + y * cos_r

    px, py = rotate(sx, 0.0)
    nx, ny = rotate(-sx, 0.0)
    yx, yy = rotate(0.0, sy)
    ynx, yny = rotate(0.0, -sy)
    vertices = [
        (px, py, cz),
        (nx, ny, cz),
        (yx, yy, cz),
        (ynx, yny, cz),
        (cx, cy, cz + sz),
        (cx, cy, cz - sz),
    ]
    faces = [
        (4, 0, 2), (4, 2, 1), (4, 1, 3), (4, 3, 0),
        (5, 2, 0), (5, 1, 2), (5, 3, 1), (5, 0, 3),
    ]
    _add_custom_mesh(name, vertices, faces, token, root)


def _add_folded_leaf(name, base, length, width, facing_angle, token, root, *,
                     pitch=0.42, droop=0.0, cup=0.10):
    """Curved five-section blade, with a petiole, shoulder, midrib and turned tip."""
    _authored_leaf(name, base, length, width, facing_angle, token, root,
                   pitch=pitch, droop=droop, cup=cup)


def _add_culm(
    name: str,
    base: tuple[float, float, float],
    tip: tuple[float, float, float],
    radius_start: float,
    radius_end: float,
    token: str,
    root,
    *,
    knee: float = 0.035,
) -> tuple[tuple[float, float, float], tuple[float, float, float]]:
    """Two-joint tapered 5-gon stalk with a slight authored knee."""
    base_vec = Vector(base)
    tip_vec = Vector(tip)
    direction = tip_vec - base_vec
    mid = base_vec.lerp(tip_vec, 0.52)
    horizontal = Vector((direction.x, direction.y, 0.0))
    if horizontal.length > 1e-5:
        side = Vector((-horizontal.y, horizontal.x, 0.0)).normalized()
        mid = mid + side * (direction.length * knee)
    middle = tuple(mid)
    add_limb_tube(name, [base, middle, tip], [radius_start, (radius_start + radius_end) * .52, radius_end], token, root, sides=5)
    return middle, tip


def _add_wheat_head(name, base, tip, head_token, root, *, radius, kernel_count, awn_count, refined=False):
    """Paired, tapered grains overlap into a dense ear without bead-like blocks."""
    origin, end = Vector(base), Vector(tip)
    direction = end-origin
    axis = direction.normalized()
    reference = Vector((1,0,0)) if abs(axis.z)>.8 else Vector((0,0,1))
    side = axis.cross(reference).normalized()
    depth = axis.cross(side).normalized()
    vertices, faces, tips = [], [], []
    rows = math.ceil(kernel_count/2)
    for i in range(kernel_count):
        row, sign = i//2, (-1 if i%2==0 else 1)
        t=(row+.45)/(rows+.4)
        taper=1-.42*t
        center=origin+direction*t+side*sign*radius*.40*taper
        # Keep the mature grain mostly aligned to the rachis.  The former wide
        # diagonal axis and square section made every seed read as a separate
        # diamond at 3–8 m, turning the whole ear into a stack of angular beads.
        grain_axis=(axis*.965+side*sign*.26).normalized() if refined else (axis*.88+side*sign*.46).normalized()
        grain_side=depth.cross(grain_axis).normalized()
        half_length=direction.length/rows*(.94 if refined else .80)
        tip_point=center+grain_axis*half_length
        tips.append(tip_point)
        start=len(vertices)
        vertices.append(tuple(center-grain_axis*half_length*(.72 if refined else .82)))
        # Five gentle mature faces keep the low-poly language, while the narrow
        # shoulders and longer body resolve as dense grain rather than cubes.
        # Senescent heads retain their established lighter construction.
        kernel_sides=5 if refined else 4
        rings=((-.30, .74), (.28, .62)) if refined else ((-.26, .92), (.34, .70))
        angle_offset=math.pi/2 if refined else math.pi/4
        side_scale=.52 if refined else .66
        depth_scale=.54 if refined else .68
        for along, breadth in rings:
            ring_center=center+grain_axis*half_length*along
            for k in range(kernel_sides):
                theta=k*math.tau/kernel_sides+angle_offset
                vertices.append(tuple(ring_center
                    +grain_side*math.cos(theta)*radius*side_scale*taper*breadth
                    +depth*math.sin(theta)*radius*depth_scale*taper*breadth))
        vertices.append(tuple(tip_point))
        for k in range(kernel_sides):
            nxt=(k+1)%kernel_sides
            faces.extend(((start,start+1+nxt,start+1+k),
                (start+1+k,start+1+nxt,start+1+kernel_sides+nxt,start+1+kernel_sides+k),
                (start+1+kernel_sides*2,start+1+kernel_sides+k,start+1+kernel_sides+nxt)))
    # Grain needs a soft, plump read at the gameplay camera.  Keeping every
    # four-sided kernel planar turns a mature head into alternating dark/light
    # vertical rails once the clustered instances overlap.  Its silhouette is
    # still deliberately low-sided; interpolated normals only remove that
    # accidental fence-like banding across the golden head.
    _add_custom_mesh(name+"_grain",vertices,faces,head_token,root,normal_mode="rounded" if refined else "planar")
    add_tapered_beam(name+"_rachis",base,tip,radius*.12,radius*.035,head_token,root,vertices=4)
    for i in range(awn_count):
        anchor=tips[min(len(tips)-1, i*max(1,len(tips)//max(1,awn_count)))]
        end=anchor+axis*direction.length*.38+side*(-1 if i%2==0 else 1)*radius*.45
        add_tapered_beam(f"{name}_awn_{i}",tuple(anchor),tuple(end),.0028,.0009,head_token,root,vertices=3)


def _add_compound_leaf(
    prefix: str,
    origin: tuple[float, float, float],
    facing_angle: float,
    length: float,
    token: str,
    stem_token: str,
    root,
    *,
    leaflet_count: int = 3,
    droop: float = 0.0,
) -> None:
    """Tomato leaflet chain along a short petiole."""
    pitch = 0.38 - droop * 0.22
    horiz = length * math.cos(pitch)
    tip = (
        origin[0] + math.cos(facing_angle) * horiz,
        origin[1] + math.sin(facing_angle) * horiz,
        origin[2] + length * math.sin(pitch) * (1.0 - droop * 0.45),
    )
    add_tapered_beam(
        f"{prefix}_petiole",
        origin,
        tip,
        max(0.007, length * 0.028),
        max(0.004, length * 0.016),
        stem_token,
        root,
        vertices=4,
    )
    for leaflet_index in range(leaflet_count):
        t = 0.34 + leaflet_index * (0.58 / max(1, leaflet_count - 1))
        side = 0.0 if leaflet_index == leaflet_count - 1 else (-1.0 if leaflet_index % 2 == 0 else 1.0)
        attach = (
            origin[0] * (1.0 - t) + tip[0] * t,
            origin[1] * (1.0 - t) + tip[1] * t,
            origin[2] * (1.0 - t) + tip[2] * t,
        )
        leaflet_angle = facing_angle + side * 0.72
        leaflet_length = length * (0.66 if side == 0.0 else 0.55)
        _add_folded_leaf(
            f"{prefix}_leaflet_{leaflet_index:02d}",
            attach,
            leaflet_length,
            leaflet_length * 0.60,
            leaflet_angle,
            token,
            root,
            pitch=0.40,
            droop=droop,
            cup=0.14,
        )


def _add_tomato_fruit(
    name: str,
    center: tuple[float, float, float],
    radius: float,
    fruit_token: str,
    calyx_token: str,
    root,
    *,
    rotation: float = 0.0,
    flatten: float = 0.84,
) -> None:
    """Rounded shoulders and a closed leafy calyx readable from the game camera."""
    cx, cy, cz = center
    _add_crop_volume(
        f"{name}_body", center, (radius, radius, radius * flatten),
        fruit_token, root,
    )
    # A tiny closed triangular sepal needs four faces; reserve the crop budget
    # for fruit shoulders and the main foliage visible from the game camera.
    for sepal in range(5):
        angle = rotation + sepal * math.tau / 5
        forward = Vector((math.cos(angle), math.sin(angle), 0))
        side = Vector((-forward.y, forward.x, 0))
        base = Vector((cx, cy, cz + radius * flatten * .90))
        vertices = [tuple(base - side * radius * .08),
                    tuple(base + side * radius * .08),
                    tuple(base + forward * radius * .48 - Vector((0, 0, radius * .02))),
                    tuple(base + forward * radius * .18 + Vector((0, 0, radius * .05)))]
        _add_custom_mesh(f"{name}_calyx_{sepal}", vertices,
                         [(0, 1, 2), (0, 3, 1), (1, 3, 2), (2, 3, 0)], calyx_token, root)



def _add_star_flower(
    name: str,
    center: tuple[float, float, float],
    radius: float,
    petal_token: str,
    center_token: str,
    root,
    *,
    petals: int = 5,
    rotation: float = 0.0,
) -> None:
    cx, cy, cz = center
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int]] = []
    lift = radius * 0.045
    for petal in range(petals):
        angle = rotation + petal * math.tau / petals
        direction = (math.cos(angle), math.sin(angle))
        side = (-direction[1], direction[0])
        outline = (
            (cx + direction[0] * radius * 0.14, cy + direction[1] * radius * 0.14, cz),
            (
                cx + direction[0] * radius * 0.52 + side[0] * radius * 0.22,
                cy + direction[1] * radius * 0.52 + side[1] * radius * 0.22,
                cz + radius * 0.04,
            ),
            (cx + direction[0] * radius, cy + direction[1] * radius, cz + radius * 0.02),
            (
                cx + direction[0] * radius * 0.52 - side[0] * radius * 0.22,
                cy + direction[1] * radius * 0.52 - side[1] * radius * 0.22,
                cz + radius * 0.04,
            ),
        )
        # Two coplanar copies in opposite windings z-fight and still vanish edge
        # on. A petal with real thickness survives backface culling from below.
        start = len(vertices)
        vertices.extend((x, y, z + lift) for x, y, z in outline)
        vertices.extend((x, y, z - lift) for x, y, z in outline)
        faces.extend(
            (
                (start, start + 1, start + 2),
                (start, start + 2, start + 3),
                (start + 4, start + 6, start + 5),
                (start + 4, start + 7, start + 6),
                (start, start + 4, start + 5, start + 1),
                (start + 1, start + 5, start + 6, start + 2),
                (start + 2, start + 6, start + 7, start + 3),
                (start + 3, start + 7, start + 4, start),
            )
        )

    _add_custom_mesh(f"{name}_petals", vertices, faces, petal_token, root)
    _add_octahedron(
        f"{name}_center",
        (cx, cy, cz + radius * 0.06),
        (radius * 0.22, radius * 0.22, radius * 0.16),
        center_token,
        root,
    )


def _add_tomato_fruit_cluster(
    prefix: str,
    center: tuple[float, float, float],
    fruit_token: str,
    accent_token: str,
    stem_token: str,
    root,
    *,
    fruit_count: int,
    radius: float,
    droop: float = 0.0,
) -> None:
    cluster_top = (center[0], center[1], center[2] + radius * 0.78)
    add_tapered_beam(
        f"{prefix}_peduncle",
        cluster_top,
        center,
        max(0.010, radius * 0.10),
        max(0.006, radius * 0.06),
        stem_token,
        root,
        vertices=5,
    )
    for index in range(fruit_count):
        angle = index * GOLDEN_ANGLE + 0.38
        spread = radius * (0.44 + 0.12 * (index % 2))
        fruit_center = (
            center[0] + math.cos(angle) * spread,
            center[1] + math.sin(angle) * spread,
            center[2] - droop * radius * (0.28 + 0.12 * index) - (index % 2) * radius * 0.16,
        )
        token = accent_token if index % 2 == 1 else fruit_token
        _add_tomato_fruit(
            f"{prefix}_fruit_{index:02d}",
            fruit_center,
            radius * 0.48,
            token,
            stem_token,
            root,
            rotation=angle,
            flatten=0.80 if droop < 0.2 else 0.70,
        )

def _add_garden_stake(
    name: str,
    base: tuple[float, float, float],
    height: float,
    width: float,
    token: str,
    root,
) -> None:
    """Faceted wooden garden stake with an angled chisel top."""
    bx, by, bz = base
    top_z = bz + height
    hw = width * 0.5
    thw = width * 0.38
    vertices = [
        (bx - hw, by - hw, bz),
        (bx + hw, by - hw, bz),
        (bx + hw, by + hw, bz),
        (bx - hw, by + hw, bz),
        (bx - thw, by - thw, top_z - width * 0.6),
        (bx + thw, by - thw, top_z - width * 0.6),
        (bx + thw, by + thw, top_z - width * 0.6),
        (bx - thw, by + thw, top_z - width * 0.6),
        (bx, by, top_z),
    ]
    faces = [
        (0, 1, 5, 4),
        (1, 2, 6, 5),
        (2, 3, 7, 6),
        (3, 0, 4, 7),
        (4, 5, 8),
        (5, 6, 8),
        (6, 7, 8),
        (7, 4, 8),
        (3, 2, 1, 0),
    ]
    _add_custom_mesh(name, vertices, faces, token, root)


def _add_twine_tie(
    name: str,
    center: tuple[float, float, float],
    radius: float,
    height: float,
    token: str,
    root,
) -> None:
    """Faceted cord or twine collar securing a vine to its stake."""
    cx, cy, cz = center
    add_tapered_beam(
        name,
        (cx, cy, cz),
        (cx, cy, cz + height),
        radius,
        radius * 0.94,
        token,
        root,
        vertices=6,
    )


def _add_carrot_frond(prefix, base, angle, length, pitch, leaf_token, stem_token, root, *, pinnae_pairs=3, droop=.12):
    origin=Vector(base); forward=Vector((math.cos(angle),math.sin(angle),0))
    shoulder=origin+forward*length*.24+Vector((0,0,length*math.sin(pitch)*.74))
    tip=origin+forward*length*(math.cos(pitch)+droop*.34)+Vector((0,0,length*(math.sin(pitch)-droop*.70)))
    tip.z=max(.035,tip.z)
    add_limb_tube(prefix+"_rachis",[tuple(origin),tuple(shoulder),tuple(tip)],[.006,.004,.002],stem_token,root,sides=4)
    for pair in range(pinnae_pairs):
        t=.34+.57*pair/max(1,pinnae_pairs-1)
        node=origin.lerp(shoulder,t/.72) if t<.72 else shoulder.lerp(tip,(t-.72)/.28)
        for side in (-1,1):
            _add_folded_leaf(f"{prefix}_p_{pair}_{side}",tuple(node),length*(.34-.045*pair),length*.12,
                angle+side*.8,leaf_token,root,pitch=.6,droop=droop*.6,cup=.13)
    _add_folded_leaf(prefix+"_term",tuple(tip),length*.18,length*.047,angle,leaf_token,root,pitch=.45,droop=droop)








def wheat_crop(spec, root):
    _cereal_crop(spec,root,barley=False)


def _add_barley_head(name, base, tip, head_token, root, *, radius, kernel_count, awn_count, refined=False):
    _add_wheat_head(name,base,tip,head_token,root,radius=radius,
                    kernel_count=kernel_count,awn_count=awn_count,refined=refined)


def barley_crop(spec, root):
    _cereal_crop(spec,root,barley=True)


def _add_corn_ear(
    name: str,
    stem_pos: tuple[float, float, float],
    facing_angle: float,
    ear_length: float,
    husk_token: str,
    kernel_token: str,
    silk_token: str,
    root,
    *,
    droop: float = 0.0,
    show_kernels: bool = True,
) -> None:
    """An ear of corn nestled against the stalk at a leaf axil."""
    pitch = 0.55 + droop * 0.65
    along_xy = (math.cos(facing_angle), math.sin(facing_angle))
    base = Vector(stem_pos)
    tip = (
        base.x + along_xy[0] * ear_length * math.cos(pitch),
        base.y + along_xy[1] * ear_length * math.cos(pitch),
        base.z + ear_length * (math.sin(pitch) if droop < 0.4 else -math.sin(pitch) * 0.4),
    )
    ear_axis = (Vector(tip) - base).normalized()
    ear_radius = ear_length * 0.22

    add_tapered_beam(
        f"{name}_husk",
        stem_pos,
        tip,
        ear_radius * 0.55,
        ear_radius * 0.90,
        husk_token,
        root,
        vertices=6,
    )

    if show_kernels:
        cob_base = Vector(tip) - ear_axis * (ear_length * 0.30)
        cob_tip = Vector(tip) + ear_axis * (ear_length * 0.18)
        add_tapered_beam(
            f"{name}_cob",
            tuple(cob_base),
            tuple(cob_tip),
            ear_radius * 0.78,
            ear_radius * 0.45,
            kernel_token,
            root,
            vertices=6,
        )

        silk_tip = cob_tip + ear_axis * (ear_length * 0.22) + Vector((0.0, 0.0, -ear_length * 0.14))
        add_tapered_beam(
            f"{name}_silk",
            tuple(cob_tip),
            tuple(silk_tip),
            ear_radius * 0.42,
            ear_radius * 0.12,
            silk_token,
            root,
            vertices=4,
        )


def _add_corn_tassel(
    name: str,
    top_pos: tuple[float, float, float],
    height: float,
    tassel_token: str,
    root,
    *,
    droop: float = 0.0,
) -> None:
    """Spreading pollen tassel at the summit of the corn stalk."""
    top = Vector(top_pos)
    central_tip = top + Vector((0.0, 0.0, height * (1.0 - droop * 0.2)))
    add_tapered_beam(f"{name}_central", tuple(top), tuple(central_tip), 0.014, 0.004, tassel_token, root, vertices=4)

    for i in range(5):
        angle = i * (math.tau / 5) + 0.2
        radial = height * (0.35 + 0.15 * (i % 2))
        branch_tip = (
            top.x + math.cos(angle) * radial,
            top.y + math.sin(angle) * radial,
            top.z + height * (0.65 - droop * 0.25),
        )
        add_tapered_beam(
            f"{name}_branch_{i}",
            tuple(top + Vector((0, 0, height * 0.15))),
            branch_tip,
            0.009,
            0.003,
            tassel_token,
            root,
            vertices=3,
        )


def corn_crop(spec: dict, root) -> None:
    """Towering sweet corn with jointed stalks, broad ribbon leaves, pollen tassels, and silked ears."""
    rng = seeded_rng(spec["seed"])
    stage = spec["parameters"]["stage"]
    tokens = spec["palette"]
    leaf_token = tokens[0]
    stalk_token = tokens[1] if len(tokens) > 1 else leaf_token
    ear_token = tokens[2] if len(tokens) > 2 else stalk_token
    tassel_token = tokens[3] if len(tokens) > 3 else ear_token

    if stage == "seeded":
        _reference_seeds(spec,root,token=tokens[0],count=4,tuber=False)
        return

    stalk_count = spec["parameters"].get("stalks", 3)
    stage_height = {
        "sprout": 0.38,
        "growing": 1.35,
        "mature": 2.10,
        "overripe": 1.85,
        "withered": 1.10,
    }[stage]

    for s_idx in range(stalk_count):
        s_angle = s_idx * (math.tau / max(1, stalk_count)) + 0.28
        s_rad = spec["parameters"]["spread"]
        base = (math.cos(s_angle) * s_rad, math.sin(s_angle) * s_rad, 0.016)
        s_height = spec["parameters"]["height"] * rng.uniform(0.92, 1.02)

        if stage == "overripe":
            lean_mag = 0.15 + 0.05 * (s_idx % 2)
        elif stage == "withered":
            lean_mag = 0.32 + 0.08 * (s_idx % 2)
        else:
            lean_mag = 0.05

        rad_x, rad_y = math.cos(s_angle), math.sin(s_angle)
        top = (base[0] + rad_x * lean_mag, base[1] + rad_y * lean_mag, base[2] + s_height)

        base_r = 0.016 if stage == "sprout" else 0.038 if stage in ("mature", "overripe") else 0.028
        if stage == "withered":
            base_r *= 0.85
        tip_r = base_r * 0.45

        _add_culm(
            f"corn_stalk_{s_idx:02d}",
            base,
            top,
            base_r,
            tip_r,
            stalk_token,
            root,
            knee=0.08 if stage == "withered" else 0.025,
        )

        leaf_count = 3 if stage == "sprout" else 9 if stage == "mature" else 8 if stage == "overripe" else 6
        for l_idx in range(leaf_count):
            t = (l_idx + 1) / (leaf_count + 1.2)
            node_pos = (
                base[0] + (top[0] - base[0]) * t,
                base[1] + (top[1] - base[1]) * t,
                base[2] + (top[2] - base[2]) * t,
            )
            l_angle = s_angle + l_idx * GOLDEN_ANGLE
            l_len = spec["parameters"]["leafLength"] * (1.0 - .22 * abs(t-.5))
            l_w = spec["parameters"]["leafWidth"]
            droop_val = 0.08 if stage == "sprout" else 0.22 if stage in ("growing", "mature") else 0.48 if stage == "overripe" else 0.75
            _add_folded_leaf(
                f"corn_leaf_{s_idx:02d}_{l_idx:02d}",
                node_pos,
                l_len,
                l_w,
                l_angle,
                leaf_token,
                root,
                pitch=0.65,
                droop=droop_val,
                cup=0.18,
            )

        if stage == "sprout":
            continue

        if stage in ("growing", "mature", "overripe"):
            tassel_h = 0.28 if stage == "mature" else 0.22 if stage == "overripe" else 0.16
            _add_corn_tassel(
                f"corn_tassel_{s_idx:02d}",
                top,
                tassel_h,
                tassel_token,
                root,
                droop=0.04 if stage == "mature" else 0.28 if stage == "overripe" else 0.0,
            )

        if stage in ("growing", "mature", "overripe"):
            ear_count = 1 if stage == "growing" else 2
            for e_idx in range(ear_count):
                ear_t = 0.42 + e_idx * 0.18
                ear_node = (
                    base[0] + (top[0] - base[0]) * ear_t,
                    base[1] + (top[1] - base[1]) * ear_t,
                    base[2] + (top[2] - base[2]) * ear_t,
                )
                ear_facing = s_angle + 0.6 + e_idx * 2.2
                ear_len = 0.30 if stage == "mature" else 0.28 if stage == "overripe" else 0.14
                _add_corn_ear(
                    f"corn_ear_{s_idx:02d}_{e_idx}",
                    ear_node,
                    ear_facing,
                    ear_len,
                    leaf_token if stage == "growing" else stalk_token if stage == "overripe" else leaf_token,
                    ear_token,
                    tassel_token,
                    root,
                    droop=0.05 if stage == "growing" else 0.18 if stage == "mature" else 0.55,
                    show_kernels=stage in ("mature", "overripe"),
                )


def _add_flax_flower(name, center, petal_token, center_token, root, *, radius=.045, facing_angle=0):
    _add_star_flower(name,center,radius,petal_token,center_token,root,
                     petals=5,rotation=facing_angle)


def flax_crop(spec, root):
    p=spec["parameters"]; stage=p["stage"]; tokens=spec["palette"]
    if stage=="seeded":
        _reference_seeds(spec,root,token=tokens[2],count=5)
        return
    rng=seeded_rng(spec["seed"]); height=p["height"]; count=p["stems"]
    dry=stage in ("overripe","withered")
    for i in range(count):
        a=i*GOLDEN_ANGLE+.25; r=p["spread"]*math.sqrt((i+.5)/count)
        base=Vector((math.cos(a)*r,math.sin(a)*r,.012))
        h=height*(.74+.26*rng.random())
        tip=base+Vector((math.cos(a)*h*.18,math.sin(a)*h*.18,h))
        if dry: tip.z-=h*.12
        _add_culm(f"flax_stem_{i}",tuple(base),tuple(tip),.009,.0035,tokens[0],root)
        leaf_count=2 if stage=="sprout" else 4 if not dry else 3
        for j in range(leaf_count):
            node=base.lerp(tip,.18+.58*j/max(1,leaf_count-1))
            _add_folded_leaf(f"flax_leaf_{i}_{j}",tuple(node),p["leafLength"],p["leafWidth"],
                a+j*2.4,tokens[0],root,pitch=.65,droop=.60 if dry else .04)
        if stage in ("mature","overripe","withered"):
            for j in range(2 if stage=="mature" else 1):
                flower_tip=tip+Vector((math.cos(a+j*2)*.08,math.sin(a+j*2)*.08,.045-j*.065))
                add_tapered_beam(f"flax_pedicel_{i}_{j}",tuple(tip),tuple(flower_tip),.004,.002,tokens[0],root,vertices=3)
                if stage=="mature":
                    _add_flax_flower(f"flax_flower_{i}_{j}",tuple(flower_tip),tokens[1],tokens[3],root,
                        radius=.063 if j==0 else .045,facing_angle=a)
                else:
                    _add_crop_volume(f"flax_boll_{i}",tuple(flower_tip),(.026,.024,.031),tokens[1],root)


def tomato_crop(spec: dict, root) -> None:
    """Author staked fruit-bearing tomato stages whose posture remains distinct without color."""
    rng = seeded_rng(spec["seed"])
    stage = spec["parameters"]["stage"]
    tokens = spec["palette"]
    leaf_token = tokens[0]
    stem_token = tokens[1] if len(tokens) > 1 else leaf_token
    fruit_token = tokens[2] if len(tokens) > 2 else stem_token
    accent_token = tokens[3] if len(tokens) > 3 else fruit_token
    stake_token = tokens[4] if len(tokens) > 4 else (tokens[1] if len(tokens) > 1 else leaf_token)

    if stage == "seeded":
        _reference_seeds(spec,root,token=tokens[0],count=3,tuber=False)
        return

    if stage == "sprout":
        for index, angle in enumerate((0.32, 2.42, 4.55)):
            base = (math.cos(angle) * 0.08, math.sin(angle) * 0.08, 0.012)
            tip = (
                base[0] + math.cos(angle) * 0.03,
                base[1] + math.sin(angle) * 0.03,
                0.22 + index * 0.018,
            )
            _add_culm(f"tomato_sprout_{index}", base, tip, 0.014, 0.007, stem_token, root, knee=0.02)
            _add_compound_leaf(
                f"tomato_sprout_{index}",
                tip,
                angle + 0.4,
                0.16,
                leaf_token,
                stem_token,
                root,
                leaflet_count=2,
            )
        return

    # Growing, mature, overripe, and withered feature an authentic wooden garden stake
    stake_height = {"growing": 0.88, "mature": 1.16, "overripe": 1.08, "withered": 0.82}[stage]
    _add_garden_stake(
        "tomato_stake",
        (0.0, 0.0, -0.04),
        stake_height,
        0.036 if stage != "withered" else 0.032,
        stake_token,
        root,
    )

    if stage in ("growing", "mature"):
        _add_twine_tie("tomato_tie_0", (0.0, 0.0, 0.32), 0.032, 0.016, stem_token, root)
        if stage == "mature":
            _add_twine_tie("tomato_tie_1", (0.0, 0.0, 0.68), 0.028, 0.016, stem_token, root)

    plant_count = spec["parameters"]["plants"]
    stage_height = {"growing": 0.72, "mature": 1.04, "overripe": 0.82, "withered": 0.52}[stage]
    for index in range(plant_count):
        angle = index * GOLDEN_ANGLE + 0.28
        radial = spec["parameters"]["spread"] * math.sqrt((index + 0.4) / max(1, plant_count))
        base = (math.cos(angle) * radial, math.sin(angle) * radial, 0.016)
        lean = 0.03 if stage == "growing" else 0.05
        if stage == "overripe":
            lean = 0.22 + 0.04 * (index % 2)
        elif stage == "withered":
            lean = 0.30 + 0.04 * (index % 2)
        direction = angle + (0.34 if index % 2 else -0.22)
        tip = (
            base[0] + math.cos(direction) * lean,
            base[1] + math.sin(direction) * lean,
            spec["parameters"]["height"] * rng.uniform(0.85, 1.03),
        )
        _add_culm(
            f"tomato_stem_{index:02d}",
            base,
            tip,
            0.020,
            0.008,
            stem_token,
            root,
            knee=0.06 if stage in ("overripe", "withered") else 0.03,
        )

        droop = 0.0 if stage in ("growing", "mature") else 0.45 if stage == "overripe" else 0.80
        leaf_count = 3 if stage == "growing" else 4 if stage == "mature" else 3 if stage == "overripe" else 2
        for leaf_index in range(leaf_count):
            t = 0.30 + leaf_index * (0.54 / max(1, leaf_count - 1))
            attach = (
                base[0] + (tip[0] - base[0]) * t,
                base[1] + (tip[1] - base[1]) * t,
                base[2] + (tip[2] - base[2]) * t,
            )
            leaf_angle = angle + leaf_index * GOLDEN_ANGLE * 0.55 + (0.4 if index % 2 else -0.25)
            _add_compound_leaf(
                f"tomato_leaf_{index:02d}_{leaf_index:02d}",
                attach,
                leaf_angle,
                spec["parameters"]["leafLength"],
                leaf_token,
                stem_token,
                root,
                leaflet_count=3 if stage in ("growing","mature") else 2,
                droop=droop,
            )

        if stage == "growing":
            _add_star_flower(
                f"tomato_blossom_{index:02d}",
                (tip[0] + math.cos(angle) * 0.05, tip[1] + math.sin(angle) * 0.05, tip[2] + 0.02),
                0.038,
                fruit_token,
                accent_token,
                root,
                petals=5,
                rotation=angle,
            )
        elif stage == "withered":
            _add_octahedron(
                f"tomato_dried_{index:02d}",
                (
                    base[0] + (tip[0] - base[0]) * 0.48,
                    base[1] + (tip[1] - base[1]) * 0.48,
                    base[2] + (tip[2] - base[2]) * 0.42,
                ),
                (0.024, 0.024, 0.018),
                accent_token,
                root,
            )
        elif stage in ("mature", "overripe"):
            fruit_center = (
                base[0] + (tip[0] - base[0]) * 0.52 - math.cos(direction) * 0.06,
                base[1] + (tip[1] - base[1]) * 0.52 - math.sin(direction) * 0.06,
                base[2] + (tip[2] - base[2]) * ((0.30 + index*.20) if stage == "mature" else (0.30 + index*.15)),
            )
            _add_tomato_fruit_cluster(
                f"tomato_cluster_{index:02d}",
                fruit_center,
                fruit_token,
                accent_token,
                stem_token,
                root,
                fruit_count=2,
                radius=spec["parameters"]["fruitRadius"],
                droop=0.0 if stage == "mature" else 0.65,
            )

    if stage == "overripe":
        _add_tomato_fruit(
            "tomato_fallen_00",
            (0.14, -0.10, 0.028),
            0.042,
            fruit_token,
            stem_token,
            root,
            rotation=0.45,
            flatten=0.68,
        )


def _add_potato_crown(
    prefix: str,
    base: tuple[float, float, float],
    leaf_token: str,
    stem_token: str,
    root,
    *,
    height: float,
    spread: float,
    stems: int,
    droop: float,
    leaflets: int,
) -> list[tuple[float, float, float]]:
    tips: list[tuple[float, float, float]] = []
    for index in range(stems):
        angle = index * GOLDEN_ANGLE + 0.18
        lean = spread * (0.22 + 0.52 * droop) * (0.78 + 0.14 * (index % 3))
        tip = (
            base[0] + math.cos(angle) * lean,
            base[1] + math.sin(angle) * lean,
            base[2] + height * (0.88 + 0.08 * (index % 3)) * (1.0 - droop * 0.32),
        )
        _add_culm(
            f"{prefix}_stem_{index:02d}",
            base,
            tip,
            0.016,
            0.007,
            stem_token,
            root,
            knee=0.04 + droop * 0.05,
        )
        for tier in range(2):
            along = 0.40 + 0.44 * tier
            node = (
                base[0] + (tip[0] - base[0]) * along,
                base[1] + (tip[1] - base[1]) * along,
                base[2] + (tip[2] - base[2]) * along,
            )
            for leaflet_index in range(leaflets):
                fan = (leaflet_index - (leaflets - 1) * 0.5) * 0.70 + tier * 0.44
                _add_folded_leaf(
                    f"{prefix}_leaf_{index:02d}_{tier}{leaflet_index:02d}",
                    node,
                    spread * (0.40 + 0.03 * (index % 2)) * (1.0 - 0.14 * tier),
                    spread * 0.24,
                    angle + fan,
                    leaf_token,
                    root,
                    pitch=0.44,
                    droop=droop,
                    cup=0.16,
                )
        tips.append(tip)
    return tips


def potato_crop(spec: dict, root) -> None:
    """Author compact potato foliage with flowering maturity and collapsing senescence."""
    rng = seeded_rng(spec["seed"])
    stage = spec["parameters"]["stage"]
    tokens = spec["palette"]
    leaf_token = tokens[0]
    stem_token = tokens[1] if len(tokens) > 1 else leaf_token
    flower_token = tokens[2] if len(tokens) > 2 else leaf_token
    center_token = tokens[3] if len(tokens) > 3 else flower_token
    tuber_token = tokens[4] if len(tokens) > 4 else (tokens[2] if len(tokens) > 2 else leaf_token)

    if stage == "seeded":
        _reference_seeds(spec,root,token=tokens[0],count=3,tuber=True)
        return

    if stage == "sprout":
        _add_potato_crown(
            "potato_sprout",
            (0, 0, 0.016),
            leaf_token,
            stem_token,
            root,
            height=spec["parameters"]["height"],
            spread=spec["parameters"]["spread"],
            stems=3,
            droop=0.0,
            leaflets=2,
        )
        return

    settings = {
        "growing": (0.50, 0.46, 5, 0.04, 3),
        "mature": (0.66, 0.56, 6, 0.08, 3),
        "overripe": (0.42, 0.68, 6, 0.58, 2),
        "withered": (0.24, 0.68, 5, 0.88, 2),
    }
    height, spread, stems, droop, leaflets = settings[stage]
    height=spec["parameters"]["height"]
    spread=spec["parameters"]["spread"]
    stems=spec["parameters"]["stems"]
    tips = _add_potato_crown(
        f"potato_{stage}",
        (0, 0, 0.016),
        leaf_token,
        stem_token,
        root,
        height=height,
        spread=spread,
        stems=stems,
        droop=droop,
        leaflets=leaflets,
    )
    if stage == "growing":
        for index, tip in enumerate(tips[:3]):
            _add_octahedron(
                f"potato_bud_{index:02d}",
                (tip[0], tip[1], tip[2] + 0.018),
                (0.016, 0.016, 0.022),
                flower_token,
                root,
            )
    elif stage == "mature":
        for index, tip in enumerate(tips[:4]):
            _add_star_flower(
                f"potato_flower_{index:02d}",
                (tip[0], tip[1], tip[2] + 0.012),
                0.072,
                flower_token,
                center_token,
                root,
                petals=5,
                rotation=index * 0.31,
            )
        for index in range(4):
            angle = index * GOLDEN_ANGLE + 0.9
            radius = 0.14 + 0.04 * (index % 2)
            _add_crop_volume(
                f"potato_tuber_{index:02d}",
                (math.cos(angle) * radius, math.sin(angle) * radius * 0.86, 0.060),
                (0.10, 0.075, 0.066),
                tuber_token,
                root,
                rotation=angle,
            )
    elif stage == "overripe":
        tuber_color = tokens[2] if len(tokens) > 2 else stem_token
        for index in range(5):
            angle = index * GOLDEN_ANGLE + 0.4
            radius = 0.09 + 0.06 * (index % 2)
            _add_crop_volume(
                f"potato_tuber_overripe_{index:02d}",
                (math.cos(angle) * radius, math.sin(angle) * radius * 0.9, 0.065),
                (0.105, 0.078, 0.070),
                tuber_color,
                root,
                rotation=angle,
            )
    elif stage == "withered":
        tuber_color = tokens[1] if len(tokens) > 1 else tokens[0]
        for index in range(3):
            angle = index * 2.1 + 0.5
            radius = 0.12
            _add_crop_volume(
                f"potato_tuber_withered_{index:02d}",
                (math.cos(angle) * radius, math.sin(angle) * radius, 0.018),
                (0.068, 0.052, 0.045),
                tuber_color,
                root,
                rotation=angle,
            )


def carrot_crop(spec, root):
    p=spec["parameters"]; stage=p["stage"]; tokens=spec["palette"]
    if stage=="seeded":
        _reference_seeds(spec,root,token=tokens[0],count=3)
        return
    dry=stage in ("overripe","withered")
    crown_h=p["height"]*(.23 if stage in ("mature","overripe") else .16 if stage=="withered" else 0)
    if crown_h:
        r=.068 if stage=="mature" else .078 if stage=="overripe" else .045
        add_lofted_form("carrot_root",[
            ((0,0,.005),r*.48,r*.46),((0,0,crown_h*.40),r*.85,r*.82),
            ((0,0,crown_h*.83),r,r*.92),((0,0,crown_h),r*.60,r*.60)],tokens[2],root,sides=7)
    count=p["plants"]
    for i in range(count):
        angle=i*GOLDEN_ANGLE+.18
        length=p["leafLength"]*(.83+.17*(i%3)/2)
        _add_carrot_frond(f"carrot_frond_{i}",(math.cos(angle)*.015,math.sin(angle)*.015,max(.012,crown_h*.94)),
            angle,length,1.08 if i%3 else .82,tokens[0],tokens[1],root,
            pinnae_pairs=2 if stage=="sprout" else 3,
            droop=.88 if stage=="withered" else .66 if dry else .03)


def turnip_crop(spec: dict, root) -> None:
    """Purple-shouldered white bulb with upright greens; no farm-tiling soil disc."""
    rng = seeded_rng(spec["seed"])
    tokens = spec["palette"]
    leaf_token = tokens[0]
    purple_token = tokens[1] if len(tokens) > 1 else leaf_token
    white_token = tokens[2] if len(tokens) > 2 else purple_token
    soil_token = tokens[3] if len(tokens) > 3 else white_token
    leaf_count = spec["parameters"]["leafCount"]

    bulb = add_lofted_form("turnip_body", [((0, 0, .015), .035, .035), ((0, 0, .10), .15, .16),
                ((0, .01, .20), .13, .13), ((0, .02, .26), .035, .035)], white_token, root, sides=8)
    bulb.data.materials.append(get_or_create_material(purple_token))
    for face in bulb.data.polygons:
        if face.index >= 16:
            face.material_index = 1
    add_tapered_beam("turnip_taproot", (0.0, 0.0, 0.04), (0.02, -0.03, -0.02), 0.028, 0.008, white_token, root, vertices=5)
    add_tapered_beam("turnip_crown", (0.0, 0.0, 0.24), (0.0, 0.0, 0.30), 0.018, 0.010, leaf_token, root, vertices=5)

    for index in range(leaf_count):
        angle = index * GOLDEN_ANGLE + 0.22
        attach = (math.cos(angle) * 0.04, math.sin(angle) * 0.04, 0.28)
        _add_folded_leaf(
            f"turnip_leaf_{index:02d}",
            attach,
            0.28 + 0.04 * (index % 3),
            0.11 + 0.02 * (index % 2),
            angle,
            leaf_token,
            root,
            pitch=1.05,
            droop=0.12 * (index % 3),
            cup=0.14,
        )

    for index in range(4):
        angle = index * GOLDEN_ANGLE + rng.uniform(-0.2, 0.2)
        radius = 0.16 + 0.06 * (index % 3)
        _add_octahedron(
            f"turnip_crumb_{index:02d}",
            (math.cos(angle) * radius, math.sin(angle) * radius, 0.012),
            (0.022, 0.016, 0.010),
            soil_token,
            root,
            rotation=angle,
        )


def pumpkin_crop(spec: dict, root) -> None:
    """Chunky lobed pumpkin with broad leaves and a short vine."""
    rng = seeded_rng(spec["seed"])
    tokens = spec["palette"]
    leaf_token = tokens[0]
    fruit_token = tokens[1] if len(tokens) > 1 else leaf_token
    vine_token = tokens[2] if len(tokens) > 2 else leaf_token
    soil_token = tokens[3] if len(tokens) > 3 else vine_token
    lobes = spec["parameters"]["lobes"]
    leaf_count = spec["parameters"]["leafCount"]
    fruit_radius = 0.21

    pumpkin = add_lofted_form("pumpkin_body", [((0, 0, .004), .09, .09), ((0, 0, .07), .20, .20),
                ((0, 0, .15), .21, .21), ((0, 0, .23), .12, .12), ((0, 0, .215), .045, .045)], fruit_token, root, sides=lobes * 2)
    for vertex in pumpkin.data.vertices:
        angle = math.atan2(vertex.co.y, vertex.co.x)
        factor = .95 + .05 * math.cos(lobes * angle)
        vertex.co.x *= factor
        vertex.co.y *= factor
    pumpkin.data.update()
    add_tapered_beam("pumpkin_stem", (0.02, 0.0, 0.205), (0.05, 0.03, 0.295), 0.024, 0.013, vine_token, root, vertices=5)

    vine_points = (
        (0.08, 0.04, 0.06),
        (0.22, 0.10, 0.08),
        (0.34, -0.02, 0.07),
        (0.42, -0.14, 0.06),
    )
    add_limb_tube("pumpkin_vine", vine_points, [.016, .012, .012, .008], vine_token, root, sides=5)

    for index in range(leaf_count):
        angle = 0.8 + index * 1.15
        radius = 0.22 + 0.06 * (index % 2)
        attach = (math.cos(angle) * radius, math.sin(angle) * radius * 0.72, 0.05)
        _add_folded_leaf(
            f"pumpkin_leaf_{index:02d}",
            attach,
            0.22 + 0.03 * (index % 2),
            0.18,
            angle + 0.35,
            leaf_token,
            root,
            pitch=0.18,
            droop=0.22,
            cup=0.18,
        )

    for index in range(3):
        angle = index * GOLDEN_ANGLE + rng.uniform(-0.15, 0.15)
        _add_octahedron(
            f"pumpkin_crumb_{index:02d}",
            (math.cos(angle) * 0.28, math.sin(angle) * 0.22, 0.010),
            (0.024, 0.018, 0.009),
            soil_token,
            root,
            rotation=angle,
        )


def sunflower_crop(spec, root):
    p=spec["parameters"]; stage=p["stage"]; tokens=spec["palette"]
    if stage=="seeded":
        _reference_seeds(spec,root,token=tokens[3],count=3)
        return
    height=p["height"]; dry=stage in ("overripe","withered")
    droop=.78 if stage=="withered" else .56 if dry else .06
    base=(0,0,.012); shoulder=(.015,.0,height*.86)
    tip=(.12 if dry else .025,-.06 if dry else 0,height*(.82 if dry else 1))
    add_limb_tube("sunflower_stem",[base,shoulder,tip],[.027,.019,.014],tokens[1],root,sides=6)
    leaf_total = p["leafCount"] + (1 if stage == "growing" else 0)
    for i in range(leaf_total):
        t=.15+.65*i/max(1,leaf_total-1)
        _add_folded_leaf(f"sunflower_leaf_{i}",(.015*t,0,height*t),p["leafLength"]*(1-.27*t),
            p["leafWidth"]*(1-.22*t),i*GOLDEN_ANGLE+.3,tokens[0],root,pitch=.38,droop=droop,cup=.25)
    if stage=="growing":
        _add_crop_volume("sunflower_bud",tip,(.080,.070,.115),tokens[0],root)
    elif stage in ("mature","overripe","withered"):
        head_radius=.205 if stage=="mature" else .19 if stage=="overripe" else .13
        head=(tip[0],tip[1],tip[2]+.025)
        _add_sunflower_head("sunflower_head",head,head_radius,tokens,root,
            petals=16 if stage=="mature" else 13,
            nod=math.radians(58 if stage=="mature" else 115 if stage=="overripe" else 130),
            dry=stage=="withered")


def olive_crop(spec,root):
    _orchard_crop(spec,root,olive=True)


def apple_tree_crop(spec,root):
    _orchard_crop(spec,root,olive=False)


def _add_crop_volume(name, center, scale, token, root, *, rotation=0):
    """Faceted shoulders around an equator, rather than an eight-triangle fruit."""
    cx,cy,cz=center; sx,sy,sz=scale
    obj=add_lofted_form(name,[((cx,cy,cz-sz),sx*.28,sy*.28),
        ((cx,cy,cz-sz*.48),sx*.83,sy*.83),((cx,cy,cz+sz*.22),sx,sy),
        ((cx,cy,cz+sz*.80),sx*.66,sy*.66),((cx,cy,cz+sz),sx*.28,sy*.28)],
        token,root,sides=6)
    return obj


def _reference_seeds(spec,root,*,token,count,tuber=False):
    p=spec["parameters"]
    for i in range(count):
        a=i*GOLDEN_ANGLE+.2; r=p["spread"]*(.55+.45*(i%2))
        sx=.043 if tuber else .022; sy=sx*.74; sz=.026 if tuber else .011
        x,y=math.cos(a)*r,math.sin(a)*r
        add_lofted_form(f"{spec['id']}_seed_{i}",[
            ((x,y,.002),sx*.25,sy*.25),((x,y,sz+.002),sx,sy),
            ((x,y,sz*2+.002),sx*.22,sy*.22)],token,root,sides=6)


def _cereal_crop(spec,root,*,barley):
    p=spec["parameters"]; stage=p["stage"]; tokens=spec["palette"]
    if stage=="seeded":
        _reference_seeds(spec,root,token=tokens[0],count=3)
        return
    rng=seeded_rng(spec["seed"]); count=p["stalks"]
    stem=tokens[0]; grain=tokens[1] if len(tokens)>1 else stem
    leaf=tokens[2] if len(tokens)>2 else stem
    dry=stage in ("overripe","withered")
    prefix="barley" if barley else "wheat"
    for i in range(count):
        a=i*GOLDEN_ANGLE+.23; r=p["spread"]*math.sqrt((i+.5)/count)
        base=Vector((math.cos(a)*r,math.sin(a)*r,.012))
        h=p["height"]*(.74+.26*rng.random())
        forward=Vector((math.cos(a),math.sin(a),0))
        shoulder=base+forward*h*(.12 if dry else .025)+Vector((0,0,h))
        end=shoulder+forward*(.12 if dry else .018)+Vector((0,0,-.05 if dry else .018))
        add_limb_tube(f"{prefix}_stalk_{i}",[tuple(base),tuple(base.lerp(shoulder,.54)),tuple(shoulder),tuple(end)],
            [.012,.010,.009,.008] if stage!="sprout" else [.008,.007,.005,.004],stem,root,sides=5)
        leaves=3 if stage=="growing" else 2
        for j in range(leaves):
            node=base.lerp(shoulder,.13+j*.22)
            _add_folded_leaf(f"{prefix}_leaf_{i}_{j}",tuple(node),p["leafLength"]*(.82+.18*(i%2)),
                p["leafWidth"],a+j*2.7,leaf,root,pitch=1.08 if not dry else .35,
                droop=.76 if dry else .05,cup=.16)
        if stage in ("mature","overripe","withered"):
            if stage == "mature":
                # Mature cereal heads must read as separate, weighted ears at
                # the ordinary third-person camera.  A shared vertical axis
                # made the five heads merge into one rigid golden bundle.  A
                # restrained radial/lateral splay preserves the dense yield
                # read while creating individual organic silhouettes.
                lateral=Vector((-forward.y,forward.x,0))
                side_bias=(i % 3 - 1)
                head_base=end+forward*.012+lateral*(side_bias*.012)
                head_tip=head_base+forward*(.115+.018*(i%2))+lateral*(side_bias*.022)+Vector((0,0,.325+.010*(i%2)))
                kernel_count=10
            else:
                length=.33 if stage=="overripe" else .26
                head_base=end
                head_tip=end+forward*(.18 if dry else .045)+Vector((0,0,-length*.78 if dry else length))
                kernel_count=12
            head_builder = _add_barley_head if barley else _add_wheat_head
            head_builder(f"{prefix}_head_{i}",tuple(head_base),tuple(head_tip),grain,root,
                radius=(.058 if barley else .068) if stage=="mature" else (.073 if barley else .088),
                kernel_count=kernel_count,awn_count=6 if barley and stage!="withered" else 0,
                refined=stage=="mature")


def _orchard_crop(spec,root,*,olive):
    p=spec["parameters"]; stage=p["stage"]; tokens=spec["palette"]
    if stage=="seeded":
        _reference_seeds(spec,root,token=tokens[1],count=2)
        return
    h=p["height"]; spread=p["spread"]; dry=stage=="withered"
    name="olive" if olive else "apple"
    trunk=[(0,0,.006),(-.035,0,h*.25),(.022,.014,h*.49),(-.006,.02,h*.78),(.03,.01,h*.97)]
    radius=(.045 if olive else .062)*(min(1.6,.5+h/2.5))
    add_limb_tube(name+"_trunk",trunk,[radius,radius*.87,radius*.65,radius*.34,.005],tokens[1],root,sides=7)
    for i in range(p["branches"]):
        a=i*GOLDEN_ANGLE+.32
        t=.32+.36*i/max(1,p["branches"]-1)
        start=Vector((.008, .008,h*t))
        radial=spread*(.95-.35*(i/max(1,p["branches"]-1)))
        tip=start+Vector((math.cos(a)*radial,math.sin(a)*radial,h*(.20+.05*(i%2))))
        middle=start.lerp(tip,.58)+Vector((0,0,-h*.025))
        add_limb_tube(f"{name}_b_{i}",[tuple(start),tuple(middle),tuple(tip)],
            [radius*.52,radius*.32,.004],tokens[1],root,sides=5)
        for j in range(2 if stage!="sprout" else 1):
            anchor=start.lerp(tip,.48+j*.28)
            direction=a+(-.8 if j==0 else .7)
            twig=anchor+Vector((math.cos(direction)*radial*.25,math.sin(direction)*radial*.25,h*.09))
            add_tapered_beam(f"{name}_twig_{i}_{j}",tuple(anchor),tuple(twig),.007,.002,tokens[1],root,vertices=4)
        for j in range(p["leafCount"]):
            t=.30+.66*j/max(1,p["leafCount"]-1)
            node=start.lerp(tip,t)
            fan=(-1 if j%2==0 else 1)*(.62+.12*(j%3))
            token=tokens[3] if j%3==0 else tokens[0]
            _add_folded_leaf(f"{name}_leaf_{i}_{j}",tuple(node),p["leafLength"]*(.85+.15*(j%2)),
                p["leafWidth"],a+fan,token,root,pitch=.58 if olive else .65,droop=.72 if dry else .13,cup=.18)
        if dry and i%3==0:
            _add_folded_leaf(f"{name}_last_leaf_{i}",tuple(tip),p["leafLength"]*.65,p["leafWidth"]*.7,
                a,tokens[3],root,pitch=.2,droop=.85)
        if stage in ("mature","overripe"):
            for j in range(2 if olive else 1):
                node=start.lerp(tip,.65+j*.23)
                radius=p["fruitRadius"]
                fruit=node+Vector((math.cos(a+.9)*.045,math.sin(a+.9)*.045,-radius*.80))
                _add_crop_volume(f"{name}_fruit_{i}_{j}",tuple(fruit),
                    (radius*.78,radius*.67,radius) if olive else (radius,radius*.92,radius*.94),tokens[2],root)
                add_tapered_beam(f"{name}_fruit_stem_{i}_{j}",tuple(node),tuple(fruit+Vector((0,0,radius*.8))),
                    .004,.002,tokens[1],root,vertices=4)
    if stage=="overripe":
        for i in range(3):
            a=i*GOLDEN_ANGLE+.3; r=spread*(.50+.18*(i%2)); radius=p["fruitRadius"]
            _add_crop_volume(f"{name}_windfall_{i}",(math.cos(a)*r,math.sin(a)*r,radius*.75),
                (radius,radius*.85,radius*.8),tokens[2],root)


def _add_sunflower_head(name, center, radius, tokens, root, *, petals, nod, dry):
    """Petals, seed disc and receptacle share one nodding botanical plane."""
    group=bpy.data.objects.new(name,None)
    bpy.context.collection.objects.link(group)
    group.parent=root
    group.location=center
    group.rotation_euler=(nod,0,.25)
    add_lofted_form(name+'_back',[
        ((0,0,-radius*.20),radius*.64,radius*.64),
        ((0,0,-radius*.06),radius*1.04,radius*1.04),
        ((0,0,.0),radius,radius)],tokens[0],group,sides=12)
    add_lofted_form(name+'_disc',[
        ((0,0,-radius*.015),radius,radius),
        ((0,0,radius*.14),radius*.92,radius*.92),
        ((0,0,radius*.22),radius*.66,radius*.66)],tokens[3],group,sides=12)
    for i in range(petals):
        a=i*math.tau/petals
        _add_folded_leaf(f'{name}_petal_{i}',(math.cos(a)*radius*.85,math.sin(a)*radius*.85,0),
            radius*(.62 if dry else .90),radius*.45,a,tokens[2],group,
            pitch=.10,droop=.35 if dry else .02,cup=.15)
