"""The Neva player's performances, authored on its fitted rig.

Each catalog clip is a recipe: key poses on a timeline, or a procedural gait,
sampled at 60 Hz and solved by ``player_motion``. A pose is a flat set of
named channels so that any two poses interpolate:

* ``px py pz`` pelvis offset (m) and ``pyaw ppitch proll`` its rotation (deg);
* ``syaw spitch sroll`` spine bend spread over the four torso bones, and
  ``cyaw cpitch croll`` an extra chest rotation (breath, a reach);
* ``nyaw npitch nroll`` neck and ``hyaw hpitch hroll`` head; ``hlevel``
  blends the head towards a world-level gaze turned by ``wyaw`` / ``wpitch``;
* per side ``S`` in ``L``/``R``: clavicle ``celev_S cprot_S``; arm angles
  ``flex_S abd_S twist_S elbow_S pron_S wflex_S wdev_S`` (``ArmFK``); an IK
  wrist target ``hx_S hy_S hz_S`` weighted by ``ik_S``, given in the root
  frame or, weighted by ``hc_S``, relative to the chest; an elbow direction
  ``ex_S ey_S ez_S``; a hand orientation quaternion ``qw_S qx_S qy_S qz_S``
  weighted by ``hq_S``; finger curls ``g2_S g3_S g4_S`` and thumb
  ``gto_S gtc_S``;
* per side a foot ``fx_S fy_S flift_S fyaw_S fpitch_S froll_S`` and the
  knee's outward set ``knee_S`` (``FootSpec``); ``fneutral_S`` blends out the measured boot rest splay for locomotion.

Values are metres and degrees in the character frame of ``player_motion``.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Callable

from mathutils import Quaternion, Vector

from .player_motion import (FORWARD, GRIPS, SIDES, X, Y, Z, ArmFK, FootSpec, Pose, RigModel, align, arm_fk,
                            clamp, foot_placement, lerp, q_axis, q_ypr, set_hand, side_sign, smooth,
                            solve_arm, solve_leg, wrist_of_socket)

SPINE = (("Hips", 0.18), ("Abdomen", 0.26), ("Torso", 0.30), ("Chest", 0.26))

# ------------------------------------------------------------------ channels


def base_channels() -> dict[str, float]:
    """A relaxed, balanced stand: soft knees, arms hanging close, loose hands."""
    d = {"px": 0.0, "py": 0.0, "pz": -0.004, "pyaw": 0.0, "ppitch": 1.5, "proll": 0.0,
         "syaw": 0.0, "spitch": 1.0, "sroll": 0.0, "cyaw": 0.0, "cpitch": 0.0, "croll": 0.0,
         "nyaw": 0.0, "npitch": 0.0, "nroll": 0.0, "hyaw": 0.0, "hpitch": 0.0, "hroll": 0.0,
         "hlevel": 0.6, "wyaw": 0.0, "wpitch": 2.0}
    for side in SIDES:
        sign = side_sign(side)
        d.update({f"celev_{side}": -2.0, f"cprot_{side}": 0.0,
                  f"flex_{side}": 2.0, f"abd_{side}": -9.0, f"twist_{side}": 6.0, f"elbow_{side}": 12.0,
                  f"pron_{side}": 8.0, f"wflex_{side}": 6.0, f"wdev_{side}": 0.0,
                  f"ik_{side}": 0.0, f"hx_{side}": 0.0, f"hy_{side}": 0.0, f"hz_{side}": 0.0,
                  f"hc_{side}": 0.0, f"ex_{side}": sign * 0.4, f"ey_{side}": 0.7, f"ez_{side}": -0.6,
                  f"qw_{side}": 1.0, f"qx_{side}": 0.0, f"qy_{side}": 0.0, f"qz_{side}": 0.0,
                  f"hq_{side}": 0.0, f"cf_{side}": 0.0, f"hs_{side}": 0.0, f"hr_{side}": 0.0,
                  f"fx_{side}": sign * 0.118, f"fy_{side}": -0.052, f"flift_{side}": 0.0,
                  f"fyaw_{side}": 10.0, f"fneutral_{side}": 0.0, f"fpitch_{side}": 0.0, f"froll_{side}": 0.0,
                  f"knee_{side}": 7.0})
        d.update(grip(side, "relaxed"))
    return d


def grip(side: str, name_or_values, amount: float = 1.0) -> dict[str, float]:
    values = GRIPS[name_or_values] if isinstance(name_or_values, str) else name_or_values
    relaxed = GRIPS["relaxed"]
    values = tuple(lerp(r, v, amount) for r, v in zip(relaxed, values))
    return dict(zip((f"g2_{side}", f"g3_{side}", f"g4_{side}", f"gto_{side}", f"gtc_{side}"), values))


def foot(side: str, x: float | None = None, y: float | None = None, lift: float = 0.0, yaw: float = 10.0,
         pitch: float = 0.0, roll: float = 0.0) -> dict[str, float]:
    sign = side_sign(side)
    return {f"fx_{side}": sign * 0.118 if x is None else x, f"fy_{side}": -0.052 if y is None else y,
            f"flift_{side}": lift, f"fyaw_{side}": yaw, f"fpitch_{side}": pitch, f"froll_{side}": roll}


def arm(side: str, flex=None, abd=None, twist=None, elbow=None, pron=None, wflex=None, wdev=None) -> dict:
    values = {"flex": flex, "abd": abd, "twist": twist, "elbow": elbow, "pron": pron, "wflex": wflex,
              "wdev": wdev}
    return {f"{key}_{side}": value for key, value in values.items() if value is not None}


def reach(side: str, target, elbow=None, chest: float = 0.0, weight: float = 1.0,
          hand: Quaternion | None = None, hand_weight: float = 1.0, comfort: bool = False) -> dict[str, float]:
    """An IK wrist target (root frame, or chest frame when ``chest`` is 1).

    ``comfort`` lets the solver place the elbow where the forearm lines up
    with the hand instead of following ``elbow`` strictly.
    """
    d = {f"ik_{side}": weight, f"hx_{side}": target[0], f"hy_{side}": target[1], f"hz_{side}": target[2],
         f"hc_{side}": chest, f"cf_{side}": 1.0 if comfort else 0.0}
    if elbow is not None:
        e = Vector(elbow).normalized()
        d.update({f"ex_{side}": e.x, f"ey_{side}": e.y, f"ez_{side}": e.z})
    if hand is not None:
        d.update({f"qw_{side}": hand.w, f"qx_{side}": hand.x, f"qy_{side}": hand.y, f"qz_{side}": hand.z,
                  f"hq_{side}": hand_weight})
    return d


def socket_reach(side: str, socket_at, hand: Quaternion, elbow=None, free_roll: bool = False) -> dict[str, float]:
    """Put the hand socket (the palm) at ``socket_at``, the elbow where the arm is comfortable.

    With ``free_roll`` the hand holds something that turns in the fingers (a
    reel knob): ``hand`` only says which way the palm should face, and the
    hand otherwise carries on the line of the forearm, wrist straight.
    """
    d = reach(side, socket_at, elbow=elbow, hand=hand, comfort=True)
    d.update({f"hs_{side}": 1.0, f"hr_{side}": 1.0 if free_roll else 0.0})
    return d


def merge(*parts: dict) -> dict:
    result: dict = {}
    for part in parts:
        result.update(part)
    return result


def mirror_channels(d: dict) -> dict:
    """Swap sides: a pose seen in a mirror across the sagittal plane."""
    out = dict(d)
    for key in ("px",):
        out[key] = -d[key]
    for key in ("pyaw", "proll", "syaw", "sroll", "cyaw", "croll", "nyaw", "nroll", "hyaw", "hroll", "wyaw"):
        out[key] = -d[key]
    for key, value in d.items():
        if key.endswith("_L") or key.endswith("_R"):
            other = key[:-1] + ("R" if key.endswith("_L") else "L")
            out[other] = value
    for side in SIDES:
        for key in (f"fx_{side}", f"hx_{side}", f"ex_{side}"):
            out[key] = -out[key]
        # A mirrored hand orientation: reflect the rotation across the X plane.
        out[f"qy_{side}"], out[f"qz_{side}"] = -out[f"qy_{side}"], -out[f"qz_{side}"]
    return out


# ------------------------------------------------------------------ building


def chest_point(pose: Pose, local: Vector) -> Vector:
    """A point given relative to the chest's rest head, carried by the posed chest."""
    m = pose.m
    return pose.H["Chest"] + pose.W["Chest"] @ local


