"""Tree and foliage generators authored so growth reads as growth.

The rule every builder here follows: a canopy is carried by the branches that
reach into it, branch tips stay inside the leaf mass, and the crown's centre of
mass sits over the root flare. Nothing floats and nothing tops out in bare
sticks poking through the leaves.
"""

from __future__ import annotations

import math

from mathutils import Vector

from common.geometry import (
    add_beam,
    add_box,
    add_collision_primitives,
    add_cone,
    add_cylinder,
    add_ico,
    add_limb_tube,
    add_tapered_beam,
    add_tri_prism,
    add_leaf_blade,
    _build_mesh,
    set_surface_normals,
    seeded_rng,
)
from common.authored import add_tree_buttresses, add_canopy_lobe, add_conifer_tier
from .crops import _add_folded_leaf, _add_sunflower_head

GOLDEN_ANGLE = 2.39996322972865332


def _tapered_trunk(prefix, base_radius, top_radius, height, lean, token, root, *, sections=3, vertices=7):
    """Build a trunk as connected tapered sections with a gentle authored lean."""
    joints = []
    for index in range(sections + 1):
        t = index / sections
        # Lean accumulates with height, so the base stays planted.
        joints.append((math.sin(lean) * height * t * t, 0.0, height * t))
    add_limb_tube(prefix, joints, [base_radius + (top_radius - base_radius) * i / sections for i in range(sections + 1)], token, root, sides=vertices)
    return joints[-1]


def _canopy_blob(name, center, scale, token, root, *, rng, subdivisions=2):
    obj = add_canopy_lobe(name, center, scale, token, root,
        seed=rng.randrange(1_000_000), detail=int(subdivisions > 1),
        rotation=(rng.uniform(-.2,.2),rng.uniform(-.2,.2),rng.uniform(0,math.pi)))
    set_surface_normals(obj, "foliage")
    return obj


def broadleaf_oak(spec: dict, root) -> None:
    """Wide oak: buttressed base, forked limbs, and a crown carried on those limbs."""
    leaf, highlight, shadow, bark = spec["palette"]
    rng = seeded_rng(spec["seed"])
    height = 6.60
    spread = 1.58
    # An oak reads wider across than deep, so the crown is compressed on Y.
    depth_bias = 0.70
    trunk_h = height * 0.42

    add_tree_buttresses("oak_root", (0, 0, 0.0), 0.62, 0.46, bark, root, count=6, seed=spec["seed"] + 3)
    top = _tapered_trunk("oak_trunk", 0.42, 0.24, trunk_h, math.radians(3.0), bark, root, sections=3)

    # Four primary limbs, each ending inside the leaf mass it supports.
    canopy_center_z = trunk_h + height * 0.24
    limb_tips = []
    for index in range(4):
        angle = index * math.tau / 4 + 0.4
        reach = spread * rng.uniform(0.78, 1.0)
        tip = (
            top[0] + math.cos(angle) * reach,
            math.sin(angle) * reach * depth_bias,
            trunk_h + height * rng.uniform(0.14, 0.26),
        )
        add_tapered_beam(f"oak_limb_{index}", (top[0], 0, trunk_h - 0.10), tip, 0.19, 0.075, bark, root, vertices=6)
        limb_tips.append(tip)
        # One fork per limb, still buried in the canopy.
        fork_angle = angle + rng.choice((-0.7, 0.7))
        fork = (
            tip[0] + math.cos(fork_angle) * reach * 0.34,
            tip[1] + math.sin(fork_angle) * reach * 0.34 * depth_bias,
            tip[2] + rng.uniform(0.30, 0.62),
        )
        add_tapered_beam(f"oak_fork_{index}", tip, fork, 0.070, 0.032, bark, root, vertices=6)
        limb_tips.append(fork)
    # Central leader continues into the crown so the top is leaves, not a bare stick.
    crown_tip = (top[0] + 0.10, 0.0, trunk_h + height * 0.30)
    add_tapered_beam("oak_leader", (top[0], 0, trunk_h - 0.10), crown_tip, 0.16, 0.055, bark, root, vertices=6)
    limb_tips.append(crown_tip)

    # Leaf clusters sit on the limb tips, so every mass has something holding it.
    tokens = (leaf, highlight, leaf, shadow)
    for index, tip in enumerate(limb_tips):
        radius = rng.uniform(0.82, 1.06)
        _canopy_blob(
            f"oak_canopy_{index:02d}",
            (tip[0] * 0.92, tip[1] * 0.92, tip[2] + radius * 0.42),
            (radius, radius * rng.uniform(0.72, 0.86), radius * rng.uniform(0.62, 0.78)),
            tokens[index % 4], root, rng=rng,
        )
    # A shadowed under-layer gives the crown depth from below.
    for index in range(3):
        angle = index * math.tau / 3 + 0.9
        _canopy_blob(
            f"oak_canopy_under_{index}",
            (top[0] + math.cos(angle) * spread * 0.58, math.sin(angle) * spread * 0.58 * depth_bias, canopy_center_z - 0.52),
            (0.86, 0.64, 0.46), shadow, root, rng=rng,
        )
    _canopy_blob("oak_canopy_crown", (top[0] + 0.05, 0.0, canopy_center_z + 0.58), (1.10, 0.86, 0.72), highlight, root, rng=rng)
    add_collision_primitives(spec, root)


