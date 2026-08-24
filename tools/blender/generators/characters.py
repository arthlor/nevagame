"""Static faceted coastal-worker character generator."""

from __future__ import annotations

import math

from common.geometry import add_beam, add_box, add_cylinder, add_ico, add_marker, add_ring, add_tri_prism
from common.authored import add_fasteners, add_rope_line


def coastal_worker(spec: dict, root) -> None:
    skin, shirt, dark, canvas = spec["palette"]
    height = spec["parameters"]["height"]

    add_ico("character_torso", (0, 0, height * 0.59), (0.34, 0.24, 0.43), shirt, root, subdivisions=3)
    add_ico("character_pelvis", (0, 0.01, height * 0.39), (0.31, 0.23, 0.22), dark, root, subdivisions=3)
    add_ico("character_vest_body", (0, -0.055, height * 0.60), (0.37, 0.22, 0.39), canvas, root, subdivisions=3)
    add_ico("character_shirt_front", (0, -0.22, height * 0.62), (0.22, 0.08, 0.34), shirt, root, subdivisions=3)
    for side, x in (("left", -0.22), ("right", 0.22)):
        add_tri_prism(
            f"character_vest_lapel_{side}", (x, -0.255, height * 0.66),
            (0.18, 0.06, 0.42), canvas, root,
            rotation=(0, math.radians(12 if side == "left" else -12), 0),
        )
        add_box(f"character_vest_pocket_{side}", (x, -0.285, height * 0.53), (0.18, 0.06, 0.15), canvas, root, bevel=0.018)

    for side, x in (("left", -0.17), ("right", 0.17)):
        add_ico(f"character_thigh_{side}", (x, 0, height * 0.27), (0.16, 0.16, 0.29), dark, root, subdivisions=3)
        add_ico(f"character_shin_{side}", (x, -0.015, height * 0.11), (0.13, 0.14, 0.24), dark, root, subdivisions=3)
        add_ring(f"character_trouser_cuff_{side}", (x, -0.015, height * 0.19), 0.145, 0.035, canvas, root, major_segments=9, minor_segments=4)
        add_box(f"character_boot_{side}", (x, -0.065, 0.075), (0.25, 0.38, 0.15), dark, root, bevel=0.045)
        add_ico(f"character_boot_ankle_{side}", (x, 0.015, height * 0.085), (0.15, 0.14, 0.19), dark, root, subdivisions=3)
        add_box(f"character_boot_sole_{side}", (x, -0.075, 0.025), (0.27, 0.40, 0.06), dark, root, bevel=0.025)
        for lace in range(3):
            add_box(f"character_boot_lace_{side}_{lace}", (x, -0.205, 0.11 + lace * 0.045), (0.16, 0.025, 0.018), canvas, root, bevel=0.004)

    for side, x in (("left", -0.40), ("right", 0.40)):
        arm_angle = math.radians(4 if side == "left" else -4)
        add_ico(f"character_upper_arm_{side}", (x, 0, height * 0.58), (0.14, 0.14, 0.27), shirt, root, subdivisions=3, rotation=(0, arm_angle, 0))
        add_ico(f"character_forearm_{side}", (x, -0.015, height * 0.44), (0.12, 0.13, 0.24), shirt, root, subdivisions=3, rotation=(0, arm_angle, 0))
        add_ring(f"character_sleeve_cuff_{side}", (x, -0.015, height * 0.38), 0.128, 0.028, canvas, root, major_segments=9, minor_segments=4)
        add_ico(f"char_player_hand_{side}", (x, -0.025, height * 0.31), (0.12, 0.10, 0.13), skin, root, subdivisions=3)
        for finger in range(3):
            add_ico(
                f"character_finger_{side}_{finger}",
                (x + (finger - 1) * 0.035, -0.09, height * 0.285),
                (0.025, 0.055, 0.055), skin, root, subdivisions=2,
            )

    add_cylinder("character_neck", (0, 0, height * 0.76), 0.105, 0.14, skin, root, vertices=8, bevel=0.015)
    add_ico("character_head", (0, -0.01, height * 0.86), (0.20, 0.18, 0.235), skin, root, subdivisions=4)
    add_ico("character_nose", (0, -0.18, height * 0.86), (0.055, 0.065, 0.075), skin, root, subdivisions=2)
    for side, x in (("left", -0.09), ("right", 0.09)):
        add_ico(f"character_ear_{side}", (x * 2.12, -0.01, height * 0.86), (0.045, 0.035, 0.065), skin, root, subdivisions=2)
        add_ico(f"character_eye_{side}", (x, -0.176, height * 0.885), (0.026, 0.018, 0.032), dark, root, subdivisions=2)
        add_box(f"character_brow_{side}", (x, -0.190, height * 0.915), (0.075, 0.025, 0.018), dark, root, rotation=(0, 0, math.radians(5 if side == "left" else -5)), bevel=0.004)
    add_box("character_mouth", (0, -0.207, height * 0.815), (0.075, 0.018, 0.014), dark, root, bevel=0.003)

    for index, (x, z, scale) in enumerate(((-0.12, 0.95, 0.15), (0.09, 0.97, 0.16), (-0.17, 0.89, 0.14), (0.17, 0.90, 0.14), (0, 1.0, 0.15))):
        add_ico(f"character_hair_{index:02d}", (x, 0.04, height * z), (scale, 0.12, scale * 0.78), dark, root, subdivisions=3)

    add_cylinder("character_hat_brim", (0, 0, height * 0.99), 0.38, 0.06, canvas, root, vertices=12, bevel=0.015)
    add_cylinder("character_hat_crown", (0, 0, height * 1.04), 0.24, 0.22, canvas, root, vertices=10, bevel=0.025)
    add_ring("character_hat_band", (0, 0, height * 1.005), 0.24, 0.025, dark, root, major_segments=10, minor_segments=4)

    add_box("character_backpack", (0, 0.25, height * 0.58), (0.52, 0.30, 0.64), canvas, root, bevel=0.07)
    add_ico("character_backpack_body", (0, 0.28, height * 0.58), (0.30, 0.18, 0.36), canvas, root, subdivisions=3)
    add_cylinder("character_pack_roll", (0, 0.29, height * 0.76), 0.16, 0.48, canvas, root, vertices=8, rotation=(0, math.pi / 2, 0), bevel=0.02)
    add_ring("character_pack_roll_left", (-0.245, 0.29, height * 0.76), 0.16, 0.022, dark, root, major_segments=8, minor_segments=4, rotation=(0, math.pi / 2, 0))
    add_ring("character_pack_roll_right", (0.245, 0.29, height * 0.76), 0.16, 0.022, dark, root, major_segments=8, minor_segments=4, rotation=(0, math.pi / 2, 0))
    for side, x in (("left", -0.23), ("right", 0.23)):
        add_rope_line(
            f"character_pack_strap_{side}",
            [(x, 0.28, height * 0.76), (x * 1.28, -0.18, height * 0.64), (x * 1.10, -0.16, height * 0.48)],
            0.032, dark, root, vertices=7,
        )
        add_ico(f"character_pack_pouch_{side}", (x * 1.25, 0.33, height * 0.48), (0.13, 0.10, 0.16), canvas, root, subdivisions=3)
    add_box("character_pack_flap", (0, 0.425, height * 0.58), (0.42, 0.07, 0.28), dark, root, bevel=0.028)
    add_box("character_pack_buckle", (0, 0.465, height * 0.55), (0.10, 0.025, 0.10), canvas, root, bevel=0.010)
    add_cylinder("character_bottle", (0.34, 0.25, height * 0.48), 0.09, 0.28, canvas, root, vertices=8, bevel=0.012)
    add_cylinder("character_bottle_cap", (0.34, 0.25, height * 0.635), 0.045, 0.06, dark, root, vertices=7)
    add_ring("character_bottle_collar", (0.34, 0.25, height * 0.60), 0.094, 0.016, dark, root, major_segments=8, minor_segments=4)
    add_box("character_belt", (0, -0.02, height * 0.42), (0.62, 0.36, 0.10), dark, root, bevel=0.02)
    add_box("character_belt_buckle", (0, -0.215, height * 0.42), (0.13, 0.035, 0.11), canvas, root, bevel=0.012)
    for index in range(4):
        add_cylinder(f"character_vest_button_{index:02d}", (0, -0.285, height * (0.54 + index * 0.055)), 0.022, 0.035, dark, root, vertices=8, rotation=(math.pi / 2, 0, 0))
    add_marker("char_player_tool_socket", (0.48, -0.02, height * 0.33), root, marker_type="tool_socket")
