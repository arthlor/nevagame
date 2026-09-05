"""Small deterministic helpers shared by offline humanoid fitting and its tests."""

import math


def normalized_influences(influences, limit=4):
    """Merge duplicate semantic bones before deterministic top-N normalization."""
    merged = {}
    for name, weight in influences:
        if not math.isfinite(weight) or weight < 0:
            raise ValueError("Skin weights must be finite and nonnegative")
        if weight > 1e-8:
            merged[name] = merged.get(name, 0.0) + weight
    ordered = sorted(merged.items(), key=lambda item: (-item[1], item[0]))[:limit]
    total = sum(weight for _, weight in ordered)
    if total <= 1e-8:
        raise ValueError("An imported vertex has no usable mapped weights")
    return [(name, weight / total) for name, weight in ordered]


def semantic_bone(name, side_map, has_chest=True):
    """Quaternius names are mapped spatially, never by suffix convention alone."""
    axial = {
        "Root": "rig_root", "Bone": "rig_root", "Body": "rig_pelvis",
        "Hips": "rig_pelvis", "Abdomen": "rig_spine",
        "Torso": "rig_spine_02" if has_chest else "rig_chest",
        "Chest": "rig_chest", "Neck": "rig_neck", "Head": "rig_head",
    }
    if name in axial:
        return axial[name]
    stem, separator, suffix = name.rpartition(".")
    if not separator or suffix not in side_map:
        raise ValueError(f"Unsupported weighted source bone: {name}")
    side = side_map[suffix]
    segments = {
        "Shoulder": "clavicle", "UpperArm": "upper_arm", "LowerArm": "forearm",
        "Wrist": "hand", "Palm": "hand", "MiddleHand": "hand", "Fingers": "hand",
        "UpperLeg": "thigh", "LowerLeg": "shin", "Foot": "foot",
    }
    if stem.startswith(("Index", "Middle", "Ring", "Pinky", "Thumb")):
        # The restored target has no finger joints: retain each authored finger
        # shape rigidly in the hand instead of fabricating finger animation.
        return f"rig_hand_{side}"
    if stem not in segments:
        raise ValueError(f"Control or unknown bone carries weights: {name}")
    return f"rig_{segments[stem]}_{side}"
