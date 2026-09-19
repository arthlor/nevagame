"""Character wearables, specialist tools, and crafting-handling props."""

from __future__ import annotations

from common.design_primitives import add_hat_brim, add_draped_panel

import math
import bpy

from common.geometry import (
    add_beam,
    add_box,
    add_cone,
    add_cylinder,
    add_grip_marker,
    add_ico,
    add_ring,
    add_tapered_beam,
    add_tri_prism,
)
from common.authored import add_catenary_rope, add_profiled_vessel


def _anchor(name: str, root):
    node = bpy.data.objects.new(name, None)
    root.users_collection[0].objects.link(node)
    node.parent = root
    return node


def _field_hat(root, cloth: str, trim: str, accent: str) -> None:
    anchor = _anchor("wearable_head_anchor", root)
    add_profiled_vessel(
        "field_hat_crown", (0, 0, 0.02),
        ((0.0, 0.17), (0.12, 0.19), (0.25, 0.145), (0.31, 0.09)),
        0.018, cloth, anchor, sides=12,
    )
    add_hat_brim("field_hat_brim", (0, 0, 0.015), 0.17, 0.365, cloth, anchor)
    add_ring("field_hat_band", (0, 0, 0.13), 0.18, 0.022, trim, anchor,
             major_segments=12, minor_segments=4)
    add_box("field_hat_tie", (0.17, 0.02, 0.12), (0.09, 0.035, 0.14), accent, anchor,
            rotation=(0.12, -0.22, 0.16), bevel=0.008)


def _tidewatch_cap(root, cloth: str, trim: str, accent: str) -> None:
    anchor = _anchor("wearable_head_anchor", root)
    add_profiled_vessel(
        "tidewatch_cap_crown", (0, 0, 0.01),
        ((0.0, 0.16), (0.12, 0.18), (0.22, 0.145), (0.27, 0.055)),
        0.02, cloth, anchor, sides=10,
    )
    add_tri_prism("tidewatch_cap_peak", (0, -0.20, 0.035), (0.28, 0.24, 0.045), trim,
                  anchor, rotation=(math.pi / 2, 0, 0))
    add_ring("tidewatch_cap_band", (0, 0, 0.075), 0.17, 0.018, trim, anchor,
             major_segments=10, minor_segments=4)
    add_box("tidewatch_cap_badge", (0, -0.17, 0.15), (0.075, 0.025, 0.085), accent,
            anchor, bevel=0.01)


def _harvest_apron(root, cloth: str, trim: str, accent: str) -> None:
    anchor = _anchor("wearable_body_anchor", root)
    add_draped_panel("harvest_apron_bib", (0, -0.16, 0.10), (0.44, 0.035, 0.58), cloth, anchor,
            rotation=(0.03, 0, 0), fold=0.006)
    add_draped_panel("harvest_apron_skirt", (0, -0.18, -0.40), (0.58, 0.04, 0.52), cloth, anchor,
            rotation=(0.04, 0, 0), fold=0.007)
    add_catenary_rope("harvest_apron_neck", (-0.18, -0.13, 0.38), (0.18, -0.13, 0.38),
                      -0.18, 0.018, trim, anchor, segments=7, vertices=5)
    add_box("harvest_apron_waist", (0, -0.20, -0.12), (0.72, 0.032, 0.07), trim, anchor,
            bevel=0.012)
    for side, x in (("left", -0.17), ("right", 0.17)):
        add_box(f"harvest_apron_pocket_{side}", (x, -0.225, -0.39),
                (0.23, 0.035, 0.20), accent, anchor, bevel=0.006)
        add_box(f"harvest_apron_pocket_seam_{side}", (x, -0.25, -0.30),
                (0.20, 0.012, 0.018), trim, anchor, bevel=0.003)


def _oilskin_coat(root, cloth: str, trim: str, accent: str) -> None:
    anchor = _anchor("wearable_body_anchor", root)
    add_profiled_vessel(
        "oilskin_coat_shell", (0, 0, -0.47),
        ((0.0, 0.34), (0.28, 0.36), (0.62, 0.31), (0.90, 0.27), (1.08, 0.23)),
        0.045, cloth, anchor, sides=10,
    )
    add_draped_panel("oilskin_coat_front_left", (-0.17, -0.30, -0.18), (0.31, 0.055, 0.82),
            cloth, anchor, fold=0.008)
    add_draped_panel("oilskin_coat_front_right", (0.17, -0.30, -0.18), (0.31, 0.055, 0.82),
            cloth, anchor, fold=0.008)
    add_ring("oilskin_coat_collar", (0, 0, 0.34), 0.22, 0.055, trim, anchor,
             major_segments=10, minor_segments=4)
    for index, z in enumerate((0.19, -0.02, -0.23, -0.44)):
        add_cylinder(f"oilskin_toggle_{index}", (0.0, -0.345, z), 0.018, 0.055,
                     accent, anchor, vertices=6, rotation=(math.pi / 2, 0, 0))