def build_pose(model: RigModel, d: dict[str, float]) -> Pose:
    pose = Pose(model)
    pose.override["Body"] = model.rest_head["Body"] + Vector((d["px"], d["py"], d["pz"]))
    pose.local["Body"] = q_ypr(d["pyaw"], d["ppitch"], d["proll"])
    for bone, weight in SPINE:
        pose.local[bone] = q_ypr(d["syaw"] * weight, d["spitch"] * weight, d["sroll"] * weight)
    pose.local["Chest"] = pose.local["Chest"] @ q_ypr(d["cyaw"], d["cpitch"], d["croll"])
    pose.local["Neck"] = q_ypr(d["nyaw"], d["npitch"], d["nroll"])
    pose.local["Head"] = q_ypr(d["hyaw"], d["hpitch"], d["hroll"])
    for side in SIDES:
        sign = side_sign(side)
        pose.local[f"Shoulder.{side}"] = q_axis(Y, -sign * d[f"celev_{side}"]) @ q_axis(Z, -sign * d[f"cprot_{side}"])
    pose.evaluate("Root")
    level = clamp(d["hlevel"], 0.0, 1.0)
    if level > 0.0:
        # Stabilise the gaze: the head keeps a world-level orientation (turned
        # by wyaw / wpitch plus the head's own offsets) whatever the torso does;
        # the neck takes a third of the correction so it bends, not snaps.
        current = pose.W["Head"]
        desired = q_ypr(d["wyaw"] + d["hyaw"], d["wpitch"] + d["hpitch"], d["hroll"])
        if desired.dot(current) < 0:
            desired.negate()
        target = current.slerp(desired, level)
        correction = target @ current.inverted()
        pose.set_world("Neck", Quaternion().slerp(correction, 0.35) @ pose.W["Neck"])
        pose.evaluate("Neck")
        pose.set_world("Head", target)
        pose.evaluate("Head")
    for side in SIDES:
        arm_fk(pose, side, ArmFK(d[f"flex_{side}"], d[f"abd_{side}"], d[f"twist_{side}"], d[f"elbow_{side}"],
                                 d[f"pron_{side}"], d[f"wflex_{side}"], d[f"wdev_{side}"]))
        weight = clamp(d[f"ik_{side}"], 0.0, 1.0)
        arm_rest = model.arms[side]
        if weight > 1e-4:
            shoulder = pose.H[arm_rest.upper]
            fk_wrist, fk_elbow = pose.H[arm_rest.hand].copy(), pose.H[arm_rest.lower].copy()
            local_target = Vector((d[f"hx_{side}"], d[f"hy_{side}"], d[f"hz_{side}"]))
            chest_weight = clamp(d[f"hc_{side}"], 0.0, 1.0)
            target = local_target.lerp(chest_point(pose, local_target), chest_weight) if chest_weight else local_target
            reach_dir = (fk_wrist - shoulder).normalized()
            fk_bend = (fk_elbow - shoulder) - reach_dir * (fk_elbow - shoulder).dot(reach_dir)
            fk_bend = fk_bend.normalized() if fk_bend.length > 1e-6 else Vector((0.0, 1.0, 0.0))
            hint = fk_bend.lerp(Vector((d[f"ex_{side}"], d[f"ey_{side}"], d[f"ez_{side}"])).normalized(), weight)
            hand_weight = clamp(d[f"hq_{side}"], 0.0, 1.0) * weight
            if d.get(f"hs_{side}", 0.0) > 0.5 and hand_weight > 1e-4:
                _socket_arm(pose, side, d, target, hint)
                set_hand(pose, side, (d[f"g2_{side}"], d[f"g3_{side}"], d[f"g4_{side}"], d[f"gto_{side}"],
                                      d[f"gtc_{side}"]))
                continue
            solve_arm(pose, side, fk_wrist.lerp(target, weight), hint)
            if hand_weight > 1e-4:
                natural = pose.W[arm_rest.hand].copy()
                wanted = Quaternion((d[f"qw_{side}"], d[f"qx_{side}"], d[f"qy_{side}"], d[f"qz_{side}"])).normalized()
                if wanted.dot(natural) < 0:
                    wanted.negate()
                solve_arm(pose, side, fk_wrist.lerp(target, weight), hint, natural.slerp(wanted, hand_weight),
                          comfort=d.get(f"cf_{side}", 0.0) > 0.5)
        set_hand(pose, side, (d[f"g2_{side}"], d[f"g3_{side}"], d[f"g4_{side}"], d[f"gto_{side}"], d[f"gtc_{side}"]))
    for side in SIDES:
        # The source boots have different outward rest angles. Locomotion
        # neutralises that measured splay before adding its small toe-out;
        # starts/stops blend this correction instead of snapping at cutover.
        neutral = model.legs[side].boot_yaw * d[f"fneutral_{side}"]
        spec = FootSpec(d[f"fx_{side}"], d[f"fy_{side}"], d[f"flift_{side}"], d[f"fyaw_{side}"] + neutral,
                        d[f"fpitch_{side}"], d[f"froll_{side}"])
        head, rotation = foot_placement(model, side, spec)
        error = solve_leg(pose, side, head, rotation, d[f"knee_{side}"] + neutral)
        if error > 0.004:
            pose.notes.append(f"{side} leg short by {error * 1000:.1f} mm")
    return pose


