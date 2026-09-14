"""Vegetation family generators."""

from __future__ import annotations

import math

import bpy
from mathutils import Vector

from common.geometry import (
    _build_mesh,
    add_beam,
    add_box,
    add_collision_primitives,
    add_cone,
    add_cylinder,
    add_ico,
    add_leaf_blade,
    add_limb_tube,
    add_lofted_form,
    add_tapered_beam,
    add_tri_prism,
    apply_vertex_values,
    seeded_rng,
)
from common.authored import add_tree_buttresses, add_canopy_lobe, add_conifer_tier, grow_branch
from common.geometry import set_surface_normals
from common.lod import consolidate_lod_level, create_lod_roots
from common.materials import get_or_create_material


def _build_tree_lods(spec: dict, root, builder, reduce_parameters) -> None:
    for lod_index, lod_root in create_lod_roots(spec, root):
        lod_spec = {**spec, "parameters": dict(spec["parameters"]), "_lodIndex": lod_index}
        if lod_index > 0:
            reduce_parameters(lod_spec["parameters"])
        builder(lod_spec, lod_root)
        prefix = f"{spec['id']}_LOD{lod_index}"
        for child in list(lod_root.children):
            child.name = f"{prefix}_{child.name.split('.')[0]}"
            if child.type == "MESH":
                child.data.name = f"{child.name}_mesh"
        if spec.get("lodLevels"):
            consolidate_lod_level(lod_root, prefix)
    # Once, on the asset root: a collider is not a level of detail.
    add_collision_primitives(spec, root)


def _oak_tree(spec: dict, root) -> None:
    p = spec["parameters"]
    height, spread, gesture = p["height"], p["spread"], p["lean"] * p["height"]
    lod = spec.get("_lodIndex", 0)
    wood, leaf, shade = spec["palette"]
    trunk = add_limb_tube("oak_trunk", [(0, 0, .02), (gesture*.18, 0, height*.26),
        (gesture*.48, .03, height*.47), (gesture*.70, .04, height*.64)],
        [.49, .35, .27, .14], wood, root, sides=8)
    add_tree_buttresses("oak_root", (0, 0, 0), .85, .64, wood, root,
                       count=p["rootCount"], seed=spec["seed"]+1)
    # Four unequal branch-carried masses preserve the measured sheet hierarchy.
    layout = ((-.52, -.10, .71, .57, .47, .16), (.02, .09, .87, .51, .43, .15),
              (.55, -.02, .75, .49, .42, .14), (.02, .43, .76, .47, .40, .15))
    centers = []
    for i, (x, y, z, sx, sy, sz) in enumerate(layout):
        rng = seeded_rng(spec["seed"]+i*31)
        center = (gesture*.78 + (x+rng.uniform(-.045,.045))*spread,
                  y*spread, height*(z+rng.uniform(-.018,.018)))
        centers.append(center)
        start = (gesture*.40, 0, height*(.39+.035*i))
        end = (center[0], center[1], center[2] - height*.035)
        grow_branch(trunk, start, end, .18-i*.012, .045)
        add_canopy_lobe(f"oak_canopy_major_{i}", center,
            (spread*sx, spread*sy, height*sz), shade if i==3 else leaf, root,
            seed=spec["seed"]+i*17, detail=not lod, rotation=(.08*i,-.08*i,.35*i))
    for i in range(max(0,p["canopyClusters"]-4)):
        rng = seeded_rng(spec["seed"]+101+i*23)
        c = centers[i%4]
        angle = i*2.39996 + .4
        reach = spread * rng.uniform(.25,.36)
        center = (c[0]+math.cos(angle)*reach, c[1]+math.sin(angle)*reach*.82,
                  c[2]+height*rng.uniform(-.07,.055))
        size = spread * rng.uniform(.25,.34)
        add_canopy_lobe(f"oak_canopy_edge_{i}",center,(size,size*.82,size*.75),
            shade if i%5==0 else leaf,root,seed=spec["seed"]+i+211,detail=not lod,
            rotation=(.15,-.1,angle))
    # Remaining limbs terminate within existing crown masses at both LODs.
    for i in range(max(0,p["branchCount"]-4)):
        c = centers[(i+2)%4]
        grow_branch(trunk,(gesture*.5,0,height*.50),
                    (c[0]*.82,c[1]*.85,c[2]-.10),.105,.025)


def oak_tree(spec: dict, root) -> None:
    def reduce(parameters: dict) -> None:
        parameters["canopyClusters"] = max(6, round(parameters["canopyClusters"] * 0.45))
        parameters["branchCount"] = max(4, round(parameters["branchCount"] * 0.60))
        parameters["rootCount"] = max(4, round(parameters["rootCount"] * 0.70))

    _build_tree_lods(spec, root, _oak_tree, reduce)


