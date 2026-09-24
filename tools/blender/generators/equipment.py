"""Character wearables, specialist tools, and crafting-handling props."""

from __future__ import annotations

from common.design_primitives import add_hat_brim, add_draped_panel

import math
import bpy

from common.geometry import (
    add_box,
    add_cylinder,
    add_ring,
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