def maple_tree(spec: dict, root) -> None:
    """Upright maple: a single leader, tiered limbs, and an egg-shaped autumn crown."""
    olive, ochre, shadow, bark = spec["palette"]
    rng = seeded_rng(spec["seed"])
    height = 7.10
    spread = 1.48

    add_tree_buttresses("maple_root", (0, 0, 0.0), 0.44, 0.36, bark, root, count=5, seed=spec["seed"] + 7)
    # A maple keeps a dominant leader all the way up: the trunk runs into the crown.
    leader_h = height * 0.78
    leader_top = _tapered_trunk("maple_trunk", 0.29, 0.075, leader_h, math.radians(2.0), bark, root, sections=4)

    tips = []
    tiers = ((0.40, 1.00, 3), (0.56, 0.86, 3), (0.70, 0.58, 3))
    for tier_index, (fraction, reach_scale, count) in enumerate(tiers):
        base_z = height * fraction
        base_x = math.sin(math.radians(2.0)) * leader_h * (base_z / leader_h) ** 2
        for index in range(count):
            angle = (tier_index * 1.1) + index * math.tau / count + rng.uniform(-0.16, 0.16)
            reach = spread * reach_scale * rng.uniform(0.84, 1.0)
            tip = (
                base_x + math.cos(angle) * reach,
                math.sin(angle) * reach,
                base_z + reach * 0.72,
            )
            add_tapered_beam(
                f"maple_limb_{tier_index}_{index}", (base_x, 0, base_z), tip,
                0.105 - tier_index * 0.022, 0.036, bark, root, vertices=6,
            )
            tips.append(tip)
    tips.append((leader_top[0], 0.0, leader_h + 0.10))

    # Crown built as an upright ovoid around the leader, autumn tones on the sunlit side.
    for index, tip in enumerate(tips):
        radius = rng.uniform(0.62, 0.86)
        # Autumn colour grows in contiguous canopy regions, not alternating beads.
        warm_patch = tip[2] > height * .72 or (tip[0] > spread * .24 and tip[1] < spread * .28)
        token = ochre if warm_patch else olive
        _canopy_blob(
            f"maple_canopy_{index:02d}",
            (tip[0] * 0.88, tip[1] * 0.88, tip[2] + radius * 0.34),
            (radius, radius * rng.uniform(0.88, 1.02), radius * rng.uniform(0.86, 1.10)),
            token, root, rng=rng,
        )
    for index in range(3):
        angle = index * math.tau / 3 + 0.5
        _canopy_blob(
            f"maple_canopy_under_{index}",
            (math.cos(angle) * spread * 0.52, math.sin(angle) * spread * 0.52, height * 0.44),
            (0.74, 0.70, 0.50), shadow, root, rng=rng,
        )
    _canopy_blob("maple_canopy_apex", (0.02, 0.0, height - 0.62), (0.86, 0.82, 0.78), ochre, root, rng=rng)
    add_collision_primitives(spec, root)


