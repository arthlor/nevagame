"""Deterministic skin repairs for the adapted player body.

The Tripo adapter transfers weights from the previous player surface, so the
crotch seam inherits whichever thigh the nearest template face belonged to:
two vertices a few millimetres apart on the midline can follow opposite
thighs. Any stride or straddle then stretches that one edge several times
over (the published surface contract rejects past 5x). ``blend_crotch``
replaces the seam's thigh split with a smooth one across the midline and
gives the seam a share of the pelvis, so a spreading stride stretches the
inner-thigh cloth over many edges instead of tearing one.
"""
from __future__ import annotations

import math

# Half-width of the band round the midline whose thigh split is rebuilt (m):
# beyond it the inner thigh already follows one leg.
SEAM_HALF_WIDTH = 0.07
# Least pelvis share at the midline, falling to none at 0.6 of the half-width.
SEAM_PELVIS_SHARE = 0.28
MAX_INFLUENCES = 4


def _smoothstep(edge0: float, edge1: float, x: float) -> float:
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def _top(weights: dict[str, float], count: int) -> dict[str, float]:
    kept = dict(sorted(weights.items(), key=lambda item: -item[1])[:count])
    total = sum(kept.values())
    return {name: value / total for name, value in kept.items() if value / total > 1e-4}


def blend_crotch(surface, rig) -> dict:
    """Rebuild the thigh split along the crotch seam of one skinned surface; returns evidence."""
    bones = rig.data.bones
    hip_z = max(bones["UpperLeg.L"].head_local.z, bones["UpperLeg.R"].head_local.z)
    world_to_rig = rig.matrix_world.inverted() @ surface.matrix_world
    deforming = {bone.name for bone in bones if bone.use_deform}
    groups = {group.name: group for group in surface.vertex_groups}
    names = {group.index: group.name for group in surface.vertex_groups}
    for name in ("UpperLeg.L", "UpperLeg.R", "Body"):
        if name not in groups:
            groups[name] = surface.vertex_groups.new(name=name)
            names[groups[name].index] = name
    changed, largest = 0, 0.0
    for vertex in surface.data.vertices:
        co = world_to_rig @ vertex.co
        if co.z > hip_z + 0.02 or co.z < 0.5 or abs(co.x) > SEAM_HALF_WIDTH:
            continue
        # Only bone influences: other groups (a LOD's simplify mask) stay as they are.
        weights = {names[item.group]: item.weight for item in vertex.groups
                   if item.weight > 0.0 and names[item.group] in deforming}
        thighs = weights.get("UpperLeg.L", 0.0) + weights.get("UpperLeg.R", 0.0)
        if thighs < 0.2:
            continue
        # Idempotent: the thigh-and-pelvis total is kept, the pelvis share is a
        # floor, and the thighs split that remainder smoothly across the midline.
        total = thighs + weights.get("Body", 0.0)
        seam = 1.0 - _smoothstep(0.0, SEAM_HALF_WIDTH * 0.6, abs(co.x))
        pelvis = max(weights.get("Body", 0.0), SEAM_PELVIS_SHARE * seam * total)
        left = _smoothstep(-SEAM_HALF_WIDTH, SEAM_HALF_WIDTH, co.x)
        blended = dict(weights)
        blended["Body"] = pelvis
        blended["UpperLeg.L"] = (total - pelvis) * left
        blended["UpperLeg.R"] = (total - pelvis) * (1.0 - left)
        blended = _top({name: value for name, value in blended.items() if value > 1e-5}, MAX_INFLUENCES)
        delta = max(abs(blended.get(name, 0.0) - weights.get(name, 0.0)) for name in set(weights) | set(blended))
        if delta < 1e-5:
            continue
        for group in [item.group for item in vertex.groups if names[item.group] in deforming]:
            surface.vertex_groups[group].remove([vertex.index])
        for name, value in blended.items():
            groups[name].add([vertex.index], value, "REPLACE")
        changed += 1
        largest = max(largest, delta)
    return {"surface": surface.name, "reweightedVertices": changed, "largestWeightChange": round(largest, 4),
            "seamHalfWidthMeters": SEAM_HALF_WIDTH, "pelvisShare": SEAM_PELVIS_SHARE}