def _socket_arm(pose: Pose, side: str, d: dict[str, float], socket_target: Vector, hint: Vector) -> None:
    """Solve an arm whose target is the palm socket rather than the wrist (see ``socket_reach``)."""
    m = pose.m
    arm = m.arms[side]
    wanted = Quaternion((d[f"qw_{side}"], d[f"qx_{side}"], d[f"qy_{side}"], d[f"qz_{side}"])).normalized()
    rotation = wanted
    free = d.get(f"hr_{side}", 0.0) > 0.5
    rest_forearm = (m.rest_head[arm.hand] - m.rest_head[arm.lower]).normalized()
    facing = (wanted @ arm.palm).normalized()
    for _ in range(4 if free else 1):
        solve_arm(pose, side, wrist_of_socket(pose, side, socket_target, rotation), hint, rotation, comfort=True)
        if not free:
            break
        # The hand keeps its rest relation to the forearm (a straight wrist),
        # turned about the forearm until the palm faces as near ``facing``
        # as it can; the socket offset moves with it, so re-solve.
        forearm = (pose.H[arm.hand] - pose.H[arm.lower]).normalized()
        palm = facing - forearm * facing.dot(forearm)
        if palm.length < 1e-6:
            break
        rotation = align(rest_forearm, arm.palm, forearm, palm.normalized())


