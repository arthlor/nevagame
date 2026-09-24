"""The player's non-locomotion performances: transitions, air, work, fishing.

Every recipe keeps its catalog duration and places its decisive moment (a
seed pressed in, a cut, a pour, a release, a commit) on the catalog marker.
Positions are metres in the character frame (+X left, -Y forward, +Z up; the
ground at z = 0) and angles degrees, as in ``player_clips``.

Reference landmarks of this body at rest: pelvis 0.80, hip joints 0.89,
shoulders 1.28 at x = +/-0.18, the belly's front at y = -0.19, the chest's at
y = -0.19, fingertips hanging at z = 0.60. The legs are short (0.87 m) and
the head large, so a hand reaches the ground only from a kneel with a deep
lean, and a held object sits in front of the belly, clear of it by 0.1 m.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from mathutils import Quaternion, Vector

from .player_clips import (RUN, RUN_STYLE, WALK, WALK_STYLE, Clip, Timeline, Track, arm, base_channels, foot,
                           footsteps, gait_channels, grip, merge, mirror_channels, reach, socket_reach)
from .player_motion import (FORWARD, SIDES, X, Y, Z, RigModel, clamp, hand_rotation, lerp, q_axis,
                            side_sign, smooth, socket_rotation, wrist_of_socket)


@dataclass
class Context:
    model: RigModel
    spec: dict                 # the catalog clip entry
    companions: dict | None = None

    @property
    def duration(self) -> float:
        return self.spec["durationSeconds"]

    def marker(self, name: str | None = None) -> float:
        if name is None:
            return self.spec["commitMarkerSeconds"]
        return next(event["timeSeconds"] for event in self.spec.get("events", []) if event["name"] == name)


def V(x: float, y: float, z: float) -> Vector:
    return Vector((x, y, z))


def hand_q(ctx: Context, side: str, fingers, palm) -> Quaternion:
    return hand_rotation(ctx.model, side, V(*fingers).normalized(), V(*palm).normalized())


def held(ctx: Context, side: str, socket_at, along, palm, elbow=None, weight: float = 1.0,
         comfort: bool = False) -> dict:
    """Hold a handle whose axis runs along ``along`` with the palm facing ``palm``, gripped at ``socket_at``."""
    rotation = socket_rotation(ctx.model, side, V(*along).normalized(), V(*palm).normalized())
    wrist = wrist_of_socket_rest(ctx, side, V(*socket_at), rotation)
    return reach(side, wrist, elbow=elbow, hand=rotation, weight=weight, comfort=comfort)


def wrist_of_socket_rest(ctx: Context, side: str, socket_at: Vector, rotation: Quaternion) -> Vector:
    m = ctx.model
    arm_rest = m.arms[side]
    offset = (m.rest[arm_rest.hand] @ arm_rest.socket).translation - m.rest_head[arm_rest.hand]
    return socket_at - rotation @ offset


def palm_at(ctx: Context, side: str, point, fingers, palm, elbow=None, weight: float = 1.0,
            comfort: bool = False) -> dict:
    """Put the palm (the hand socket) at ``point`` with fingers and palm pointing as asked."""
    rotation = hand_q(ctx, side, fingers, palm)
    wrist = wrist_of_socket_rest(ctx, side, V(*point), rotation)
    return reach(side, wrist, elbow=elbow, hand=rotation, weight=weight, comfort=comfort)


def stand(**overrides) -> dict:
    d = base_channels()
    d.update(overrides)
    return d


def timeline(ctx_or_duration, keys, loop=False, lags=None) -> Timeline:
    duration = ctx_or_duration if isinstance(ctx_or_duration, (int, float)) else ctx_or_duration.duration
    return Timeline(duration, keys, loop=loop, lags=lags)


LAGS = {"h": 0.035, "n": 0.02, "flex_": 0.03, "elbow_": 0.045, "wflex_": 0.06, "g": 0.04}


def simple(ctx: Context, keys, loop=False, lags=LAGS, overlay=None) -> Clip:
    track = timeline(ctx, keys, loop=loop, lags=lags)

    def sample(t: float) -> dict:
        d = track(t)
        if overlay:
            overlay(t, d)
        return d

    return Clip(ctx.spec["name"], ctx.duration, loop, sample)


# ------------------------------------------------------------------ transitions


def accelerating(distance_rate: float):
    """Root travel of a start: constant acceleration from rest (m/s^2)."""
    return lambda t: 0.5 * distance_rate * t * t


# Fraction of a start after which the push foot blends onto the loop's phase-0 pose.
HANDOVER = 0.55


def start_clip(ctx: Context, gait, style, acceleration: float, run: bool) -> Clip:
    """From the stand, push off the right foot and land the left on the gait's phase 0.

    The final frame equals the loop's phase 0 exactly (Art Bible 13.6): the
    runtime enters the loop at phase 0 and a start that ended elsewhere would
    be a false start.
    """
    duration = ctx.duration
    travel = accelerating(acceleration)
    end = gait_channels(gait, 0.0, style)
    rest = base_channels()
    # Right foot: planted in the world (sliding back as the root advances),
    # its heel rising into push-off towards the gait's phase-0 roll.
    _, _, _, end_pitch_r = gait.foot("R", 0.0)
    push = max(end_pitch_r, -32.0 if run else -26.0)

    def sample(t: float) -> dict:
        u = clamp(t / duration, 0.0, 1.0)
        k = smooth(u)
        d = {key: lerp(rest[key], end[key], k) for key in rest}
        # The body leans into the start before the legs catch up.
        lean = math.sin(math.pi * min(1.0, u * 1.15))
        d["ppitch"] += (6.0 if run else 3.0) * lean
        d["spitch"] += (5.0 if run else 2.0) * lean
        # The body falls forward over the planted foot, so its heel rises on a
        # straightening leg: the push, not a crouch.
        d["py"] = lerp(rest["py"], end["py"], k) - (0.09 if run else 0.04) * math.sin(math.pi * min(1.0, u * 1.1))
        d["pz"] = lerp(rest["pz"], end["pz"], k) - (0.012 if run else 0.006) * math.sin(math.pi * u)
        # Stance foot: planted in the world while it pushes, its heel rising;
        # over the last part of the start it hands over to the gait's phase-0
        # pose exactly, so the loop takes over without a blend.
        planted_y = rest["fy_R"] + travel(t)
        pushing = push * smooth(clamp((u - 0.2) / 0.55, 0.0, 1.0))
        handover = smooth(clamp((u - HANDOVER) / (1.0 - HANDOVER), 0.0, 1.0))
        d["fx_R"] = lerp(rest["fx_R"], end["fx_R"], k)
        d["fy_R"] = lerp(planted_y, end["fy_R"], handover)
        d["flift_R"] = lerp(0.0, end["flift_R"], handover)
        d["fpitch_R"] = lerp(pushing, end["fpitch_R"], handover)
        # The toe skims forward of its planted spot onto the loop's stance: a
        # standing start cannot match a steady stride's spacing.
        d["flift_R"] += 0.025 * math.sin(math.pi * handover)
        # Lead foot: lift, swing through, reach phase 0's touchdown.
        start_y, end_y = rest["fy_L"], end["fy_L"]
        d["fy_L"] = lerp(start_y, end_y, smooth(clamp((u - 0.08) / 0.92, 0.0, 1.0)))
        arc = math.sin(math.pi * clamp((u - 0.05) / 0.9, 0.0, 1.0))
        d["flift_L"] = (0.11 if run else 0.055) * arc
        pitch_end = end["fpitch_L"]
        d["fpitch_L"] = lerp(-25.0 if run else -18.0, pitch_end, smooth(clamp((u - 0.35) / 0.65, 0.0, 1.0))) * min(1.0, u * 6.0)
        return d

    return Clip(ctx.spec["name"], duration, False, sample, travel=travel)


def walk_start(ctx: Context) -> Clip:
    return start_clip(ctx, WALK, WALK_STYLE, 9.0, run=False)


def run_start(ctx: Context) -> Clip:
    return start_clip(ctx, RUN, RUN_STYLE, 9.0, run=True)


def stop(ctx: Context) -> Clip:
    """From the walk's left touchdown: plant, bring the right foot level, settle."""
    duration = ctx.duration
    deceleration = 12.0
    speed = WALK.speed
    halt = speed / deceleration

    def travel(t: float) -> float:
        t = min(t, halt)
        return speed * t - 0.5 * deceleration * t * t

    start = gait_channels(WALK, 0.0, WALK_STYLE)
    rest = base_channels()
    lead_final = start["fy_L"] + travel(duration)
    rest_final = dict(rest)
    rest_final["fy_L"] = lead_final
    rest_final["fy_R"] = lead_final + 0.12
    rest_final["py"] = lead_final + 0.06 - rest["fy_L"]

    def sample(t: float) -> dict:
        u = clamp(t / duration, 0.0, 1.0)
        k = smooth(clamp(u / 0.85, 0.0, 1.0))
        d = {key: lerp(start[key], rest_final[key], k) for key in rest}
        # Decelerating: the trunk rocks back over the planted foot, then settles.
        d["ppitch"] += -4.0 * math.sin(math.pi * clamp(u / 0.7, 0.0, 1.0))
        d["pz"] -= 0.018 * math.sin(math.pi * clamp(u / 0.6, 0.0, 1.0))
        d["fy_L"] = start["fy_L"] + travel(t)
        d["flift_L"] = 0.0
        d["fpitch_L"] = start["fpitch_L"] * (1.0 - smooth(clamp(u / 0.25, 0.0, 1.0)))
        # The trailing foot pushes off, swings through low, and lands level.
        swing = clamp((u - 0.12) / 0.55, 0.0, 1.0)
        d["fy_R"] = lerp(start["fy_R"] + travel(t), rest_final["fy_R"], smooth(swing))
        d["flift_R"] = 0.06 * math.sin(math.pi * swing) if 0.0 < swing < 1.0 else 0.0
        d["fpitch_R"] = lerp(start["fpitch_R"], 0.0, smooth(clamp((u - 0.1) / 0.6, 0.0, 1.0)))
        return d

    return Clip(ctx.spec["name"], duration, False, sample, travel=travel)