def _boot_pair(root, cloth: str, sole: str, accent: str, deck: bool) -> None:
    for side in ("left", "right"):
        anchor = _anchor(f"wearable_foot_{side}", root)
        add_profiled_vessel(
            f"{side}_boot_shaft", (0, 0, 0.0),
            ((0.0, 0.115), (0.16, 0.12), (0.30, 0.105), (0.38, 0.13)),
            0.025, cloth, anchor, sides=8,
        )
        add_box(f"{side}_boot_foot", (0, -0.105, -0.015), (0.22, 0.36, 0.16), cloth,
                anchor, bevel=0.055)
        add_box(f"{side}_boot_sole", (0, -0.11, -0.105), (0.235, 0.38, 0.055), sole,
                anchor, bevel=0.025)
        if deck:
            for tread in range(3):
                add_box(f"{side}_deck_tread_{tread}", (0, -0.21 + tread * 0.11, -0.14),
                        (0.20, 0.035, 0.025), accent, anchor, bevel=0.004)
        else:
            add_ring(f"{side}_furrow_buckle", (0, 0, 0.22), 0.12, 0.015, accent, anchor,
                     major_segments=8, minor_segments=4)


def wearable_equipment(spec: dict, root) -> None:
    style = spec["parameters"]["style"]
    cloth, trim, accent = spec["palette"][:3]
    if style == "field_hat":
        _field_hat(root, cloth, trim, accent)
    elif style == "tidewatch_cap":
        _tidewatch_cap(root, cloth, trim, accent)
    elif style == "harvest_apron":
        _harvest_apron(root, cloth, trim, accent)
    elif style == "oilskin_coat":
        _oilskin_coat(root, cloth, trim, accent)
    elif style == "furrow_boots":
        _boot_pair(root, cloth, trim, accent, False)
    elif style == "deck_boots":
        _boot_pair(root, cloth, trim, accent, True)
    else:
        raise ValueError(f"Unknown wearable equipment style {style!r}")


def equipment_watering_can(spec: dict, root) -> None:
    metal, dark, accent = spec["palette"][:3]
    style = spec["parameters"]["style"]
    long_spout = style == "long_spout"
    add_grip_marker("tool_primary_grip", (-0.016, 0, 0), root,
                    fingers=(0, -1, 0), contact_normal=(1, 0, 0))
    add_cylinder("equipment_can_handle", (0, 0, 0), 0.016, 0.12, dark, root, vertices=6, bevel=0.003)
    add_profiled_vessel("equipment_can_body", (.17, 0, 0),
                        ((-.11, .10), (-.07, .12), (.07, .115), (.12, .074)),
                        .01, metal, root, sides=10)
    add_beam("equipment_can_arch_a", (0.07, 0, 0.08), (0.15, 0, 0.27), 0.016, dark, root, vertices=6)
    add_beam("equipment_can_arch_b", (0.15, 0, 0.27), (0.27, 0, 0.08), 0.016, dark, root, vertices=6)
    add_cylinder("equipment_can_lid", (0.17, 0, 0.13), 0.075, 0.035, accent, root, vertices=9, bevel=0.005)
    spout_length = 0.46 if long_spout else 0.26
    add_cone("equipment_can_spout", (0.17, -spout_length * 0.56, 0.025),
             0.048, 0.018 if long_spout else 0.025, spout_length, metal, root,
             vertices=9, rotation=(math.pi / 2, 0, 0))
    rose_radius = 0.038 if long_spout else 0.075
    add_cylinder("equipment_can_rose", (0.17, -spout_length - 0.035, 0.025),
                 rose_radius, 0.045, accent, root, vertices=12,
                 rotation=(math.pi / 2, 0, 0), bevel=0.006)
    if not long_spout:
        for index in range(7):
            angle = index * math.tau / 7
            add_cylinder(f"copper_rose_hole_{index}",
                         (0.17 + math.cos(angle) * 0.038, -spout_length - 0.06,
                          0.025 + math.sin(angle) * 0.038),
                         0.006, 0.008, dark, root, vertices=5,
                         rotation=(math.pi / 2, 0, 0))