# ------------------------------------------------------------------ timing


def _tangents(times: list[float], values: list[float]) -> list[float]:
    """Catmull-Rom slopes, flattened at holds and turning points (auto-clamped)."""
    n = len(values)
    slopes = []
    for i in range(n):
        if i == 0 or i == n - 1:
            slopes.append(0.0)
            continue
        before, after = values[i] - values[i - 1], values[i + 1] - values[i]
        if before * after <= 0.0:
            slopes.append(0.0)
            continue
        slopes.append((values[i + 1] - values[i - 1]) / (times[i + 1] - times[i - 1]))
    return slopes


def _hermite(t0, t1, v0, v1, m0, m1, t):
    h = t1 - t0
    s = (t - t0) / h
    s2, s3 = s * s, s * s * s
    return ((2 * s3 - 3 * s2 + 1) * v0 + (s3 - 2 * s2 + s) * h * m0 + (-2 * s3 + 3 * s2) * v1
            + (s3 - s2) * h * m1)


class Track:
    """One channel through timed values: auto-clamped Hermite, optionally periodic."""

    def __init__(self, times: list[float], values: list[float], period: float | None = None,
                 slopes: list[float] | None = None):
        times, values = list(times), list(values)
        self.period = period
        self.start = times[0]
        if period and len(times) > 1:
            # Unroll two keys either side so the seam is as smooth as any key.
            times = [times[-2] - period, times[-1] - period] + times + [times[0] + period, times[1] + period]
            values = [values[-2], values[-1]] + values + [values[0], values[1]]
        elif period:
            times, values = [times[0], times[0] + period], [values[0], values[0]]
        self.times, self.values = times, values
        self.slopes = slopes if slopes is not None else _tangents(times, values)

    def __call__(self, t: float) -> float:
        times, values = self.times, self.values
        if self.period:
            t = self.start + ((t - self.start) % self.period)
        if t <= times[0]:
            return values[0]
        if t >= times[-1]:
            return values[-1]
        for i in range(len(times) - 1):
            if times[i] <= t <= times[i + 1]:
                if times[i + 1] - times[i] < 1e-12:
                    return values[i + 1]
                return _hermite(times[i], times[i + 1], values[i], values[i + 1], self.slopes[i],
                                self.slopes[i + 1], t)
        return values[-1]