def turn(ctx: Context, direction: float) -> Clip:
    """An in-place step turn while the root yaws ~35 degrees; the lead foot opens first.

    A planted foot stays put in the world, so seen from the turning root it
    counter-rotates; each foot lifts from where it was planted and lands on
    its stand spot, which then counter-rotates in turn for the rest of the turn.
    """
    duration = ctx.duration
    total = 35.0
    rest = base_channels()
    lead, trail = ("L", "R") if direction > 0 else ("R", "L")

    def yaw(t: float) -> float:
        return direction * total * smooth(clamp(t / duration, 0.0, 1.0))

    def planted(side: str, t: float, since: float) -> tuple[float, float, float]:
        """The stand spot occupied at time ``since``, seen from the root at ``t``."""
        turned = yaw(t) - yaw(since)
        angle = math.radians(-turned)
        x, y = rest[f"fx_{side}"], rest[f"fy_{side}"]
        c, s = math.cos(angle), math.sin(angle)
        return c * x - s * y, s * x + c * y, rest[f"fyaw_{side}"] + side_sign(side) * turned

    def sample(t: float) -> dict:
        u = clamp(t / duration, 0.0, 1.0)
        d = dict(rest)
        # The eyes and head lead, the chest follows, the pelvis last.
        d["hyaw"] = direction * 14.0 * math.sin(math.pi * clamp(u / 0.8, 0.0, 1.0))
        d["hlevel"] = 0.8
        d["syaw"] = direction * 8.0 * math.sin(math.pi * clamp(u / 0.85, 0.0, 1.0))
        d["pyaw"] = direction * 5.0 * math.sin(math.pi * clamp((u - 0.05) / 0.9, 0.0, 1.0))
        d["pz"] = rest["pz"] - 0.012 * math.sin(math.pi * u)
        for side, (a, b) in ((lead, (0.12, 0.55)), (trail, (0.45, 0.92))):
            if u <= a:
                x, y, toe = planted(side, t, 0.0)
                lift, pitch = 0.0, -10.0 * smooth(u / a)
            elif u >= b:
                x, y, toe = planted(side, t, duration * b)
                lift, pitch = 0.0, 0.0
            else:
                q = (u - a) / (b - a)
                sx, sy, stoe = planted(side, t, 0.0)
                ex, ey, etoe = planted(side, t, duration * b)
                x, y, toe = lerp(sx, ex, smooth(q)), lerp(sy, ey, smooth(q)), lerp(stoe, etoe, smooth(q))
                lift = 0.05 * math.sin(math.pi * q)
                pitch = lerp(-10.0, 4.0, smooth(q)) * (1.0 - smooth(clamp((q - 0.7) / 0.3, 0.0, 1.0)))
            d[f"fx_{side}"], d[f"fy_{side}"], d[f"fyaw_{side}"] = x, y, toe
            d[f"flift_{side}"], d[f"fpitch_{side}"] = lift, pitch
        # Arms swing loosely with the turn.
        for side in SIDES:
            d[f"flex_{side}"] = rest[f"flex_{side}"] - direction * side_sign(side) * 6.0 * math.sin(math.pi * u)
        return d

    return Clip(ctx.spec["name"], duration, False, sample)