def tall_pine(spec: dict, root) -> None:
    """Conical conifer: bare lower bole, tiers narrowing upward, one clean spire."""
    pine, shadow, sage, bark = spec["palette"]
    rng = seeded_rng(spec["seed"])
    height = 8.60
    spread = 1.62

    add_tree_buttresses("pine_root", (0, 0, 0.0), 0.42, 0.34, bark, root, count=5, seed=spec["seed"] + 5)
    trunk_tip = _tapered_trunk("pine_trunk", 0.28, 0.055, height * 0.94, math.radians(1.2), bark, root, sections=4)

    # Tiers shrink and lift as they climb; the lowest sits above the bare bole.
    tiers = 9
    base_fraction = 0.22
    for tier in range(tiers):
        t = tier / (tiers - 1)
        z = height * (base_fraction + (0.94 - base_fraction) * t)
        radius = spread * (1.0 - t) ** 0.82 + 0.16
        token = pine if tier % 3 != 2 else (sage if tier % 2 else shadow)
        add_conifer_tier(f"pine_tier_{tier:02d}",(0,0,z+radius*.25),radius,radius*1.3,
                         pine if tier<7 else sage,root,seed=spec["seed"]+tier*17)
        # Drooping branch tips at the widest tiers break the cone into needles.
        if radius > 0.75:
            for index in range(3):
                angle = index * math.tau / 3 + tier * GOLDEN_ANGLE
                add_tapered_beam(
                    f"pine_branch_{tier:02d}_{index}", (0, 0, z + 0.06),
                    (math.cos(angle) * radius * .72, math.sin(angle) * radius * .72, z - 0.14),
                    0.035, 0.014, bark, root, vertices=5,
                )
    # The leader overlaps the last broad tier and follows the leaning bole.
    add_cone("pine_spire", (trunk_tip[0], 0, height - 0.90), 0.56, 0.02, 1.80, pine, root, vertices=7)
    add_collision_primitives(spec, root)


def young_pine(spec: dict, root) -> None:
    """Sapling conifer: skirted to the ground, soft tip, no bare trunk showing."""
    pine, shadow, sage, bark = spec["palette"]
    rng = seeded_rng(spec["seed"])
    height = 2.86
    spread = 0.82

    trunk_tip = _tapered_trunk("sapling_trunk", 0.09, 0.028, height * 0.90, math.radians(2.6), bark, root, sections=3, vertices=6)
    tiers = 8
    for tier in range(tiers):
        t = tier / (tiers - 1)
        z = height * (0.10 + 0.80 * t)
        radius = spread * (1.0 - t) ** 0.72 + 0.10
        token = pine if tier % 2 == 0 else (sage if tier % 4 == 1 else shadow)
        add_conifer_tier(f"sapling_tier_{tier}",(0,0,z+radius*.25),radius,radius*1.20,
                         pine if tier<6 else sage,root,seed=spec["seed"]+tier*19)
    add_cone("sapling_leader", (trunk_tip[0], 0, height - 0.30), 0.22, 0.015, 0.60, sage, root, vertices=6)