class Timeline:
    """Key poses at times; channels interpolate independently, with optional lags."""

    def __init__(self, duration: float, keys: list[tuple[float, dict]], loop: bool = False,
                 lags: dict[str, float] | None = None, base: dict | None = None):
        self.duration, self.loop = duration, loop
        base = base or base_channels()
        filled, previous = [], dict(base)
        for time, key in sorted(keys, key=lambda item: item[0]):
            current = dict(previous)
            current.update(key)
            filled.append((time, current))
            previous = current
        if loop and filled and abs(filled[-1][0] - duration) < 1e-6:
            filled = filled[:-1]
        self.keys = filled
        times = [time for time, _ in filled]
        self.tracks = {}
        for channel in base:
            values = [key[channel] for _, key in filled]
            if channel.startswith("q") and channel[1] in "wxyz" and channel[2] == "_":
                continue
            self.tracks[channel] = Track(times, values, duration if loop else None)
        # Hand orientations: keep each key's quaternion on the previous one's
        # hemisphere so component-wise interpolation takes the short arc.
        for side in SIDES:
            quats, last = [], None
            for _, key in filled:
                q = Quaternion((key[f"qw_{side}"], key[f"qx_{side}"], key[f"qy_{side}"], key[f"qz_{side}"]))
                if last is not None and q.dot(last) < 0:
                    q.negate()
                quats.append(q)
                last = q
            for index, component in enumerate("wxyz"):
                self.tracks[f"q{component}_{side}"] = Track(times, [q[index] for q in quats],
                                                            duration if loop else None)
        self.lags = lags or {}

    def lag(self, channel: str) -> float:
        best, length = 0.0, -1
        for prefix, seconds in self.lags.items():
            if channel.startswith(prefix) and len(prefix) > length:
                best, length = seconds, len(prefix)
        return best

    def __call__(self, t: float) -> dict[str, float]:
        result = {}
        for channel, track in self.tracks.items():
            local = t - self.lag(channel)
            if not self.loop:
                local = clamp(local, 0.0, self.duration)
            result[channel] = track(local)
        return result


# ------------------------------------------------------------------ clips


@dataclass
class Clip:
    name: str
    duration: float
    loop: bool
    sample: Callable[[float], dict]
    reference_speed: float | None = None
    # Root travel the clip assumes (m, forward), e.g. a start or stop.
    travel: Callable[[float], float] | None = None
    # Catalog contact intervals: "measured" from the planted soles, or "none"
    # where the runtime owns the feet (supports, stirrups, a gliding root).
    contacts: str = "measured"
    # Catalog events this recipe owns (footsteps); None keeps the catalog's.
    events: list[dict] | None = None
    notes: list[str] = field(default_factory=list)
    # Analytic stance windows override height-threshold diagnostics for gaits.
    contact_windows: dict | None = None