def turn_left(ctx: Context) -> Clip:
    return turn(ctx, 1.0)


def turn_right(ctx: Context) -> Clip:
    return turn(ctx, -1.0)


# ------------------------------------------------------------------ air


def air_pose(u: float = 0.0) -> dict:
    """Airborne: knees drawn up a little, one leg ahead, arms out for balance."""
    swing = math.sin(2.0 * math.pi * u)
    d = stand(pz=0.0, ppitch=4.0, spitch=5.0, hlevel=0.9, wpitch=10.0)
    d.update(foot("L", 0.10, -0.12 - 0.03 * swing, 0.17 + 0.02 * swing, 8.0, -18.0))
    d.update(foot("R", -0.10, 0.02 + 0.03 * swing, 0.13 - 0.02 * swing, 8.0, -22.0))
    d["knee_L"] = d["knee_R"] = 10.0
    for side in SIDES:
        sign = side_sign(side)
        d.update(arm(side, flex=4.0 + 5.0 * sign * swing, abd=34.0 - 5.0 * sign * swing, twist=-18.0,
                     elbow=52.0, pron=-25.0, wflex=-10.0))
        d[f"celev_{side}"] = 5.0
        d.update(grip(side, "spread", 0.8))
    return d


def jump_start(ctx: Context) -> Clip:
    """The body is already rising: finish the push (legs long, toes pointed), then tuck."""
    push = stand(pz=0.02, ppitch=6.0, spitch=4.0, hlevel=0.9, wpitch=4.0)
    push.update(foot("L", 0.11, -0.06, 0.0, 10.0, -42.0))
    push.update(foot("R", -0.11, -0.03, 0.0, 10.0, -45.0))
    for side in SIDES:
        push.update(arm(side, flex=62.0, abd=8.0, elbow=30.0, pron=0.0, wflex=-5.0))
        push.update(grip(side, "loose"))
    load = stand(pz=-0.10, ppitch=16.0, spitch=14.0, hlevel=0.8, wpitch=6.0)
    for side in SIDES:
        load.update(arm(side, flex=-28.0, abd=4.0, elbow=22.0, pron=15.0))
    keys = [(0.0, load), (0.06, push), (0.14, merge(air_pose(0.0), {"pz": 0.01})),
            (ctx.duration, air_pose(0.0))]
    return simple(ctx, keys)


def fall(ctx: Context) -> Clip:
    duration = ctx.duration

    def sample(t: float) -> dict:
        return air_pose(t / duration)

    return Clip(ctx.spec["name"], duration, True, sample)


def landing(ctx: Context, depth: float, recover: float, stagger: float) -> Clip:
    """Toes meet the ground first, heels follow, the knees and hips absorb, then rise."""
    touch = air_pose(0.0)
    touch.update(foot("L", 0.12, -0.052 - stagger, 0.0, 10.0, -16.0))
    touch.update(foot("R", -0.12, -0.052 + stagger * 0.3, 0.0, 10.0, -18.0))
    touch["pz"] = -0.01
    flat = dict(touch)
    flat.update(foot("L", 0.12, -0.052 - stagger, 0.0, 10.0, 0.0))
    flat.update(foot("R", -0.12, -0.052 + stagger * 0.3, 0.0, 10.0, 0.0))
    flat["pz"] = -depth * 0.45
    bottom = dict(flat)
    bottom.update(pz=-depth, ppitch=10.0 + 45.0 * depth, spitch=6.0 + 40.0 * depth, py=-0.03 * depth / 0.2,
                  hlevel=0.85, wpitch=8.0)
    for side in SIDES:
        bottom.update(arm(side, flex=22.0 + 60.0 * depth, abd=10.0, elbow=30.0 + 50.0 * depth, pron=20.0,
                          wflex=5.0))
        bottom.update(grip(side, "loose"))
        bottom[f"celev_{side}"] = -1.0
    upright = stand()
    upright.update(foot("L", 0.12, -0.052 - stagger, 0.0))
    upright.update(foot("R", -0.12, -0.052 + stagger * 0.3, 0.0))
    upright["py"] = -stagger * 0.35
    d = ctx.duration
    keys = [(0.0, touch), (0.07 * d / 0.333, flat), (recover * d, bottom), (d, upright)]
    return simple(ctx, keys, lags={"h": 0.03, "flex_": 0.04, "elbow_": 0.05, "g": 0.05})


def land_soft(ctx: Context) -> Clip:
    return landing(ctx, 0.08, 0.40, 0.03)


def land_hard(ctx: Context) -> Clip:
    return landing(ctx, 0.22, 0.42, 0.08)


# ------------------------------------------------------------------ farm work


def kneel(ctx: Context, lean: float, drop: float = 0.44) -> dict:
    """Down on the right knee, left foot flat ahead, trunk bent over the work."""
    d = stand(pz=-drop, py=-0.07, ppitch=18.0 + lean * 0.3, spitch=lean * 0.7, hlevel=0.55, wpitch=40.0)
    d.update(foot("L"))
    d.update(foot("R", -0.12, 0.20, 0.02, 8.0, -62.0))
    d["knee_L"], d["knee_R"] = 12.0, 4.0
    return d