def _leaf_mass(name, center, scale, token, root, *, subdivisions=2, rotation=(0,0,0), normal_mode=None):
    seed = sum((i+1)*ord(c) for i,c in enumerate(name))
    return add_canopy_lobe(name, center, scale, token, root, seed=seed,
                           detail=subdivisions>1, rotation=rotation)


def _olive_tree(spec: dict, root) -> None:
    params = spec["parameters"]
    rng = seeded_rng(spec["seed"])
    height = params["height"]
    spread = params["spread"]
    lean = params["lean"]
    lod_index = spec.get("_lodIndex", 0)
    wood, leaves, highlight, fruit = spec["palette"]
    gesture = lean * height
    lower = (gesture * 0.22, -0.05, height * 0.34)
    fork = (gesture * 0.54, 0.08, height * 0.53)
    crown = (gesture * 0.88, 0.0, height * 0.72)
    trunk = add_limb_tube("olive_trunk", [(0, 0, .07), lower, fork, crown], [.52, .38, .27, .12], wood, root, sides=8)
    bpy.context.view_layer.update()
    add_tree_buttresses(
        "olive_root", (0, 0, 0), 0.94, 0.5, wood, root,
        count=params["rootCount"], seed=spec["seed"] + 1,
    )
    branch_ends = []
    for index in range(params["branchCount"]):
        angle = index * math.tau / params["branchCount"] + 0.28 + rng.uniform(-0.2, 0.2)
        start = fork if index % 2 == 0 else lower
        end = (
            crown[0] + math.cos(angle) * spread * rng.uniform(0.48, 0.72),
            math.sin(angle) * spread * rng.uniform(0.38, 0.58),
            height * rng.uniform(0.64, 0.83),
        )
        branch_ends.append(end)
        grow_branch(trunk, start, end, .18 if index < 2 else .14, .055)
        if lod_index == 0:
            tip = (
                end[0] + math.cos(angle + 0.46) * spread * 0.10,
                end[1] + math.sin(angle + 0.46) * spread * 0.08,
                end[2] + height * 0.015,
            )
            add_tapered_beam(f"olive_twig_{index:02d}", end, tip, 0.058, 0.022, wood, root, vertices=6)

    cluster_count = params["canopyClusters"]
    for index in range(cluster_count):
        angle = index * 2.39996 + rng.uniform(-0.2, 0.2)
        radius = spread * (0.28 + 0.34 * (index % 3) / 2) * rng.uniform(0.9, 1.08)
        center = (
            crown[0] + math.cos(angle) * radius,
            math.sin(angle) * radius * 0.72,
            height * (0.71 + 0.1 * (index % 3) / 2 + rng.uniform(-0.025, 0.025)),
        )
        size = spread * rng.uniform(0.33, 0.46)
        _leaf_mass(
            f"olive_canopy_{index:02d}", center,
            (size * 1.14, size * 0.78, size * 0.52),
            highlight if index % 4 == 0 else leaves,
            root,
            subdivisions=1 if lod_index else 2,
            rotation=(rng.uniform(-0.18, 0.18), rng.uniform(-0.18, 0.18), angle * 0.24),
        normal_mode="rounded")
    if lod_index == 0:
        for index in range(params["fruitCount"]):
            angle = index * 2.39996 + 0.5
            radius = spread * (0.38 + 0.24 * ((index * 3) % 7) / 6)
            add_ico(
                f"olive_fruit_{index:02d}",
                (
                    crown[0] + math.cos(angle) * radius,
                    math.sin(angle) * radius * 0.7 - spread * 0.2,
                    height * (0.68 + 0.16 * ((index * 5) % 7) / 6),
                ),
                (0.055, 0.045, 0.065), fruit, root, subdivisions=1,
            normal_mode="rounded")


def olive_tree(spec: dict, root) -> None:
    def reduce(parameters: dict) -> None:
        parameters["canopyClusters"] = max(6, round(parameters["canopyClusters"] * 0.48))
        parameters["branchCount"] = max(4, round(parameters["branchCount"] * 0.62))
        parameters["rootCount"] = max(4, round(parameters["rootCount"] * 0.7))
        parameters["fruitCount"] = 0

    _build_tree_lods(spec, root, _olive_tree, reduce)