def cycle(phase: float) -> float:
    return phase - math.floor(phase)


def wave(phase: float, peak: float = 0.0) -> float:
    """Cosine with its maximum at ``peak`` (cycles)."""
    return math.cos(2.0 * math.pi * (phase - peak))


# -------------------------------------------------------- locomotion (gait)


@dataclass
class Gait:
    """A symmetric in-place gait whose stance feet move at the reference speed.

    Left touchdown is phase 0, right touchdown phase 0.5. A stance foot's
    *reference* (its flat-foot sole point) enters ``ahead`` metres in front of
    its rest place and slides back at the reference speed until toe-off;
    heel and toe rolls pivot about ground points that keep that speed, so the
    contact never slips. The swing is a spline through ``swing`` keys of
    (fraction, ahead, lift, pitch), ending at the next touchdown.
    """

    period: float
    speed: float
    stance: float
    ahead: float
    width: float
    swing: list[tuple[float, float, float, float]]
    touchdown_pitch: float
    toeoff_pitch: float
    heel_rock: float      # fraction of stance rolling from the heel onto the flat foot
    toe_rock: float       # fraction of stance rolling from flat onto the toe
    yaw: float = 10.0
    knee: float = 7.0
    touchdown_speed: float = 0.75   # fraction of the reference speed the foot keeps at touchdown

    def foot(self, side: str, phase: float) -> tuple[float, float, float, float]:
        """(x, y, lift, pitch) of one foot at a cycle phase."""
        local = cycle(phase - (0.0 if side == "L" else 0.5))
        x = side_sign(side) * self.width
        travel = self.speed * self.period
        if local < self.stance:
            u = local / self.stance
            ahead = self.ahead - travel * local
            if u < self.heel_rock:
                pitch = self.touchdown_pitch * (1.0 - smooth(u / self.heel_rock))
            elif u > 1.0 - self.toe_rock:
                k = (u - (1.0 - self.toe_rock)) / self.toe_rock
                pitch = self.toeoff_pitch * smooth(k)
            else:
                pitch = 0.0
            return x, -0.052 - ahead, 0.0, pitch
        u = (local - self.stance) / (1.0 - self.stance)
        return (x, -0.052 - self._swing_value(u, 1), self._swing_value(u, 2), self._swing_value(u, 3))

    def _swing_value(self, u: float, column: int) -> float:
        swing_time = (1.0 - self.stance) * self.period
        start_ahead = self.ahead - self.speed * self.period * self.stance
        keys = [(0.0, start_ahead, 0.0, self.toeoff_pitch)] + self.swing + [(1.0, self.ahead, 0.0, self.touchdown_pitch)]
        times = [key[0] * swing_time for key in keys]
        values = [key[column] for key in keys]
        slopes = _tangents(times, values)
        if column == 1:
            # Leave the ground at ground speed and meet it nearly at ground speed.
            slopes[0] = -self.speed
            slopes[-1] = -self.speed * self.touchdown_speed
            # Keep the clamped zero slope at the recovery's rearward turning
            # point; a positive tangent there makes the leg reverse abruptly.
        elif column == 2:
            slopes[0] = 0.0
            slopes[-1] = 0.0
        elif column == 3:
            # Heel/toe stance rolls arrive with zero angular velocity. Match
            # that boundary instead of reversing the boot in one bake sample.
            slopes[0] = 0.0
            slopes[-1] = 0.0
        track = Track(times, values, slopes=slopes)
        return track(u * swing_time)

    def contacts(self, side: str, duration: float) -> list[tuple[float, float]]:
        start = 0.0 if side == "L" else 0.5
        end = start + self.stance
        spans = []
        if end <= 1.0:
            spans.append((start * duration, end * duration))
        else:
            spans.append((0.0, (end - 1.0) * duration))
            spans.append((start * duration, duration))
        return sorted(spans)