def plant(ctx: Context) -> Clip:
    """Take seed from the hip pouch, drop to one knee, press it into the soil, rise."""
    contact = ctx.marker()
    pouch = stand(hlevel=0.7, wpitch=22.0, pz=-0.03)
    pouch.update(palm_at(ctx, "R", (-0.215, -0.02, 0.86), (0.2, -0.3, -1.0), (1.0, 0.3, 0.0), elbow=(-0.4, 1.0, -0.2)))
    pouch.update(grip("R", "pinch"))
    pouch.update(arm("L", flex=8.0, elbow=18.0))
    down = kneel(ctx, 30.0, 0.30)
    down.update(foot("R", -0.12, 0.13, 0.05, 8.0, -40.0))
    down.update(palm_at(ctx, "R", (-0.12, -0.36, 0.40), (0.0, -0.4, -1.0), (0.4, 0.2, -0.1), elbow=(-0.6, 0.5, -0.4)))
    down.update(grip("R", "pinch"))
    press = kneel(ctx, 62.0)
    press.update(palm_at(ctx, "R", (-0.10, -0.56, 0.11), (0.0, -0.35, -1.0), (0.3, 0.3, -0.2), elbow=(-0.7, 0.3, 0.3)))
    press.update(grip("R", "pinch"))
    press.update(palm_at(ctx, "L", (0.15, -0.36, 0.49), (0.0, -1.0, -0.3), (0.0, 0.0, -1.0), elbow=(0.8, 0.4, 0.0)))
    press.update(grip("L", "cup"))
    pat = dict(press)
    pat.update(palm_at(ctx, "R", (-0.10, -0.55, 0.095), (0.0, -0.2, -1.0), (0.0, 0.2, -1.0), elbow=(-0.7, 0.3, 0.3)))
    pat.update(grip("R", "flat"))
    rise = kneel(ctx, 22.0, 0.22)
    rise.update(foot("R", -0.12, 0.08, 0.06, 8.0, -30.0))
    rise.update(arm("R", flex=10.0, elbow=30.0))
    rise.update(arm("L", flex=6.0, elbow=20.0))
    rise.update(hlevel=0.7, wpitch=10.0)
    # The kneeling foot lifts before it travels, back and forth.
    pouch.update(foot("R", lift=0.035, pitch=-12.0))
    rise.update(foot("R", -0.12, 0.02, 0.05, 8.0, -18.0))
    d = ctx.duration
    keys = [(0.0, stand()), (0.10, pouch), (0.21, down), (contact, press), (contact + 0.10, pat),
            (0.56, rise), (0.66, merge(stand(), foot("R", lift=0.0, pitch=0.0))), (d, stand())]
    return simple(ctx, keys)


def harvest(ctx: Context) -> Clip:
    """Bend to the crop, gather the stalks in the left hand, draw the sickle through, lift the cut."""
    cut = ctx.marker()
    bend = stand(pz=-0.31, py=-0.05, ppitch=22.0, spitch=30.0, hlevel=0.6, wpitch=38.0)
    bend["knee_L"] = bend["knee_R"] = 16.0
    gather = dict(bend)
    gather.update(palm_at(ctx, "L", (0.03, -0.47, 0.36), (-0.3, -0.5, -0.8), (-1.0, 0.1, 0.0), elbow=(0.8, 0.6, -0.3)))
    gather.update(grip("L", "fist"))
    gather.update(held(ctx, "R", (-0.28, -0.38, 0.40), (0.25, -0.95, 0.1), (0.2, 0.0, -1.0), elbow=(-0.8, 0.6, -0.2)))
    gather.update(grip("R", "handle"))
    wind = dict(gather)
    wind.update(held(ctx, "R", (-0.36, -0.30, 0.46), (0.55, -0.8, 0.15), (0.3, 0.1, -1.0), elbow=(-0.9, 0.5, -0.2)))
    wind["syaw"] = -10.0
    slice_ = dict(gather)
    slice_.update(held(ctx, "R", (0.02, -0.45, 0.30), (0.9, -0.3, 0.0), (0.0, 0.2, -1.0), elbow=(-0.5, 0.8, 0.2)))
    slice_["syaw"] = 12.0
    follow = dict(slice_)
    follow.update(held(ctx, "R", (0.08, -0.38, 0.36), (0.8, 0.1, 0.4), (0.0, 0.5, -0.9), elbow=(-0.4, 0.9, 0.2)))
    follow.update(palm_at(ctx, "L", (0.07, -0.45, 0.46), (-0.3, -0.5, -0.8), (-1.0, 0.1, 0.0), elbow=(0.8, 0.6, -0.3)))
    follow["syaw"] = 14.0
    lift = stand(pz=-0.07, ppitch=6.0, spitch=8.0, hlevel=0.7, wpitch=12.0)
    lift.update(palm_at(ctx, "L", (0.10, -0.34, 0.95), (-0.2, -0.3, 0.9), (-1.0, 0.0, 0.0), elbow=(0.6, 0.6, -0.6)))
    lift.update(grip("L", "fist"))
    lift.update(arm("R", flex=12.0, abd=-4.0, elbow=28.0, pron=20.0))
    lift.update(grip("R", "handle"))
    end = merge(stand(), grip("R", "handle"))
    d = ctx.duration
    keys = [(0.0, merge(stand(), grip("R", "handle"))), (0.14, gather), (cut - 0.09, wind), (cut, slice_),
            (cut + 0.10, follow), (0.62, lift), (d, end)]
    return simple(ctx, keys)


def water(ctx: Context) -> Clip:
    """Lift the can forward, tip the spout down over the bed, sweep it a little, bring it back."""
    pour = ctx.marker()
    lifted = stand(spitch=4.0, hlevel=0.7, wpitch=18.0)
    lifted.update(palm_at(ctx, "R", (-0.20, -0.36, 0.88), (0.0, -1.0, -0.05), (1.0, 0.0, 0.0), elbow=(-0.6, 0.6, -0.6)))
    lifted.update(grip("R", "handle"))
    lifted.update(arm("L", flex=10.0, abd=-4.0, elbow=24.0))
    tipped = stand(spitch=8.0, ppitch=3.0, hlevel=0.65, wpitch=32.0)
    tipped.update(palm_at(ctx, "R", (-0.18, -0.44, 0.92), (0.0, -0.62, -0.78), (1.0, 0.0, 0.0), elbow=(-0.7, 0.5, -0.5)))
    tipped.update(grip("R", "handle"))
    tipped.update(arm("L", flex=14.0, abd=-2.0, elbow=30.0))
    sweep = dict(tipped)
    sweep.update(palm_at(ctx, "R", (-0.11, -0.46, 0.91), (0.2, -0.6, -0.78), (0.95, -0.2, 0.0), elbow=(-0.7, 0.5, -0.5)))
    sweep["syaw"] = 6.0
    d = ctx.duration
    keys = [(0.0, merge(stand(), grip("R", "handle"))), (0.20, lifted), (pour, tipped), (0.58, sweep),
            (0.68, tipped), (d, merge(stand(), grip("R", "handle")))]
    return simple(ctx, keys)