def dead_tree(spec: dict, root) -> None:
    """Standing snag: snapped top, stubbed limbs that taper to points, moss at the base."""
    weathered, dark, moss = spec["palette"]
    rng = seeded_rng(spec["seed"])
    height = 4.55

    add_tree_buttresses("snag_root", (0, 0, 0.0), 0.48, 0.40, dark, root, count=6, seed=spec["seed"] + 2)
    top = _tapered_trunk("snag_trunk", 0.34, 0.13, height, math.radians(6.0), weathered, root, sections=4)
    # A snapped crown, not a clean cut: the reason there is no canopy.
    add_cone("snag_break", (top[0], 0, height + 0.14), 0.135, 0.030, 0.30, dark, root, vertices=6,
             rotation=(rng.uniform(-0.18, 0.18), rng.uniform(-0.18, 0.18), 0))

    for index in range(6):
        fraction = 0.42 + index * 0.095
        base_z = height * fraction
        base_x = math.sin(math.radians(6.0)) * height * fraction * fraction
        angle = index * GOLDEN_ANGLE
        reach = rng.uniform(0.55, 1.35) * (1.15 - fraction)
        # Dead limbs sag, they do not reach upward.
        tip = (base_x + math.cos(angle) * reach, math.sin(angle) * reach, base_z + rng.uniform(-0.10, 0.34))
        add_tapered_beam(f"snag_limb_{index}", (base_x, 0, base_z), tip, 0.105, 0.025, weathered, root, vertices=5)
        if index % 2 == 0:
            snap = (tip[0] + math.cos(angle + 0.6) * 0.28, tip[1] + math.sin(angle + 0.6) * 0.28, tip[2] - 0.16)
            add_tapered_beam(f"snag_twig_{index}", tip, snap, 0.025, 0.009, dark, root, vertices=5)

    for index in range(4):
        angle = index * math.tau / 4 + 0.6
        add_ico(
            f"snag_moss_{index}", (math.cos(angle) * 0.30, math.sin(angle) * 0.30, 0.10 + index * 0.14),
            (0.16, 0.14, 0.09), moss, root, rotation=(0, 0, angle),
        normal_mode="rounded")
    add_box("snag_bark_scar", (-0.12, -0.16, height * 0.30), (0.065, 0.035, 0.72), dark, root,
            rotation=(0, math.radians(6), 0), bevel=0.0)


def cattail_reeds(spec: dict, root) -> None:
    """Reed clump: arching blades plus three seed heads on their own stems."""
    olive, sage, brown, yellow = spec["palette"]
    rng = seeded_rng(spec["seed"])

    add_ico("cattail_base_mud", (0, 0, 0.025), (0.11, 0.09, 0.018), brown, root, normal_mode="rounded")
    for index in range(9):
        angle = index * GOLDEN_ANGLE
        lean = rng.uniform(0.10, 0.34)
        height = rng.uniform(0.62, 1.02)
        base = (math.cos(angle) * 0.05, math.sin(angle) * 0.04, 0.02)
        tip = (base[0] + math.cos(angle) * lean * 0.40, base[1] + math.sin(angle) * lean * 0.30, height)
        tip=(base[0]+math.cos(angle)*lean*.62,base[1]+math.sin(angle)*lean*.52,height)
        blade=add_leaf_blade(f"cattail_blade_{index:02d}",base,tip,.046,
            olive if index%3 else sage,root,stations=3,thickness=.003,cup=.28,
            bend=(0,0,height*.18))
        set_surface_normals(blade,"planar")

    for index in range(3):
        angle = index * 2.1 + 0.4
        stem_h = (1.06, 1.14, 0.94)[index]
        sx, sy = math.cos(angle) * 0.045, math.sin(angle) * 0.035
        tip = (sx + math.cos(angle) * 0.05, sy + math.sin(angle) * 0.04, stem_h)
        add_tapered_beam(f"cattail_stem_{index}", (sx, sy, 0.02), tip, 0.014, 0.010, olive, root, vertices=6)
        # The sausage head sits on top of its stem and the stem continues past it.
        add_cylinder(f"cattail_head_{index}", (tip[0], tip[1], stem_h + 0.075), 0.030, 0.15, brown, root,
                     vertices=7, bevel=0.010)
        add_cone(f"cattail_head_cap_{index}", (tip[0], tip[1], stem_h + 0.165), 0.030, 0.008, 0.045, brown, root, vertices=6)
        add_tapered_beam(
            f"cattail_spike_{index}", (tip[0], tip[1], stem_h + 0.17),
            (tip[0] + 0.010, tip[1], stem_h + 0.30), 0.008, 0.003, yellow, root, vertices=5,
        )