def equipment_sickle(spec: dict, root) -> None:
    wood, metal, accent = spec["palette"][:3]
    style = spec["parameters"]["style"]
    broad = style == "broad"
    add_grip_marker("tool_primary_grip", (0.05, 0, 0), root,
                    fingers=(0, 1, 0), contact_normal=(-1, 0, 0))
    grip = 0.17
    add_tapered_beam("equipment_sickle_handle", (0, 0, -grip), (0, 0, 0.25),
                     0.028 if broad else 0.025, 0.021, wood, root, vertices=7)
    add_cylinder("equipment_sickle_ferrule", (0, 0, 0.25), 0.03, 0.05, metal, root, vertices=7, bevel=0.004)
    points = (
        [(0.01, 0.29), (0.18, 0.42), (0.39, 0.47), (0.58, 0.40), (0.67, 0.25), (0.57, 0.12)]
        if broad else
        [(0.01, 0.29), (0.14, 0.40), (0.30, 0.45), (0.46, 0.40), (0.54, 0.29), (0.48, 0.18)]
    )
    for index in range(len(points) - 1):
        (x0, z0), (x1, z1) = points[index], points[index + 1]
        span = math.hypot(x1 - x0, z1 - z0)
        add_box(f"equipment_sickle_blade_{index}", ((x0 + x1) * .5, 0, (z0 + z1) * .5),
                (span * 1.12, 0.012, (0.10 if broad else 0.075) - index * 0.008),
                metal, root, rotation=(0, -math.atan2(z1 - z0, x1 - x0), 0), bevel=0.004)
    if not broad:
        add_cylinder("balanced_sickle_counterweight", (0, 0, -0.20), 0.045, 0.07,
                     accent, root, vertices=8, bevel=0.008)


def crafting_job_prop(spec: dict, root) -> None:
    style = spec["parameters"]["style"]
    primary, secondary, accent = spec["palette"][:3]
    add_grip_marker("tool_primary_grip", (0.04, 0, 0), root,
                    fingers=(0, 1, 0), contact_normal=(-1, 0, 0))
    if style == "tailor":
        add_cylinder("tailor_spool_core", (0, 0, 0.23), 0.055, 0.18, secondary, root, vertices=8)
        add_cylinder("tailor_spool_thread", (0, 0, 0.23), 0.09, 0.12, primary, root, vertices=10, bevel=0.008)
        add_ring("tailor_scissor_left", (0.16, 0, 0.27), 0.065, 0.012, accent, root,
                 major_segments=8, minor_segments=4, rotation=(math.pi / 2, 0, 0))
        add_ring("tailor_scissor_right", (0.27, 0, 0.27), 0.065, 0.012, accent, root,
                 major_segments=8, minor_segments=4, rotation=(math.pi / 2, 0, 0))
        add_beam("tailor_scissor_blade_a", (0.20, 0, 0.25), (0.42, 0, 0.42), 0.014, accent, root, vertices=5)
        add_beam("tailor_scissor_blade_b", (0.22, 0, 0.29), (0.44, 0, 0.20), 0.014, accent, root, vertices=5)
    elif style == "toolmaking":
        add_tapered_beam("toolmaking_hammer_handle", (0, 0, -0.12), (0, 0, 0.42),
                         0.027, 0.022, primary, root, vertices=7)
        add_box("toolmaking_hammer_head", (0, 0, 0.45), (0.28, 0.11, 0.12), secondary,
                root, bevel=0.018)
        add_cone("toolmaking_hammer_peen", (0.19, 0, 0.45), 0.055, 0.02, 0.18,
                 secondary, root, vertices=7, rotation=(0, math.pi / 2, 0))
        add_ring("toolmaking_handle_band", (0, 0, 0.29), 0.035, 0.014, accent, root,
                 major_segments=7, minor_segments=4)
    elif style == "ready":
        add_box("ready_parcel", (0.10, 0, 0.15), (0.38, 0.24, 0.30), primary, root, bevel=0.04)
        add_box("ready_parcel_band_vertical", (0.10, -0.13, 0.15), (0.07, 0.025, 0.33), secondary, root, bevel=0.006)
        add_box("ready_parcel_band_horizontal", (0.10, -0.14, 0.15), (0.40, 0.025, 0.065), secondary, root, bevel=0.006)
        add_ico("ready_parcel_seal", (0.10, -0.165, 0.15), (0.055, 0.02, 0.055), accent,
                root, subdivisions=1)
    else:
        raise ValueError(f"Unknown crafting job prop style {style!r}")