def _pine_tree(spec: dict, root) -> None:
    p, rng = spec["parameters"], seeded_rng(spec["seed"])
    height, spread, lean = p["height"], p["spread"], p["lean"]
    lod = spec.get("_lodIndex", 0)
    wood, pine, accent = spec["palette"]
    add_limb_tube("pine_trunk",[(0,0,0),(lean*.4,0,height*.43),(lean,0,height*.97)],
                  [.29,.18,.035],wood,root,sides=7)
    add_tree_buttresses("pine_root",(0,0,0),.60,.36,wood,root,
                       count=p["rootCount"],seed=spec["seed"]+1)
    for i in range(p["tiers"]):
        t = i/max(1,p["tiers"]-1)
        z = height*(.24+.65*t)
        radius = spread*(1-.86*t)
        tier_height = height*(.18-.05*t)
        c=(lean*z/height,.06*math.sin(i*2.4),z)
        add_conifer_tier(f"pine_tier_{i}",c,radius,tier_height,
                         pine if i<p["tiers"]-2 else accent,root,
                         seed=spec["seed"]+i*13,detail=not lod)
        if not lod and i<p["tiers"]-2:
            for branch in range(p["branchesPerTier"]):
                angle = i*2.39996+branch*math.tau/p["branchesPerTier"]
                end=(c[0]+math.cos(angle)*radius*.78,c[1]+math.sin(angle)*radius*.78,z-.04)
                add_tapered_beam(f"pine_bough_wood_{i}_{branch}",(c[0],c[1],z-.14),end,
                                 .035,.012,wood,root,vertices=5)
                for fan in range(3):
                    fan_angle=angle+(fan-1)*.24
                    start=(c[0]+math.cos(angle)*radius*.35,c[1]+math.sin(angle)*radius*.35,
                           z+tier_height*.22)
                    tip=(c[0]+math.cos(fan_angle)*radius*.95,c[1]+math.sin(fan_angle)*radius*.95,
                         z-tier_height*.10)
                    blade=add_leaf_blade(f"pine_bough_{i}_{branch}_{fan}",start,tip,radius*.29,
                        pine,root,stations=2,thickness=.012,cup=.55,bend=(0,0,tier_height*.13))
                    set_surface_normals(blade,"planar")
    add_cone("pine_leader",(lean,0,height*.955),spread*.13,0,height*.16,pine,root,vertices=7)


def pine_tree(spec: dict, root) -> None:
    def reduce(parameters: dict) -> None:
        parameters["tiers"] = max(5, round(parameters["tiers"] * 0.62))
        parameters["branchesPerTier"] = max(3, parameters["branchesPerTier"] - 1)
        parameters["rootCount"] = max(3, round(parameters["rootCount"] * 0.70))

    _build_tree_lods(spec, root, _pine_tree, reduce)