def work_stance(**overrides) -> dict:
    d = stand(spitch=10.0, ppitch=4.0, hlevel=0.6, wpitch=30.0)
    d.update(overrides)
    return d


def workstation(ctx: Context) -> Clip:
    """Scoop from the bin at the bench, lift, tip into the hopper, set back."""
    tip = ctx.marker()
    brace = palm_at(ctx, "L", (0.20, -0.44, 0.93), (-0.2, -1.0, -0.2), (0.0, 0.0, -1.0), elbow=(0.8, 0.6, -0.2))
    dig = work_stance(spitch=18.0)
    dig.update(held(ctx, "R", (-0.20, -0.48, 0.84), (0.1, -0.8, -0.6), (0.0, 0.3, -1.0), elbow=(-0.8, 0.5, -0.2)))
    dig.update(brace)
    scoop = work_stance(spitch=14.0)
    scoop.update(held(ctx, "R", (-0.17, -0.46, 0.93), (0.1, -0.9, 0.35), (0.0, 0.5, -0.8), elbow=(-0.8, 0.5, -0.3)))
    scoop.update(brace)
    pour = work_stance(spitch=10.0, syaw=8.0)
    pour.update(held(ctx, "R", (-0.04, -0.46, 1.03), (0.6, -0.7, -0.4), (0.8, 0.0, -0.6), elbow=(-0.7, 0.4, -0.6)))
    pour.update(brace)
    rest = work_stance()
    rest.update(brace)
    rest.update(arm("R", flex=16.0, elbow=40.0, pron=30.0))
    for key in (dig, scoop, pour, rest):
        key.update(grip("R", "handle"))
        key.update(grip("L", "flat"))
    d = ctx.duration
    keys = [(0.0, merge(stand(), grip("R", "handle"))), (0.22, dig), (0.38, scoop), (tip, pour),
            (0.70, rest), (d, merge(stand(), grip("R", "handle")))]
    return simple(ctx, keys)


def craft_tailor(ctx: Context) -> Clip:
    """Hold the work up in the right hand, draw the needle through with the left, twice."""
    commit = ctx.marker()
    work = palm_at(ctx, "R", (-0.08, -0.38, 1.00), (0.6, -0.6, 0.3), (0.3, 0.2, 0.9), elbow=(-0.7, 0.5, -0.5))
    close = work_stance(spitch=12.0, wpitch=36.0)
    close.update(work)
    close.update(palm_at(ctx, "L", (0.02, -0.40, 1.01), (-0.4, -0.8, -0.3), (-0.6, 0.2, -0.7), elbow=(0.8, 0.5, -0.4)))
    close.update(grip("L", "pinch"))
    close.update(grip("R", "cup"))
    pull = dict(close)
    pull.update(palm_at(ctx, "L", (0.22, -0.30, 1.19), (0.4, -0.5, 0.6), (-0.6, 0.3, -0.7), elbow=(0.9, 0.4, -0.2)))
    pull.update(grip("L", "pinch"))
    pull["hyaw"] = 6.0
    d = ctx.duration
    keys = [(0.0, stand()), (0.18, close), (0.32, pull), (0.43, close), (commit, pull), (0.68, close),
            (d, stand())]
    return simple(ctx, keys)


def craft_tool(ctx: Context) -> Clip:
    """Steady the piece with the left hand and strike it twice with the tool in the right."""
    commit = ctx.marker()
    hold = palm_at(ctx, "L", (0.06, -0.44, 0.93), (-0.3, -0.9, -0.3), (-0.2, 0.0, -1.0), elbow=(0.8, 0.5, -0.4))
    raised = work_stance(spitch=6.0, wpitch=30.0)
    raised.update(hold)
    raised.update(held(ctx, "R", (-0.16, -0.30, 1.26), (0.2, -0.3, 0.95), (0.8, -0.2, 0.0), elbow=(-0.8, 0.4, -0.3)))
    strike = work_stance(spitch=14.0, wpitch=34.0)
    strike.update(hold)
    strike.update(held(ctx, "R", (-0.04, -0.46, 0.99), (0.3, -0.9, -0.25), (0.6, 0.1, -0.8), elbow=(-0.8, 0.5, -0.3)))
    for key in (raised, strike):
        key.update(grip("R", "handle"))
        key.update(grip("L", "cup"))
    d = ctx.duration
    keys = [(0.0, merge(stand(), grip("R", "handle"))), (0.20, raised), (0.30, strike), (0.42, raised),
            (commit, strike), (0.70, raised), (d, merge(stand(), grip("R", "handle")))]
    return simple(ctx, keys, lags={"h": 0.04, "flex_": 0.02, "elbow_": 0.03, "g": 0.03})


def gear_check(ctx: Context) -> Clip:
    """Glance down, tug the belt and strap to settle the kit, look up again."""
    commit = ctx.marker()
    look = stand(hlevel=0.55, wpitch=34.0, spitch=5.0)
    look.update(palm_at(ctx, "L", (0.11, -0.28, 1.00), (-0.4, -0.3, -0.85), (-0.3, 0.9, 0.0), elbow=(0.9, 0.4, -0.3)))
    look.update(palm_at(ctx, "R", (-0.06, -0.29, 1.21), (0.5, -0.2, 0.85), (0.1, 0.9, 0.2), elbow=(-0.9, 0.3, -0.4)))
    look.update(grip("L", "fist"))
    look.update(grip("R", "fist"))
    tug = dict(look)
    tug.update(palm_at(ctx, "L", (0.12, -0.29, 0.96), (-0.4, -0.3, -0.85), (-0.3, 0.9, 0.0), elbow=(0.9, 0.4, -0.3)))
    tug.update(palm_at(ctx, "R", (-0.07, -0.30, 1.16), (0.5, -0.2, 0.85), (0.1, 0.9, 0.2), elbow=(-0.9, 0.3, -0.4)))
    tug["hpitch"] = 3.0
    d = ctx.duration
    keys = [(0.0, stand()), (0.18, look), (commit, tug), (0.44, look), (d, stand())]
    return simple(ctx, keys)