# Stance travel is the reach budget of a 0.87 m leg: the heel lands with the
# toe up and the foot leaves over a high heel rise, and the pelvis is lowest
# in double support, when both reach limits fall.
WALK = Gait(period=0.7333333333333333, speed=2.0, stance=0.54, ahead=0.29, width=0.075,
            swing=[(0.15, -0.53, 0.050, -34.0), (0.38, -0.17, 0.060, -15.0),
                   (0.60, 0.09, 0.045, -3.0), (0.82, 0.28, 0.030, 11.0)],
            touchdown_pitch=18.0, toeoff_pitch=-38.0, heel_rock=0.20, toe_rock=0.40, yaw=5.0, knee=2.0)

RUN = Gait(period=0.5333333333333333, speed=5.2, stance=0.25, ahead=0.27, width=0.065,
           swing=[(0.18, -0.49, 0.11, -42.0), (0.40, -0.30, 0.17, -34.0),
                  (0.62, 0.035, 0.12, -12.0), (0.84, 0.29, 0.055, 0.0)],
           touchdown_pitch=4.0, toeoff_pitch=-48.0, heel_rock=0.16, toe_rock=0.48, yaw=3.0, knee=2.0,
           touchdown_speed=0.8)


def gait_channels(gait: Gait, phase: float, style: dict) -> dict[str, float]:
    """Full-body walk or run at a cycle phase (left touchdown at 0)."""
    d = base_channels()
    s = style
    # Pelvis: lowest just after each touchdown, highest mid-stance (walk) or
    # mid-flight (run); sways over the stance foot; turns with the swinging
    # leg; drops on the swing side.
    high = 2.0 * s["bob_high"]
    d["pz"] = s["height"] + s["bob"] * wave(2.0 * phase, high)
    d["px"] = s["sway"] * math.sin(2.0 * math.pi * (phase - s["sway_lag"]))
    d["py"] = s.get("surge", 0.0) * wave(2.0 * phase, high)
    d["pyaw"] = -s["yaw"] * wave(phase, s["yaw_lag"])
    d["proll"] = -s["roll"] * math.sin(2.0 * math.pi * (phase + s["roll_lead"]))
    d["ppitch"] = s["tilt"] + s["tilt_wave"] * wave(2.0 * phase, high + 0.5)
    # Thorax counter-rotates and keeps the shoulders level.
    d["syaw"] = -d["pyaw"] * s["counter"]
    d["sroll"] = -d["proll"] * 0.8
    d["spitch"] = s["lean"] + s["lean_wave"] * wave(2.0 * phase, high + 0.6)
    d["hlevel"] = s["head_level"]
    d["wpitch"] = s["gaze"]
    for side in SIDES:
        x, y, lift, pitch = gait.foot(side, phase)
        d.update(foot(side, x, y, lift, -gait.yaw, pitch))
        d[f"fneutral_{side}"] = 1.0
        d[f"knee_{side}"] = gait.knee
        # Arms swing against the legs: the right arm leads when the left foot
        # lands. Elbows bend more on the forward swing.
        arm_phase = phase - s["arm_lag"] + (0.0 if side == "R" else 0.5)
        swing = wave(arm_phase)
        forward = 0.5 * (swing + 1.0)
        d[f"flex_{side}"] = s["arm_center"] + s["arm_swing"] * swing
        d[f"elbow_{side}"] = s["elbow"] + s["elbow_swing"] * forward
        d[f"abd_{side}"] = s["abd"] + s.get("abd_swing", 0.0) * forward
        d[f"twist_{side}"] = s["twist"] + s.get("twist_swing", 0.0) * forward
        d[f"pron_{side}"] = s["pron"]
        d[f"wflex_{side}"] = s["wflex"] + s["wflex_swing"] * wave(arm_phase - 0.08)
        d[f"cprot_{side}"] = s["clav"] * swing
        d[f"celev_{side}"] = -2.0 + s.get("clav_lift", 0.0) * forward
        d.update(grip(side, s["grip"], s["grip_amount"]))
    return d