def _apple_tree(spec: dict, root) -> None:
    params = spec["parameters"]
    rng = seeded_rng(spec["seed"])
    height = params["height"]
    spread = params["spread"]
    lod_index = spec.get("_lodIndex", 0)
    wood, leaves, fruit = spec["palette"][:3]
    blossom = spec["palette"][3] if len(spec["palette"]) > 3 else leaves
    trunk = add_limb_tube("apple_trunk", [(0, 0, 0), (0, 0, height * .36), (0, 0, height * .68)], [.42, .30, .20], wood, root, sides=8)
    bpy.context.view_layer.update()
    add_tree_buttresses("apple_root", (0, 0, 0), 0.82, 0.48, wood, root, count=params["rootCount"], seed=spec["seed"] + 1)
    crown_phase = rng.uniform(-0.28, 0.28)
    for index in range(params["branchCount"]):
        angle = index * math.tau / params["branchCount"] + 0.4 + crown_phase + rng.uniform(-0.12, 0.12)
        branch_radius = spread * 0.55 * rng.uniform(0.92, 1.06)
        end = (math.cos(angle) * branch_radius, math.sin(angle) * branch_radius, height * (0.68 + 0.06 * (index % 2) + rng.uniform(-0.018, 0.018)))
        grow_branch(trunk, (0, 0, height * .47), end, .11, .055)
        if lod_index == 0:
            add_beam(
                f"apple_twig_{index:02d}", end,
                (end[0] + math.cos(angle + 0.6) * spread * 0.10, end[1] + math.sin(angle + 0.6) * spread * 0.10, end[2] + height * 0.035),
                0.052, wood, root, vertices=6,
            )
    clusters = params["canopyClusters"]
    for index in range(clusters):
        angle = index * 2.39996 + crown_phase + rng.uniform(-0.20, 0.20)
        radial = spread * (0.28 + 0.35 * (index % 3) / 2) * rng.uniform(0.90, 1.10)
        size = spread * rng.uniform(0.48, 0.62)
        center_z = height * (0.70 + 0.12 * (index % 2) + rng.uniform(-0.025, 0.025))
        _leaf_mass(
            f"apple_canopy_{index:02d}",
            (math.cos(angle) * radial, math.sin(angle) * radial * 0.8, center_z),
            (size, size * 0.86, size * 0.74), leaves, root, subdivisions=1 if lod_index else 2,
            rotation=(0.1 * math.sin(index), 0.08 * math.cos(index), angle * 0.2),
        normal_mode="rounded")
    for index in range(params["fruitCount"]):
        angle = index * 2.39996
        # Keep fruit inside the overlapping crown masses. The previous lower
        # band dropped apples onto the visible trunk, weakening the orchard
        # read from the gameplay camera.
        radius = spread * (0.50 + 0.18 * ((index * 5) % 7) / 6)
        face_offset = spread * (-0.46 if index % 4 in (0, 1) else 0.38)
        fruit_z = height * (0.72 + 0.16 * ((index * 3) % 5) / 4)
        add_ico(
            f"apple_fruit_{index:02d}",
            (math.cos(angle) * radius, math.sin(angle) * radius * 0.72 + face_offset, fruit_z),
            (0.16, 0.15, 0.16), fruit, root, subdivisions=1,
        normal_mode="rounded")
        add_cone(
            f"apple_stem_{index:02d}",
            (math.cos(angle) * radius, math.sin(angle) * radius * 0.72 + face_offset, fruit_z + 0.12),
            0.018, 0.010, 0.08, wood, root, vertices=5,
        )
    if lod_index == 0:
        for fallen in range(3):
            f_angle = fallen * 2.1 + 0.5
            f_rad = 0.55 + 0.35 * (fallen % 2)
            add_ico(
                f"apple_fallen_{fallen:02d}",
                (math.cos(f_angle) * f_rad, math.sin(f_angle) * f_rad, 0.07),
                (0.14, 0.14, 0.12), fruit, root, subdivisions=1,
            normal_mode="rounded")
        for bloom in range(max(4, params["fruitCount"] // 3)):
            angle = bloom * 2.39996 + 0.7
            radius = spread * (0.30 + 0.28 * ((bloom * 3) % 5) / 4)
            face_offset = spread * (-0.18 if bloom % 3 == 0 else 0.10)
            add_ico(
                f"apple_blossom_{bloom:02d}",
                (math.cos(angle) * radius, math.sin(angle) * radius * 0.78 + face_offset, height * (0.66 + 0.14 * (bloom % 3) / 2)),
                (0.07, 0.07, 0.05), blossom, root, subdivisions=1,
            normal_mode="rounded")
        for index in range(min(4, params["canopyClusters"])):
            angle = index * math.tau / 4 + 0.3
            _leaf_mass(
                f"apple_canopy_chip_{index:02d}",
                (math.cos(angle) * spread * 0.62, math.sin(angle) * spread * 0.50, height * 0.72),
                (spread * 0.22, spread * 0.20, spread * 0.16), leaves, root, subdivisions=2,
                rotation=(0.1, 0.08, angle),
            normal_mode="rounded")


def apple_tree(spec: dict, root) -> None:
    def reduce(parameters: dict) -> None:
        parameters["canopyClusters"] = max(6, round(parameters["canopyClusters"] * 0.55))
        parameters["fruitCount"] = max(6, round(parameters["fruitCount"] * 0.38))
        parameters["branchCount"] = max(3, round(parameters["branchCount"] * 0.65))
        parameters["rootCount"] = max(3, round(parameters["rootCount"] * 0.70))

    _build_tree_lods(spec, root, _apple_tree, reduce)


def _bush(spec: dict, root) -> None:
    params = spec["parameters"]
    rng = seeded_rng(spec["seed"])
    lod_index = spec.get("_lodIndex", 0)
    leaves, shadow, flower = spec["palette"]
    crown_phase = rng.uniform(-0.24, 0.24)
    for index in range(params["clusters"]):
        angle = index * 2.39996 + crown_phase + rng.uniform(-0.18, 0.18)
        radius = (0.16 + 0.36 * (index % 3) / 2) * rng.uniform(0.90, 1.10)
        _leaf_mass(
            f"bush_cluster_{index:02d}",
            (math.cos(angle) * radius, math.sin(angle) * radius * 0.75, 0.43 + 0.11 * (index % 2) + rng.uniform(-0.025, 0.025)),
            (0.62 + rng.uniform(-0.08, 0.08), 0.52 * rng.uniform(0.94, 1.06), 0.47 * rng.uniform(0.94, 1.05)),
            shadow if index == 0 else leaves, root, subdivisions=1 if lod_index else 2,
            rotation=(rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2), angle),
        normal_mode="rounded")
    for index in range(params["flowerCount"]):
        cluster_angle = crown_phase + (index % 2) * math.pi + rng.uniform(-0.26, 0.26)
        angle = cluster_angle + rng.uniform(-0.30, 0.30)
        radius = (0.26 + 0.30 * ((index * 3) % 5) / 4) * rng.uniform(0.90, 1.08)
        add_ico(
            f"bush_flower_{index:02d}",
            (math.cos(angle) * radius, math.sin(angle) * radius * 0.72, 0.68 + 0.12 * (index % 3)),
            (0.07, 0.07, 0.055), flower, root, subdivisions=1,
        normal_mode="rounded")
    for index in range(params["leafTips"]):
        angle = index * 2.39996 + 0.4
        add_tri_prism(
            f"bush_leaf_tip_{index:02d}",
            (math.cos(angle) * 0.68, math.sin(angle) * 0.52, 0.42 + 0.12 * (index % 3)),
            (0.16, 0.08, 0.26), leaves, root, rotation=(math.pi / 2, 0, angle),
        )


def bush(spec: dict, root) -> None:
    def reduce(parameters: dict) -> None:
        parameters["clusters"] = max(3, round(parameters["clusters"] * 0.60))
        parameters["flowerCount"] = max(3, round(parameters["flowerCount"] * 0.45))
        parameters["leafTips"] = max(3, round(parameters["leafTips"] * 0.50))

    _build_tree_lods(spec, root, _bush, reduce)


def _reeds(spec: dict, root) -> None:
    params = spec["parameters"]
    rng = seeded_rng(spec["seed"])
    lod_index = spec.get("_lodIndex", 0)
    stalk_token, tip_token = spec["palette"]
    count = params["stalks"]
    clump_phase = rng.uniform(-0.24, 0.24)
    for index in range(count):
        angle = index * 2.39996 + clump_phase + rng.uniform(-0.14, 0.14)
        radius = (0.08 + 0.34 * ((index * 5) % count) / max(1, count - 1)) * rng.uniform(0.92, 1.08)
        x, y = math.cos(angle) * radius, math.sin(angle) * radius * 0.72
        height = params["height"] * rng.uniform(0.72, 1.0)
        lean = rng.uniform(0.08, 0.18)
        lean_angle = angle + rng.uniform(-0.46, 0.46)
        lean_x, lean_y = math.cos(lean_angle) * lean, math.sin(lean_angle) * lean
        add_beam(
            f"reed_stalk_{index:02d}", (x, y, 0), (x + lean_x, y + lean_y, height),
            0.018, stalk_token, root, vertices=4 if lod_index else 5,
        )
        add_cylinder(
            f"reed_tip_{index:02d}", (x + lean_x, y + lean_y, height - 0.09),
            0.035, 0.22, tip_token, root, vertices=5 if lod_index else 6,
        )
    for index in range(params["bladeCount"]):
        angle = index * math.tau / params["bladeCount"] + rng.uniform(-0.18, 0.18)
        radius = 0.18 + 0.12 * (index % 2)
        base=(math.cos(angle)*radius*.45,math.sin(angle)*radius*.4,.005)
        h=params["height"]*(.58+.07*(index%3))
        blade=add_leaf_blade(f"reed_blade_{index:02d}",base,
            (base[0]+math.cos(angle)*.28,base[1]+math.sin(angle)*.25,h),
            .075,stalk_token,root,stations=3 if not lod_index else 2,
            thickness=.004,cup=.28,bend=(0,0,h*.18))
        set_surface_normals(blade,"planar")


def reeds(spec: dict, root) -> None:
    def reduce(parameters: dict) -> None:
        parameters["stalks"] = max(6, round(parameters["stalks"] * 0.55))
        parameters["bladeCount"] = max(3, round(parameters["bladeCount"] * 0.50))

    _build_tree_lods(spec, root, _reeds, reduce)


def kelp_clump(spec: dict, root) -> None:
    """Build a low-tide kelp clump with connected, faceted fronds."""
    params = spec["parameters"]
    rng = seeded_rng(spec["seed"])
    stalk_token, blade_token, shadow_token = spec["palette"]
    fronds = params["fronds"]
    for index in range(fronds):
        angle = index * math.tau / fronds + rng.uniform(-0.16, 0.16)
        radius = params["spread"] * (0.28 + 0.58 * ((index * 3) % fronds) / max(1, fronds - 1))
        base = (math.cos(angle) * radius, math.sin(angle) * radius * 0.72, 0.035)
        height = params["height"] * rng.uniform(0.74, 1.0)
        lean = rng.uniform(0.12, 0.28)
        lean_x, lean_y = lean, lean * .22
        mid = (base[0] + lean_x * 0.42, base[1] + lean_y * 0.42, height * 0.48)
        tip = (base[0] + lean_x, base[1] + lean_y, height)
        add_limb_tube(f"kelp_stalk_{index:02d}", [base, mid, tip],
                       [params["stalkRadius"], params["stalkRadius"] * .68, params["stalkRadius"] * .20], stalk_token, root, sides=5)
        # Triangular prisms scattered around a stalk read as shards of glass.
        # Kelp is a ribbon: long, tapered and curving up off the stipe.
        blade_lean = (math.cos(angle) * 0.22, math.sin(angle) * 0.22)
        add_leaf_blade(
            f"kelp_blade_lower_{index:02d}",
            (mid[0], mid[1], mid[2] - height * 0.04),
            (mid[0] + blade_lean[0], mid[1] + blade_lean[1], mid[2] + height * 0.42),
            params["bladeWidth"] * 0.80,
            blade_token,
            root,
            thickness=0.014,
            cup=0.38,
            bend=(blade_lean[0] * 0.55, blade_lean[1] * 0.55, -height * 0.05),
            stations=4,
        )
        add_leaf_blade(
            f"kelp_blade_upper_{index:02d}",
            (tip[0], tip[1], tip[2] - height * 0.14),
            (tip[0] + blade_lean[0] * 1.15, tip[1] + blade_lean[1] * 1.15, tip[2] + height * 0.34),
            params["bladeWidth"],
            shadow_token if index % 2 else blade_token,
            root,
            thickness=0.014,
            cup=0.38,
            bend=(blade_lean[0] * 0.7, blade_lean[1] * 0.7, -height * 0.04),
            stations=4,
        )


def _add_bent_grass_blade(
    name: str,
    base: tuple[float, float, float],
    height: float,
    width: float,
    facing_angle: float,
    lean_angle: float,
    lean_amount: float,
    token: str,
    root,
) -> None:
    """A planted crease rises to its shoulder before the fine tip turns down."""
    axis=Vector((math.cos(lean_angle),math.sin(lean_angle),0))
    side=Vector((-math.sin(facing_angle),math.cos(facing_angle),0))
    base=Vector(base)
    centers=[base,base+axis*lean_amount*.18+Vector((0,0,height*.52)),
             base+axis*lean_amount*.67+Vector((0,0,height*.96))]
    tip=base+axis*lean_amount+Vector((0,0,height*.85))
    widths=(width*.11,width*.47,width*.17)
    verts=[]
    for i,(center,w) in enumerate(zip(centers,widths)):
        tangent=((centers+[tip])[i+1]-center).normalized()
        normal=tangent.cross(side).normalized()
        for offset in (-side*w,normal*w*.32,side*w,-normal*min(.003,width*.03)):
            verts.append(tuple(center+offset-base))
    verts.append(tuple(tip-base))
    faces=[(0,3,2,1)]
    for ring in range(2):
        for j in range(4):
            a,b=ring*4+j,ring*4+(j+1)%4
            faces.append((a,b,b+4,a+4))
    faces.extend((8+j,8+(j+1)%4,12) for j in range(4))
    _build_mesh(name,base,verts,faces,token,root,recalc_normals=True)


def _grass_patch(spec: dict, root) -> None:
    """A meadow tile of slender, curving blades on distributed roots.

    Each blade turns its broad face toward its own lean, so the curve reads
    from the side instead of edge-on as a spike. The section stays a shallow
    fold that is narrowest at the root, widest low on the blade and drawn to a
    fine tip, and it is tagged foliage so the export smooths light across the
    fold and bends it toward the sky instead of splitting it into grey and
    black facets. Taller meadow
    tiles also raise a few seed-head stems above the blades.
    """
    params = spec["parameters"]
    rng = seeded_rng(spec["seed"])
    primary, accent = spec["palette"]
    blade_count = params["bladeCount"]
    lod_index = spec.get("_lodIndex", 0)
    gesture_angle = rng.uniform(-math.pi, math.pi)
    up = Vector((0, 0, 1))
    for index in range(blade_count):
        angle = index * 2.399963 + rng.uniform(-0.30, 0.30)
        radius = params["spread"] * math.sqrt((index + .5) / blade_count) * rng.uniform(.82, 1.02)
        base = Vector((math.cos(angle) * radius, math.sin(angle) * radius * .86, 0))
        height = params["height"] * rng.uniform(.58, 1.0)
        width = params["bladeWidth"] * rng.uniform(.75, 1.12)
        lean_angle = gesture_angle + rng.uniform(-.85, .85)
        lean_ratio = rng.uniform(.35, .68)
        twist = rng.uniform(-.35, .35)
        if lod_index:
            if index % 3 != 0:
                continue
            width *= 1.7
        forward = Vector((math.cos(lean_angle), math.sin(lean_angle), 0))
        side = (Vector((-forward.y, forward.x, 0)) * math.cos(twist) + forward * math.sin(twist)).normalized()
        fold = up.cross(side).normalized()
        lean = height * lean_ratio
        # The blade keeps its length as it bends, so the tip drops as it leans.
        shoulder = forward * lean * .16 + Vector((0, 0, height * .46))
        tip = forward * lean + Vector((0, 0, height * math.sqrt(max(.25, 1 - lean_ratio * lean_ratio * .8))))
        vertices = []
        for center, half_width in ((Vector((0, 0, 0)), width * .3), (shoulder, width * .44)):
            vertices.extend(tuple(center + offset) for offset in (
                -side * half_width, fold * width * .06, side * half_width))
        vertices.append(tuple(tip))
        faces = [(0, 2, 1), (0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5),
                 (3, 4, 6), (4, 5, 6), (5, 3, 6)]
        _build_mesh(f"grass_blade_{index:02d}", base, vertices, faces,
                    accent if index % 7 == 0 else primary, root,
                    recalc_normals=True, normal_mode="foliage")
    if params["height"] >= .35:
        _add_meadow_seed_heads(params, gesture_angle, 1 if lod_index else 4, primary, accent, rng, root)
    consolidate_lod_level(root, f"{spec['id']}_cluster")


def _add_meadow_seed_heads(params, gesture_angle, count, stem_token, head_token, rng, root) -> None:
    """Thin stems carrying spindle seed heads just above the blades of a tall tile."""
    for index in range(count):
        angle = index * 2.399963 * 1.7 + rng.uniform(-.4, .4)
        radius = params["spread"] * rng.uniform(.15, .7)
        base = Vector((math.cos(angle) * radius, math.sin(angle) * radius * .86, -.01))
        stem_height = params["height"] * rng.uniform(1.04, 1.2)
        lean_angle = gesture_angle + rng.uniform(-.5, .5)
        forward = Vector((math.cos(lean_angle), math.sin(lean_angle), 0))
        lean = stem_height * rng.uniform(.1, .24)
        mid = base + forward * lean * .3 + Vector((0, 0, stem_height * .55))
        top = base + forward * lean + Vector((0, 0, stem_height * .82))
        add_limb_tube(f"meadow_stem_{index:02d}", [tuple(base), tuple(mid), tuple(top)],
                      [.0045, .0035, .0028], stem_token, root, sides=3)
        head = top + forward * lean * .05
        span = stem_height * .18
        spindle = .011
        add_lofted_form(f"meadow_seed_head_{index:02d}", [
            ((head.x, head.y, head.z - span * .1), spindle * .45, spindle * .45),
            ((head.x + forward.x * lean * .05, head.y + forward.y * lean * .05, head.z + span * .45), spindle, spindle),
            ((head.x + forward.x * lean * .1, head.y + forward.y * lean * .1, head.z + span), spindle * .25, spindle * .25)
        ], head_token, root, sides=4)


def grass_clump(spec: dict, root) -> None:
    # Keep the same seeded roots at both levels; only the distant blade subset changes.
    _build_tree_lods(spec, root, _grass_patch, lambda parameters: None)


def wildflower_clump(spec: dict, root) -> None:
    params = spec["parameters"]
    rng = seeded_rng(spec["seed"])
    foliage, flower, center = spec["palette"]
    gesture_angle = rng.uniform(-math.pi, math.pi)
    for index in range(params["stemCount"]):
        angle = index * 2.39996 + rng.uniform(-0.16, 0.16)
        radius = params["spread"] * (0.18 + 0.68 * ((index * 5) % params["stemCount"]) / max(1, params["stemCount"] - 1))
        height = params["height"] * rng.uniform(0.62, 1.0)
        x = math.cos(angle) * radius
        y = math.sin(angle) * radius * 0.82
        lean_angle = gesture_angle + rng.uniform(-0.62, 0.62)
        joint = (
            x + math.cos(lean_angle) * height * 0.055,
            y + math.sin(lean_angle) * height * 0.055,
            height * 0.50,
        )
        tip = (
            x + math.cos(lean_angle) * height * rng.uniform(0.10, 0.17),
            y + math.sin(lean_angle) * height * rng.uniform(0.10, 0.17),
            height,
        )
        add_limb_tube(f"flower_stem_{index:02d}", [(x, y, .01), joint, tip], [.016, .011, .006], foliage, root, sides=4)
        x, y = tip[0], tip[1]
        petal_count = params["petals"]
        size = .095 * rng.uniform(.88,1.1)
        for petal in range(petal_count):
            theta = petal*math.tau/petal_count+angle*.16
            dx,dy=math.cos(theta),math.sin(theta)
            petal_obj=add_leaf_blade(f"flower_{index}_petal_{petal}",
                (x+dx*.012,y+dy*.012,height),
                (x+dx*size,y+dy*size,height+size*(.18+.16*math.sin(theta+angle))),
                size*.76,flower,root,stations=2,thickness=.004,cup=.30,
                bend=(0,0,-size*.12))
            set_surface_normals(petal_obj,"planar")
        add_ico(f"flower_{index}_center",(x,y,height+.009),(.025,.025,.017),
                center,root,subdivisions=1)
        leaf_angle=angle+1.1
        add_leaf_blade(f"flower_stem_leaf_{index}",joint,
            (joint[0]+math.cos(leaf_angle)*.11,joint[1]+math.sin(leaf_angle)*.09,joint[2]+.065),
            .07,foliage,root,stations=2,thickness=.003)
    for leaf_index in range(3):
        leaf_angle = gesture_angle + (-1.05, 0.22, 1.18)[leaf_index] + rng.uniform(-0.16, 0.16)
        leaf_height = params["height"] * rng.uniform(0.30, 0.42)
        leaf_radius = params["spread"] * rng.uniform(0.08, 0.24)
        _add_bent_grass_blade(
            f"flower_ground_leaf_{leaf_index:02d}",
            (math.cos(leaf_angle) * leaf_radius, math.sin(leaf_angle) * leaf_radius, 0.004),
            leaf_height,
            params["spread"] * rng.uniform(0.17, 0.23),
            leaf_angle,
            leaf_angle,
            leaf_height * rng.uniform(0.72, 0.90),
            foliage,
            root,
        )
    consolidate_lod_level(root, f"{spec['id']}_cluster")


def _add_daisy_petals(name, center, radius: float, token: str, parent, rotation: float) -> None:
    """Six closed four-face petals keep tiny meadow instances inexpensive."""
    vertices, faces = [], []
    for petal in range(6):
        angle=rotation+petal*math.tau/6
        d=(math.cos(angle),math.sin(angle)); side=(-d[1],d[0])
        start=len(vertices)
        for reach,across,z in ((.10,0,-.035),(.54,.30,.035),(1,0,.13),(.54,-.30,.035)):
            vertices.append((center[0]+d[0]*radius*reach+side[0]*radius*across,
                             center[1]+d[1]*radius*reach+side[1]*radius*across,
                             center[2]+radius*z))
        faces.extend(tuple(start+i for i in face) for face in ((0,2,1),(0,3,2),(0,1,3),(1,2,3)))
    _build_mesh(name,(0,0,0),vertices,faces,token,parent,recalc_normals=True)


def flower_drift(spec: dict, root) -> None:
    """Instance-efficient chamomile/daisy mat with broad petals and raised centers."""
    params = spec["parameters"]
    rng = seeded_rng(spec["seed"])
    foliage, flower, center = spec["palette"]
    gesture_angle = rng.uniform(-math.pi, math.pi)
    blossom_count = params["blossomCount"]
    cluster_count = min(3, blossom_count)
    for index in range(blossom_count):
        cluster_index = index % cluster_count
        local_index = index // cluster_count
        cluster_angle = gesture_angle + cluster_index * math.tau / cluster_count + rng.uniform(-0.24, 0.24)
        angle = cluster_angle + rng.uniform(-0.34, 0.34)
        radius = params["spread"] * (0.26 + 0.21 * local_index) * rng.uniform(0.88, 1.12)
        height = params["height"] * rng.uniform(0.48, 0.90)
        x = math.cos(angle) * radius
        y = math.sin(angle) * radius * 0.78
        lean = gesture_angle + rng.uniform(-0.48, 0.48)
        tip = (
            x + math.cos(lean) * height * 0.12,
            y + math.sin(lean) * height * 0.12,
            height,
        )
        add_tapered_beam(
            f"drift_stem_{index:02d}",
            (x, y, 0.008),
            tip,
            0.012,
            0.006,
            foliage,
            root,
            vertices=4,
        )
        size = params["blossomSize"]
        petal_rotation = angle * 0.12 + rng.uniform(-0.18, 0.18)
        _add_daisy_petals(
            f"drift_petals_{index:02d}",
            (tip[0], tip[1], tip[2] + size * 0.05),
            size,
            flower,
            root,
            petal_rotation,
        )
        add_box(
            f"drift_center_{index:02d}",
            (tip[0], tip[1], tip[2] + size * 0.10),
            (size * 0.38, size * 0.38, size * 0.22),
            center,
            root,
            rotation=(0.0, 0.0, petal_rotation),
            bevel=0.0,
        )
    for leaf_index in range(2):
        leaf_angle = gesture_angle + (-0.9, 1.1)[leaf_index]
        _add_bent_grass_blade(
            f"drift_leaf_{leaf_index:02d}",
            (math.cos(leaf_angle) * params["spread"] * 0.18, math.sin(leaf_angle) * params["spread"] * 0.16, 0.004),
            params["height"] * rng.uniform(0.28, 0.4),
            params["spread"] * 0.16,
            leaf_angle,
            leaf_angle,
            params["height"] * 0.22,
            foliage,
            root,
        )
    consolidate_lod_level(root, f"{spec['id']}_cluster")