def lily_pad_cluster(spec: dict, root) -> None:
    """Floating pads with the notch every lily pad has, plus one open bloom."""
    leaf, shadow, cream, ochre = spec["palette"]
    rng = seeded_rng(spec["seed"])

    pads = ((0.0, 0.0, 0.145), (0.19, -0.11, 0.105), (-0.16, 0.13, 0.088), (0.05, 0.20, 0.070))
    for index, (px, py, radius) in enumerate(pads):
        yaw = rng.uniform(0, math.tau)
        # The outline returns to the petiole so the wedge is empty water.
        outline=[(radius*.12,0)]
        for step in range(12):
            a=.30+(math.tau-.60)*step/11
            r=radius*(1+.055*math.sin(step*1.7+index))
            outline.append((math.cos(a)*r,math.sin(a)*r*.93))
        verts=[]
        for z in (.006,.015):
            for x,y in outline:
                verts.append((px+math.cos(yaw)*x-math.sin(yaw)*y,
                              py+math.sin(yaw)*x+math.cos(yaw)*y,z))
        n=len(outline)
        faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]
        faces.extend((j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n))
        _build_mesh(f"lily_pad_{index}",(0,0,0),verts,faces,leaf,root,recalc_normals=True)
    # One bloom resting open on the surface: a lily flower floats, it does not stand.
    bx, by = 0.19, -0.11
    add_cylinder("lily_bloom_cup", (bx, by, 0.019), 0.030, 0.012, cream, root, vertices=8)
    for index in range(6):
        angle = index * math.tau / 6
        add_tri_prism(
            f"lily_petal_{index}", (bx + math.cos(angle) * 0.040, by + math.sin(angle) * 0.040, 0.020),
            (0.030, 0.055, 0.010), cream, root, rotation=(math.radians(10), 0, angle),
        )
    add_ico("lily_bloom_heart", (bx, by, 0.025), (0.016, 0.016, 0.008), ochre, root, normal_mode="rounded")


def round_bush(spec: dict, root) -> None:
    """Multi-stem shrub: stems fan from one crown and every leaf mass sits on a stem."""
    sage, highlight, shadow, bark = spec["palette"]
    rng = seeded_rng(spec["seed"])
    spread = 0.42

    add_ico("bush_crown", (0, 0, 0.045), (0.13, 0.12, 0.055), bark, root, normal_mode="rounded")
    tips = []
    for index in range(6):
        angle = index * GOLDEN_ANGLE
        reach = spread * rng.uniform(0.55, 0.95)
        tip = (math.cos(angle) * reach, math.sin(angle) * reach * 0.88, rng.uniform(0.26, 0.46))
        add_tapered_beam(f"bush_stem_{index}", (0, 0, 0.03), tip, 0.028, 0.012, bark, root, vertices=5)
        tips.append(tip)

    tokens = (sage, highlight, sage, shadow)
    for index, tip in enumerate(tips):
        radius = rng.uniform(0.19, 0.27)
        _canopy_blob(
            f"bush_mass_{index}", (tip[0] * 0.86, tip[1] * 0.86, tip[2] + radius * 0.46),
            (radius, radius * rng.uniform(0.86, 1.04), radius * rng.uniform(0.70, 0.90)),
            tokens[index % 4], root, rng=rng,
        )
    _canopy_blob("bush_mass_top", (0, 0, 0.54), (0.30, 0.28, 0.20), highlight, root, rng=rng)
    for index in range(3):
        angle = index * math.tau / 3 + 0.7
        _canopy_blob(
            f"bush_mass_skirt_{index}", (math.cos(angle) * 0.25, math.sin(angle) * 0.22, 0.16),
            (0.24, 0.22, 0.13), shadow, root, rng=rng,
        )


