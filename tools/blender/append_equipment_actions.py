"""Append the three equipment-system actions without rebuilding existing clips."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from common.humanoid_motion import Performer, bind_action, curves, frame_set, sample_basis


CLIPS = (
    ("craft_tailor", 0.933333, 0.533333),
    ("craft_tool", 0.933333, 0.533333),
    ("gear_check", 0.633333, 0.333333),
)


def action_fingerprint(action) -> str:
    payload = []
    for curve in sorted(curves(action), key=lambda value: (value.data_path, value.array_index)):
        payload.append((curve.data_path, curve.array_index, [
            (round(float(key.co.x), 8), round(float(key.co.y), 8), key.interpolation)
            for key in curve.keyframe_points
        ]))
    return hashlib.sha256(json.dumps(payload, separators=(",", ":")).encode()).hexdigest()


def geometry_fingerprint() -> str:
    payload = sorted(
        (obj.name, len(obj.data.vertices), len(obj.data.polygons))
        for obj in bpy.data.objects if obj.type == "MESH"
    )
    return hashlib.sha256(json.dumps(payload, separators=(",", ":")).encode()).hexdigest()


def append_actions(output: Path, report_path: Path) -> None:
    rig = next((obj for obj in bpy.data.objects if obj.type == "ARMATURE"), None)
    if rig is None:
        raise RuntimeError("No humanoid armature found")
    idle = bpy.data.actions.get("idle")
    if idle is None:
        raise RuntimeError("The retained idle action is required as the neutral baseline")

    existing = {action.name: action_fingerprint(action) for action in bpy.data.actions if action.name not in {c[0] for c in CLIPS}}
    geometry_before = geometry_fingerprint()
    neutral = sample_basis(rig, idle, 0)
    performer = Performer(rig, 1.9)
    data = rig.animation_data_create()

    for name, duration, commit in CLIPS:
        prior = bpy.data.actions.get(name)
        if prior:
            for track in list(data.nla_tracks):
                if any(strip.action == prior for strip in track.strips):
                    data.nla_tracks.remove(track)
            bpy.data.actions.remove(prior)
        action = bpy.data.actions.new(name)
        action.use_fake_user = True
        frames = sorted(set([float(frame) for frame in range(math.ceil(duration * 30))] + [duration * 30]))
        bind_action(rig, action)
        for frame in frames:
            frame_set(frame)
            for bone in rig.pose.bones:
                bone.matrix_basis = neutral[bone.name]
            bpy.context.view_layer.update()
            performer.pose(name, frame / (duration * 30), duration)
            for bone in rig.pose.bones:
                bone.rotation_mode = "QUATERNION"
                for channel in ("location", "rotation_quaternion", "scale"):
                    bone.keyframe_insert(data_path=channel, frame=frame, group=bone.name)
        for curve in curves(action):
            for key in curve.keyframe_points:
                key.interpolation = "LINEAR"
        action["neva_loop"] = False
        action["neva_commit_marker_seconds"] = commit
        track = data.nla_tracks.new()
        track.name = name
        track.mute = True
        track.strips.new(name, 0, action)

    bind_action(rig, idle)
    frame_set(0)
    rig.data.pose_position = "REST"
    after = {name: action_fingerprint(bpy.data.actions[name]) for name in existing}
    changed = sorted(name for name, fingerprint in existing.items() if after.get(name) != fingerprint)
    if changed:
        raise RuntimeError(f"Existing actions changed while appending equipment clips: {changed}")
    if geometry_fingerprint() != geometry_before:
        raise RuntimeError("Character geometry changed while appending equipment clips")

    output.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output))
    report_path.write_text(json.dumps({
        "source": bpy.data.filepath,
        "output": str(output),
        "preservedActionCount": len(existing),
        "added": [name for name, _, _ in CLIPS],
        "geometrySha256": geometry_before,
        "existingActionsUnchanged": True,
    }, indent=2) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    append_actions(args.output.resolve(), args.report.resolve())


if __name__ == "__main__":
    main()