# ------------------------------------------------------------------ pick up, carry, place


def carry_hold(ctx: Context, bounce: float = 0.0) -> dict:
    """Load held in front of the chest: palms on its sides, elbows tucked, trunk set back."""
    d = stand(spitch=-3.0, ppitch=-1.0, hlevel=0.8, wpitch=4.0)
    for side in SIDES:
        sign = side_sign(side)
        d.update(palm_at(ctx, side, (sign * 0.15, -0.30, 1.20 + bounce), (-sign * 0.15, -0.35, 0.92),
                         (-sign * 1.0, -0.1, 0.1), elbow=(sign * 0.55, 0.35, -0.75)))
        d.update(grip(side, "cup"))
        d[f"celev_{side}"] = 1.0
        d[f"cprot_{side}"] = 3.0
    return d


def pickup(ctx: Context) -> Clip:
    """Squat with a straight back, take the load from the ground, stand into the carry hold."""
    commit = ctx.marker()
    squat = stand(pz=-0.34, py=-0.03, ppitch=22.0, spitch=18.0, hlevel=0.6, wpitch=34.0)
    squat["knee_L"] = squat["knee_R"] = 16.0
    for side in SIDES:
        sign = side_sign(side)
        squat.update(palm_at(ctx, side, (sign * 0.17, -0.46, 0.34), (0.0, -0.3, -0.95), (-sign, 0.0, 0.0),
                             elbow=(sign * 0.6, 0.6, -0.3)))
        squat.update(grip(side, "cup"))
    rising = dict(squat)
    rising.update(pz=-0.16, ppitch=10.0, spitch=6.0, wpitch=15.0)
    for side in SIDES:
        sign = side_sign(side)
        rising.update(palm_at(ctx, side, (sign * 0.16, -0.36, 0.80), (-sign * 0.1, -0.35, 0.93), (-sign, -0.1, 0.1),
                              elbow=(sign * 0.6, 0.4, -0.7)))
    end = carry_hold(ctx)
    d = ctx.duration
    keys = [(0.0, stand()), (commit - 0.02, squat), (commit + 0.03, squat), (0.50, rising), (d, end)]
    return simple(ctx, keys)


def place(ctx: Context) -> Clip:
    """Lower the load to the ground from the carry hold with a straight back, release, stand."""
    commit = ctx.marker()
    start = carry_hold(ctx)
    squat = stand(pz=-0.34, py=-0.03, ppitch=22.0, spitch=18.0, hlevel=0.6, wpitch=34.0)
    squat["knee_L"] = squat["knee_R"] = 16.0
    for side in SIDES:
        sign = side_sign(side)
        squat.update(palm_at(ctx, side, (sign * 0.17, -0.46, 0.34), (0.0, -0.3, -0.95), (-sign, 0.0, 0.0),
                             elbow=(sign * 0.6, 0.6, -0.3)))
        squat.update(grip(side, "cup"))
    lowering = dict(squat)
    lowering.update(pz=-0.18, ppitch=12.0, spitch=8.0, wpitch=20.0)
    for side in SIDES:
        sign = side_sign(side)
        lowering.update(palm_at(ctx, side, (sign * 0.16, -0.38, 0.78), (-sign * 0.1, -0.35, 0.93), (-sign, -0.1, 0.1),
                                elbow=(sign * 0.6, 0.4, -0.7)))
    release = dict(squat)
    for side in SIDES:
        release.update(grip(side, "relaxed"))
    end = stand()
    d = ctx.duration
    keys = [(0.0, start), (0.22, lowering), (commit - 0.04, squat), (commit + 0.03, release), (d, end)]
    return simple(ctx, keys)


def carry_idle(ctx_or_none) -> Clip:
    duration = 3.2
    ctx = ctx_or_none

    def sample(t: float) -> dict:
        phase = t / duration
        breath = math.sin(2.0 * math.pi * phase * 2.0)
        d = carry_hold(ctx, 0.006 * breath)
        d["cpitch"] = -0.8 * breath
        shift = math.sin(2.0 * math.pi * (phase - 0.1))
        d["px"] = 0.010 * shift
        d["proll"] = -1.0 * shift
        d["sroll"] = 1.2 * shift
        d["hyaw"] = 3.0 * math.sin(2.0 * math.pi * (phase + 0.1))
        return d

    return Clip("carry_idle", duration, True, sample)


def carry_gait(ctx: Context, gait, style, name: str, bounce: float) -> Clip:
    duration = gait.period

    def sample(t: float) -> dict:
        phase = t / duration
        d = gait_channels(gait, phase, style)
        # Arms carry the load instead of swinging; it rides the step bounce a
        # beat late, and the thorax counter-rotates less under it.
        hold = carry_hold(ctx, -bounce * math.cos(2.0 * math.pi * (2.0 * phase - 2.0 * style["bob_high"] - 0.25)))
        for key, value in hold.items():
            if key[:-2] in ("ik", "hx", "hy", "hz", "hc", "ex", "ey", "ez", "qw", "qx", "qy", "qz", "hq", "g2", "g3",
                            "g4", "gto", "gtc", "flex", "abd", "twist", "elbow", "pron", "wflex", "wdev", "celev",
                            "cprot"):
                d[key] = value
        d["syaw"] *= 0.45
        d["spitch"] -= 3.0
        return d

    return Clip(name, duration, True, sample, reference_speed=gait.speed, events=footsteps(gait),
                contact_windows={s: gait.contacts(s, duration) for s in SIDES})


def carry_walk(ctx: Context) -> Clip:
    return carry_gait(ctx, WALK, WALK_STYLE, "carry_walk", 0.012)


def carry_run(ctx: Context) -> Clip:
    return carry_gait(ctx, RUN, RUN_STYLE, "carry_run", 0.02)


# ------------------------------------------------------------------ fishing


