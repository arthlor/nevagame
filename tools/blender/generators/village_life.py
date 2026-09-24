"""Village-life generators that stay in Blender: the dovecote.

The village animals (dog, cat, sheep, duck, dove) and the two cloth props (the
washing line and the market banner) moved to the code-authored Three.js path in
`tools/authored/village-life/`, where they are built as continuous lofted
surfaces with painted markings and authored clips. This module keeps the one
village-life asset that is still architecture built from crafted boxes.
"""

from __future__ import annotations

import math

from common.design_primitives import add_crafted_box
from common.geometry import add_box, add_collision_primitives, add_cone, add_ico, add_limb_tube


def dovecote(spec: dict, root) -> None:
    """A plaster cote on a timber post, capped in the village's roof token."""
    timber, plaster, roof, dark = spec["palette"]
    params = spec["parameters"]
    post_height = params.get("postHeight", 1.95)
    pitch = params.get("cotePitch", 1.0)

    add_crafted_box("dovecote_footing", (0.0, 0.0, 0.10), (0.44, 0.44, 0.20), dark, root, bevel=0.02)
    add_crafted_box("dovecote_post", (0.0, 0.0, post_height * 0.5 + 0.18),
                    (0.20, 0.20, post_height), timber, root, bevel=0.018)
    for index, (dx, dy) in enumerate(((-1, 0), (1, 0), (0, -1), (0, 1))):
        add_limb_tube(
            f"dovecote_brace_{index}",
            [(dx * 0.10, dy * 0.10, post_height * 0.62),
             (dx * 0.34, dy * 0.34, post_height * 0.98)],
            [0.036, 0.030], timber, root, sides=5,
        )

    body_z = post_height + 0.62
    add_crafted_box("dovecote_body", (0.0, 0.0, body_z), (1.02, 1.02, 0.86), plaster, root, bevel=0.03)
    add_crafted_box("dovecote_ledge", (0.0, 0.0, body_z - 0.44), (1.34, 1.34, 0.07), timber, root, bevel=0.012)
    add_crafted_box("dovecote_ledge_upper", (0.0, 0.0, body_z + 0.30), (1.20, 1.20, 0.06), timber, root, bevel=0.012)

    # Real voids, not painted dots: the holes are boxes in a darker token set
    # into each face so the ring survives in silhouette.
    for face, (nx, ny) in enumerate(((0, -1), (0, 1), (-1, 0), (1, 0))):
        for hole, offset in enumerate((-0.26, 0.0, 0.26)):
            cx = nx * 0.50 + (0.0 if nx else offset)
            cy = ny * 0.50 + (0.0 if ny else offset)
            add_box(
                f"dovecote_hole_{face}_{hole}",
                (cx, cy, body_z + 0.08),
                (0.16 if ny else 0.06, 0.06 if ny else 0.16, 0.19),
                dark, root, bevel=0.006,
            )
        add_crafted_box(
            f"dovecote_perch_{face}",
            (nx * 0.58, ny * 0.58, body_z - 0.09),
            (0.92 if ny else 0.07, 0.07 if ny else 0.92, 0.05),
            timber, root, bevel=0.008,
        )

    cap_z = body_z + 0.46
    add_cone("dovecote_roof", (0.0, 0.0, cap_z + 0.30 * pitch), 0.86, 0.06, 0.62 * pitch,
             roof, root, vertices=4, rotation=(0.0, 0.0, math.pi / 4))
    add_ico("dovecote_finial", (0.0, 0.0, cap_z + 0.66 * pitch), (0.07, 0.07, 0.12), dark, root, subdivisions=1)
    add_collision_primitives(spec, root)