WALK_STYLE = dict(height=-0.030, bob=0.008, bob_high=0.28, sway=0.010, sway_lag=0.03, yaw=3.5, yaw_lag=0.0,
                  roll=2.0, roll_lead=0.05, tilt=2.0, tilt_wave=0.5, counter=1.2, lean=1.5, lean_wave=0.4, head_level=0.85,
                  gaze=1.0, arm_lag=0.04, arm_center=2.0, arm_swing=18.0, elbow=12.0, elbow_swing=16.0,
                  abd=-8.0, abd_swing=2.0, twist=3.0, twist_swing=0.0, pron=8.0, wflex=2.0, wflex_swing=3.0,
                  clav=2.0, clav_lift=0.8, grip="loose", grip_amount=0.25)

RUN_STYLE = dict(height=-0.075, bob=0.023, bob_high=0.41, sway=0.006, sway_lag=0.0, yaw=5.0, yaw_lag=0.02,
                 roll=2.0, roll_lead=0.02, tilt=5.0, tilt_wave=1.0, counter=1.2, lean=3.0, lean_wave=0.8, head_level=0.9,
                 gaze=1.0, arm_lag=0.04, arm_center=3.0, arm_swing=32.0, elbow=72.0, elbow_swing=12.0,
                 abd=-8.0, abd_swing=2.0, twist=3.0, twist_swing=2.0, pron=15.0, wflex=0.0, wflex_swing=3.0,
                 clav=3.0, clav_lift=1.0, grip="fist", grip_amount=0.40)


def footsteps(gait: Gait) -> list[dict]:
    """Touchdowns: the left foot lands at phase 0, the right at phase 0.5."""
    return [{"name": "footstep_left", "timeSeconds": 0.0},
            {"name": "footstep_right", "timeSeconds": round(0.5 * gait.period, 6)}]


def walk_clip(name: str = "walk") -> Clip:
    return Clip(name, WALK.period, True, lambda t: gait_channels(WALK, t / WALK.period, WALK_STYLE),
                reference_speed=WALK.speed, events=footsteps(WALK),
                contact_windows={s: WALK.contacts(s, WALK.period) for s in SIDES})


def run_clip(name: str = "run") -> Clip:
    return Clip(name, RUN.period, True, lambda t: gait_channels(RUN, t / RUN.period, RUN_STYLE),
                reference_speed=RUN.speed, events=footsteps(RUN),
                contact_windows={s: RUN.contacts(s, RUN.period) for s in SIDES})


# ------------------------------------------------------------------ idle


def idle_clip() -> Clip:
    duration = 4.0

    def sample(t: float) -> dict:
        d = base_channels()
        phase = t / duration
        breath = math.sin(2.0 * math.pi * phase)
        # Weight drifts onto the left foot and back, the hips following it and
        # the torso leaning a touch the other way; one slow breath per cycle.
        shift = math.sin(2.0 * math.pi * (phase - 0.1))
        d["px"] = 0.012 * shift
        d["proll"] = -1.2 * shift
        d["sroll"] = 1.4 * shift
        d["pz"] = -0.004 - 0.003 * abs(shift)
        d["cpitch"] = -0.9 * breath
        d["spitch"] = 1.0 + 0.4 * breath
        for side in SIDES:
            d[f"celev_{side}"] = -2.0 + 1.0 * breath
            d[f"flex_{side}"] = 2.0 + 1.0 * math.sin(2.0 * math.pi * (phase - 0.15))
            d[f"elbow_{side}"] = 12.0 + 1.5 * math.sin(2.0 * math.pi * (phase - 0.2))
        # The gaze wanders a little, in two unhurried looks.
        d["hyaw"] = 4.0 * math.sin(2.0 * math.pi * (phase + 0.05)) + 1.5 * math.sin(4.0 * math.pi * phase)
        d["hpitch"] = 1.0 * math.sin(4.0 * math.pi * (phase + 0.2))
        d["hroll"] = -0.8 * shift
        return d

    return Clip("idle", duration, True, sample)


RECIPES: dict[str, Callable[[], Clip]] = {
    "idle": idle_clip,
    "walk": walk_clip,
    "run": run_clip,
}


def clip_for(name: str) -> Clip:
    if name not in RECIPES:
        raise KeyError(f"No player performance recipe for {name!r}")
    return RECIPES[name]()