# The default rod as sampled from the published asset, in the right palm frame
# (x thumb, y fingers, z palm contact): the rod's direction out of the fist,
# the reel knob's place and the left palm frame on it. Used only without
# companions.json.
DEFAULT_ROD = {"scale": 0.85, "rod": (0.674, 0.739, 0.011), "knob": (-0.0235, 0.114, 0.0665),
               "knobFingers": (0.216, 0.863, -0.457), "knobContact": (-0.111, -0.444, -0.889)}


def rod_data(ctx: Context) -> dict:
    if ctx.companions and "rod" in ctx.companions and "inGripFrame" in ctx.companions["rod"]:
        rod = ctx.companions["rod"]
        frame = rod["inGripFrame"]
        exit_ = Vector(frame["lineExit"]["position"]).normalized()
        return {"scale": rod["scale"], "rod": tuple(exit_), "knob": tuple(frame["secondary"]["position"]),
                "knobFingers": tuple(frame["secondary"]["y"]), "knobContact": tuple(frame["secondary"]["z"]),
                "reelCenter": frame["reelCenter"], "reelAxis": frame["reelAxis"]}
    return DEFAULT_ROD


def rod_frame(ctx: Context, aim, roll: float = 0.0) -> tuple[Vector, Vector, Vector]:
    """World axes (thumb x, fingers y, palm contact z) of the right palm for a rod pointing along ``aim``.

    The rod lies in the palm's plane at the angle the rod's own grip frame
    gives it; the palm faces in, towards the angler's left (``roll`` turns the
    grip about the rod), so the reel hangs below with its crank on the left.
    """
    data = rod_data(ctx)
    a, b, _ = data["rod"]
    length = math.hypot(a, b)
    a, b = a / length, b / length
    rod = V(*aim).normalized()
    contact = V(1.0, 0.0, 0.0) - rod * rod.x
    contact = (q_axis(rod, roll) @ contact).normalized()
    w = contact.cross(rod).normalized()
    thumb = (rod * a - w * b).normalized()
    fingers = (rod * b + w * a).normalized()
    return thumb, fingers, contact


def rod_knob_offset(ctx: Context, thumb: Vector, fingers: Vector, contact: Vector, turn: float = 0.0) -> Vector:
    """The reel knob relative to the right palm, from the published rod at its in-hand scale."""
    data = rod_data(ctx)
    knob = Vector(data["knob"])
    if "reelCenter" in data:
        center = Vector(data["reelCenter"])
        knob = center + Quaternion(Vector(data["reelAxis"]), turn * math.tau) @ (knob - center)
    elif abs(turn) > 1e-9:
        raise ValueError("Reeling requires freshly sampled reel centre and axle")
    kx, ky, kz = knob
    return (thumb * kx + fingers * ky + contact * kz) * data["scale"]


def rod_hold(ctx: Context, grip_at=(-0.02, -0.28, 1.10), aim=(0.06, -0.76, 0.65), roll: float = 0.0,
             turn: float = 0.0, lean: float = 0.0, twist: float = 0.0) -> dict:
    """Both hands on the rod as the runtime will dock it: right palm round the reel seat, left on the knob.

    ``turn`` winds the crank, the knob circling the reel axle (the rod's
    lateral axis) from its rest place.
    """
    d = stand(spitch=3.0 + lean, syaw=twist, hlevel=0.85, wpitch=5.0)
    d.update(foot("L", 0.14, -0.13, 0.0, 14.0))
    d.update(foot("R", -0.13, 0.03, 0.0, 6.0))
    data = rod_data(ctx)
    thumb, fingers, contact = rod_frame(ctx, aim, roll)
    grip_at = V(*grip_at)
    knob_now = grip_at + rod_knob_offset(ctx, thumb, fingers, contact, turn)
    d.update(held(ctx, "R", grip_at, thumb, contact, elbow=(-0.8, 0.45, -0.4), comfort=True))
    d.update(grip("R", "handle"))
    fx, fy, fz = data["knobFingers"]
    cx, cy, cz = data["knobContact"]
    left_fingers = thumb * fx + fingers * fy + contact * fz
    left_contact = thumb * cx + fingers * cy + contact * cz
    # The knob turns in the fingers: the left palm faces the reel and the hand
    # otherwise follows its forearm, so the wrist stays straight all round the crank.
    d.update(socket_reach("L", knob_now, hand_q(ctx, "L", left_fingers, left_contact), elbow=(0.85, 0.35, -0.4),
                          free_roll=True))
    d.update(grip("L", "pinch"))
    return d


ROD_KEYS = ("kx", "ky", "kz", "ax", "ay", "az", "turn", "lean", "twist", "pyaw", "pz", "ppitch", "hlevel", "wpitch",
            "hyaw", "cpitch")
ROD_REST = {"kx": 0.02, "ky": -0.36, "kz": 1.18, "ax": 0.04, "ay": -0.75, "az": 0.66, "turn": 0.0, "lean": 0.0,
            "twist": 0.0, "pyaw": 0.0, "pz": -0.004, "ppitch": 1.5, "hlevel": 0.85, "wpitch": 5.0, "hyaw": 0.0,
            "cpitch": 0.0}


def rod_key(grip=None, aim=None, **values) -> dict:
    """A rod key: the right palm's place, the rod's direction, and body channels."""
    key = dict(values)
    if grip is not None:
        key.update(kx=grip[0], ky=grip[1], kz=grip[2])
    if aim is not None:
        key.update(ax=aim[0], ay=aim[1], az=aim[2])
    unknown = set(key) - set(ROD_KEYS)
    if unknown:
        raise ValueError(f"Unknown rod channels: {sorted(unknown)}")
    return key


def rod_clip(ctx: Context, keys, loop: bool = False, lags: dict | None = None, overlay=None) -> Clip:
    """Key the rod, not the hands: every frame solves both hands onto one rigid rod.

    Interpolating two hand targets independently would bend the rod between
    keys; here the knob, aim and body channels interpolate, and ``rod_hold``
    places the right grip and the left hand on the reel from them.
    """
    duration = ctx.duration
    filled, previous = [], dict(ROD_REST)
    for time, key in sorted(keys, key=lambda item: item[0]):
        current = dict(previous)
        current.update(key)
        filled.append((time, current))
        previous = current
    if loop and filled and abs(filled[-1][0] - duration) < 1e-6:
        filled = filled[:-1]
    times = [time for time, _ in filled]
    tracks = {name: Track(times, [key[name] for _, key in filled], duration if loop else None) for name in ROD_KEYS}
    lags = lags or {}

    def sample(t: float) -> dict:
        v = {}
        for name, track in tracks.items():
            local = t - lags.get(name, 0.0)
            v[name] = track(local if loop else clamp(local, 0.0, duration))
        if overlay:
            overlay(t, v)
        d = rod_hold(ctx, grip_at=(v["kx"], v["ky"], v["kz"]), aim=(v["ax"], v["ay"], v["az"]), turn=v["turn"],
                     lean=v["lean"], twist=v["twist"])
        for name in ("pyaw", "pz", "ppitch", "hlevel", "wpitch", "hyaw", "cpitch"):
            d[name] = v[name]
        return d

    return Clip(ctx.spec["name"], duration, loop, sample)


