"""Last-resort deterministic fillers for catalog IDs that do not yet have a
family generator. Polyfork is not a visual family: it cannot style-match an
isolated studio sheet or a unique silhouette. Do not assign `polyfork_*` to
any asset with `tools/blender/references/isolated/` evidence. Route those
through the owning registered family generator instead, and keep polyfork
only until a real family exists.

The catalog still lists imported filler IDs so a full catalog build can
dispatch them. These entrypoints remain registered no-ops until a real
construction language replaces them; they must never be the generate-asset
front door.
"""

from __future__ import annotations


def polyfork_prop(spec: dict, root) -> None:
    pass


def polyfork_vegetation(spec: dict, root) -> None:
    pass


def polyfork_rock(spec: dict, root) -> None:
    pass


def polyfork_architecture(spec: dict, root) -> None:
    pass


def polyfork_crop(spec: dict, root) -> None:
    pass


def polyfork_cloud(spec: dict, root) -> None:
    pass
