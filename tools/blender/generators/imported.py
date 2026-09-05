"""Regenerate catalog assets from curated, palette-normalized Blender collections.

Provider downloads are never runtime inputs. The catalog pins a reviewed derivative
and its digest; this loader supplies it to the same scene validator/exporter as every
procedural family, without executing scripts embedded in the source file.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import bpy


REPO_ROOT = Path(__file__).resolve().parents[3]


def imported_blend(spec, root):
    params = spec["parameters"]
    provenance = spec.get("sourceProvenance", {})
    relative = Path(params["sourceBlend"])
    source = (REPO_ROOT / relative).resolve(strict=True)
    if relative.is_absolute() or not source.is_relative_to(REPO_ROOT):
        raise ValueError("Imported Blender source must stay inside the repository")
    if source.suffix != ".blend" or source.is_relative_to(REPO_ROOT / "public") or source.is_relative_to(REPO_ROOT / "generated"):
        raise ValueError("Imported source must be an offline .blend, not a runtime/build artifact")
    if provenance.get("sourceBlend") != params["sourceBlend"]:
        raise ValueError("Imported source provenance does not match parameters.sourceBlend")
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    if digest != provenance.get("sourceSha256"):
        raise ValueError(f"{spec['id']}: adapted Blender source digest mismatch")

    # Bootstrap created a placeholder. Remove it before library loading so canonical
    # root names, action channels, and bone sockets cannot acquire .001 suffixes.
    bpy.data.objects.remove(root, do_unlink=True)
    collection_name = params["sourceCollection"]
    with bpy.data.libraries.load(str(source), link=False) as (available, requested):
        if collection_name not in available.collections:
            raise ValueError(f"Missing source collection {collection_name!r}")
        requested.collections = [collection_name]
    collection = requested.collections[0]
    bpy.context.scene.collection.children.link(collection)
    objects = set(collection.all_objects)
    roots = [obj for obj in objects if obj.parent is None]
    if len(roots) != 1 or roots[0].name != spec["rootNode"]:
        raise ValueError(f"{spec['id']}: adapted collection must have exactly the catalog root")
    if any(obj.type not in {"EMPTY", "MESH", "ARMATURE"} for obj in objects):
        raise ValueError("Adapted collection contains non-asset objects")
    if any(obj.parent and obj.parent not in objects for obj in objects):
        raise ValueError("Adapted asset has a parent outside its collection")
    if any(obj.animation_data and obj.animation_data.drivers for obj in objects):
        raise ValueError("Adapted assets must bake drivers before admission")
    if any(obj.data and getattr(obj.data, "animation_data", None) and obj.data.animation_data.drivers for obj in objects):
        raise ValueError("Adapted data blocks must not contain drivers")
    # Source captures intentionally contain data, not a scene. Restore the fixed
    # production sampling rate used when baking catalog animation durations.
    bpy.context.scene.render.fps = 30
    bpy.context.scene.render.fps_base = 1
    bpy.context.scene.frame_set(0)
    roots[0]["neva_asset_root"] = True
    return roots[0]