def sunflower_stand(spec: dict, root) -> None:
    """Three sunflowers of staggered height, heads nodding off leafy stalks.

    The wild stand reuses the crop family's botanical builders -- the nodding
    head with its petal ring, dark seed disc and receptacle, and the closed
    folded leaf -- so it reads as the same plant as the planted sunflower:
    warm petals round a dark disc, not a pale rosette of shards.
    """
    receptacle, stem, _petal, _disc = spec["palette"]
    rng = seeded_rng(spec["seed"])

    stalks = ((0.0, 0.0, 1.60, 0.13, 2), (-0.24, 0.02, 1.26, 0.115, 1), (0.21, -0.03, 1.02, 0.1, 1))
    for index, (sx, sy, height, head_radius, leaf_count) in enumerate(stalks):
        lean = math.radians(rng.uniform(-6, 6))
        head_x = sx + math.sin(lean) * height
        add_limb_tube(f"sun_stalk_{index}", [
            (sx, sy, 0.012),
            (sx + math.sin(lean) * height * .55, sy, height * .55),
            (head_x, sy, height)
        ], [.026, .02, .015], stem, root, sides=6)
        # Broad leaves spiral up the stalk, rooted on it and drooping at the tip.
        for leaf_index in range(leaf_count):
            t = .3 + leaf_index * .22
            _add_folded_leaf(
                f"sun_leaf_{index}_{leaf_index}",
                (sx + math.sin(lean) * height * t, sy, height * t),
                .2 * (1 - .2 * t), .13 * (1 - .15 * t),
                leaf_index * GOLDEN_ANGLE + index * 1.9,
                receptacle, root, pitch=.36, droop=.3, cup=.25
            )
        # A ripe sunflower never stares straight up; the steep nod keeps the
        # petal ring inside the stand's shallow footprint.
        _add_sunflower_head(
            f"sun_head_{index}", (head_x, sy, height + .02), head_radius,
            spec["palette"], root, petals=10, nod=math.radians(52 + index * 8), dry=False
        )


def mushroom_cluster(spec: dict, root) -> None:
    """Three toadstools of graded size sharing one leaf-litter base."""
    cap, stem, shadow = spec["palette"]
    rng = seeded_rng(spec["seed"])

    add_ico("shroom_litter", (0, 0, 0.014), (0.10, 0.085, 0.012), shadow, root, normal_mode="rounded")
    caps = ((0.0, 0.0, 0.115, 0.075), (-0.075, 0.045, 0.078, 0.052), (0.065, -0.052, 0.055, 0.038))
    for index, (px, py, height, radius) in enumerate(caps):
        add_cone(f"shroom_stem_{index}", (px, py, height * 0.44), radius * 0.36, radius * 0.28, height * 0.88, stem, root, vertices=7)
        add_cylinder(f"shroom_ring_{index}", (px, py, height * 0.66), radius * 0.42, 0.010, stem, root, vertices=7)
        verts,faces=[],[]
        for ring,(r,z) in enumerate(((.34,.77),(.94,.81),(1,.89),(.72,1.13),(.28,1.27))):
            for j in range(8):
                angle=j*math.tau/8
                verts.append((px+math.cos(angle)*radius*r,py+math.sin(angle)*radius*r,
                              height*z+math.sin(angle+index)*height*.045))
        for ring in range(4):
            for j in range(8):
                a,b=ring*8+j,ring*8+(j+1)%8
                faces.append((a,b,b+8,a+8))
        faces.extend((tuple(reversed(range(8))),tuple(range(32,40))))
        _build_mesh(f"shroom_cap_{index}",(0,0,0),verts,faces,cap,root,recalc_normals=True)
        add_cylinder(f"shroom_gills_{index}",(px,py,height*.79),radius*.76,.004,stem,root,vertices=8)
        for spot in range(3):
            angle = spot * 2.1 + index
            add_ico(
                f"shroom_spot_{index}_{spot}",
                (px + math.cos(angle) * radius * 0.46, py + math.sin(angle) * radius * 0.46, height * 1.16),
                (radius * 0.17, radius * 0.17, 0.006), stem, root,
            normal_mode="rounded")