def fishing_idle(ctx: Context) -> Clip:
    """Rod held ready over the water, breathing, eyes along the line."""
    def overlay(t: float, v: dict) -> None:
        phase = t / ctx.duration
        breath = math.sin(2.0 * math.pi * phase)
        v["kz"] += 0.006 * breath
        v["az"] += 0.015 * breath
        v["cpitch"] = -0.8 * breath
        v["hyaw"] = 3.0 * math.sin(2.0 * math.pi * (phase + 0.2))

    return rod_clip(ctx, [(0.0, rod_key())], loop=True, overlay=overlay)


def reel(ctx: Context) -> Clip:
    """One turn of the crank per loop; the shoulders work a little with each turn."""
    def overlay(t: float, v: dict) -> None:
        phase = t / ctx.duration
        v["turn"] = phase
        v["twist"] = 1.5 * math.sin(2.0 * math.pi * phase)

    return rod_clip(ctx, [(0.0, rod_key(grip=(0.02, -0.35, 1.19), aim=(0.03, -0.72, 0.69), lean=2.0,
                                        hlevel=0.9))], loop=True, overlay=overlay)


def slack(ctx: Context) -> Clip:
    """Line gone slack: rod tip dropped towards the water, hands low, weight easy."""
    def overlay(t: float, v: dict) -> None:
        sway = math.sin(2.0 * math.pi * t / ctx.duration)
        v["kz"] += 0.008 * sway
        v["az"] += 0.03 * sway

    return rod_clip(ctx, [(0.0, rod_key(grip=(0.06, -0.34, 1.09), aim=(0.12, -0.95, 0.30), lean=2.0,
                                        hlevel=0.8, wpitch=12.0))], loop=True, overlay=overlay)


def brace(ctx: Context) -> Clip:
    """Fighting a fish: tip high and leaning back, pumping without turning the crank."""
    def overlay(t: float, v: dict) -> None:
        phase = t / ctx.duration
        pump = 0.5 - 0.5 * math.cos(2.0 * math.pi * phase)
        v["ky"] += 0.02 * pump
        v["kz"] += 0.05 * pump
        v["ay"] += 0.14 * pump
        v["az"] += 0.08 * pump
        v["lean"] -= 2.5 * pump

    # An upper-body layer: the legs stay the base clip's, so the lean lives in
    # the spine and must stay a lean, not a backbend.
    return rod_clip(ctx, [(0.0, rod_key(grip=(0.03, -0.31, 1.25), aim=(0.0, -0.52, 0.85), lean=-5.0,
                                        ppitch=-2.0, pz=-0.03, hlevel=0.9, wpitch=0.0))], loop=True, overlay=overlay)


def cast(ctx: Context) -> Clip:
    """A compact two-handed cast over the right shoulder.

    The rod tips up and back past vertical over the right shoulder with the
    hands no higher than the chin (the big head leaves no room above it), a
    beat to load it, a drive forward and down to the release on the catalog
    marker, then the follow-through lowers the tip towards the water.
    """
    release = ctx.marker("cast_release")
    keys = [
        (0.0, rod_key()),
        (0.24, rod_key(grip=(-0.08, -0.31, 1.34), aim=(-0.30, 0.30, 0.90), lean=-5.0, twist=-12.0, pyaw=-4.0,
                       hlevel=0.95, wpitch=6.0)),
        (0.40, rod_key(grip=(-0.10, -0.28, 1.33), aim=(-0.36, 0.52, 0.77), lean=-7.0, twist=-15.0, pyaw=-5.0)),
        (release, rod_key(grip=(-0.02, -0.36, 1.30), aim=(-0.08, -0.58, 0.81), lean=6.0, twist=4.0, pyaw=1.0,
                          wpitch=4.0)),
        (0.70, rod_key(grip=(0.01, -0.38, 1.17), aim=(0.0, -0.94, 0.34), lean=9.0, twist=6.0, pyaw=1.0)),
        (ctx.duration, rod_key(**ROD_REST)),
    ]
    return rod_clip(ctx, keys, lags={"hyaw": 0.04, "wpitch": 0.04})


def hookset(ctx: Context) -> Clip:
    """A short hard sweep of the rod upward and back, then down into the fighting hold."""
    keys = [
        (0.0, rod_key()),
        (0.10, rod_key(grip=(0.01, -0.29, 1.32), aim=(-0.06, -0.26, 0.96), lean=-7.0, pz=-0.02, hlevel=0.9)),
        (0.22, rod_key(grip=(0.01, -0.29, 1.32), aim=(-0.06, -0.26, 0.96), lean=-7.0, pz=-0.02)),
        (0.38, rod_key(grip=(0.03, -0.31, 1.25), aim=(0.0, -0.5, 0.87), lean=-5.0)),
        (ctx.duration, rod_key(**ROD_REST)),
    ]
    return rod_clip(ctx, keys)


RECIPES = {
    "walk_start": walk_start, "run_start": run_start, "stop": stop, "turn_left": turn_left,
    "turn_right": turn_right, "jump_start": jump_start, "fall": fall, "land_soft": land_soft,
    "land_hard": land_hard, "plant": plant, "harvest": harvest, "water": water, "workstation": workstation,
    "craft_tailor": craft_tailor, "craft_tool": craft_tool, "gear_check": gear_check, "pickup": pickup,
    "place": place, "carry_idle": carry_idle, "carry_walk": carry_walk, "carry_run": carry_run,
    "fishing_idle": fishing_idle, "reel": reel, "slack": slack, "brace": brace, "cast": cast,
    "hookset": hookset,
}