def beach_grass_tuft(spec: dict, root) -> None:
    """Marram tuft: stiff blades splaying from a sand hummock."""
    yellow, olive, sand = spec["palette"]
    rng = seeded_rng(spec["seed"])

    add_ico("marram_hummock", (0, 0, 0.028), (0.12, 0.10, 0.018), sand, root, normal_mode="rounded")
    for index in range(14):
        angle = index * GOLDEN_ANGLE
        height = rng.uniform(0.22, 0.46)
        splay = rng.uniform(0.10, 0.30)
        bx, by = math.cos(angle) * 0.045, math.sin(angle) * 0.042
        blade=add_leaf_blade(f"marram_blade_{index:02d}",(bx,by,.004),
            (bx+math.cos(angle)*splay*.60,by+math.sin(angle)*splay*.60,height),
            .032,yellow if index%3 else olive,root,stations=3,thickness=.0025,
            cup=.35,bend=(0,0,height*.15))
        set_surface_normals(blade,"planar")


def seagrass_tuft(spec: dict, root) -> None:
    """Submerged blades leaning with one current direction, as seagrass does."""
    olive, pine, shadow = spec["palette"]
    rng = seeded_rng(spec["seed"])
    drift = 0.42

    add_ico("seagrass_root_mat", (0, 0, 0.018), (0.09, 0.065, 0.012), shadow, root, normal_mode="rounded")
    for index in range(12):
        angle = index * GOLDEN_ANGLE
        height = rng.uniform(0.24, 0.46)
        bx, by = math.cos(angle) * 0.045, math.sin(angle) * 0.030
        # Every blade bends the same way: one current, not a starburst.
        bend = drift * rng.uniform(0.75, 1.15)
        blade=add_leaf_blade(f"seagrass_blade_{index:02d}",(bx,by,.004),
            (bx+bend*height,by+.035*math.sin(angle),height),.040,
            olive if index%3 else pine,root,stations=3,thickness=.003,cup=.32,
            bend=(-height*.16,0,height*.10))
        set_surface_normals(blade,"planar")


def algae_frond(spec: dict, root) -> None:
    """Holdfast, stipe, and paired blades: a kelp frond built the way kelp grows."""
    pine, olive, shadow = spec["palette"]
    rng = seeded_rng(spec["seed"])
    height = 0.74

    add_ico("frond_holdfast", (0, 0, 0.030), (0.095, 0.080, 0.055), shadow, root, normal_mode="rounded")
    joints = [(0, 0, 0.05), (0.06, 0.02, 0.28), (0.02, -0.03, 0.50), (0.09, 0.01, height)]
    add_limb_tube("frond_stipe", joints, [.020, .016, .012, .008], olive, root, sides=5)
    # Blades come off the stipe in pairs and hang outward from it.
    for index in range(5):
        t = 0.20 + index * 0.17
        segment=min(2,int(t*3))
        base=Vector(joints[segment]).lerp(Vector(joints[segment+1]),t*3-segment)
        for side_index,sign in enumerate((-1,1)):
            angle=index*.85+side_index*math.pi
            end=base+Vector((math.cos(angle)*.23,math.sin(angle)*.18,.045))
            blade=add_leaf_blade(f"frond_blade_{index}_{side_index}",base,end,.075,
                pine if index%2 else olive,root,stations=4,thickness=.004,cup=.40,
                bend=(.02,0,.085))
            set_surface_normals(blade,"planar")
    add_ico("frond_float_bladder", (0.08, 0.0, height - 0.03), (0.035, 0.032, 0.045), olive, root, normal_mode="rounded")
