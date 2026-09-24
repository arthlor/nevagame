"""The player's rowboat, skiff and donkey performances, fitted to the published companions.

The runtime attaches the player to a companion anchor and, where the anchor
is a seat (the rowboat's rower seat, the donkey's rider socket), moves the
root so the pelvis sits on it; it then solves the feet onto the companion's
footrests or stirrups and the hands onto its oar, helm or rein grips. These
clips therefore carry the same contacts the runtime will ask for, sampled by
``sample_player_companions.mjs`` from the published GLBs, so the runtime
solve is a correction of millimetres and the torso, head, knees and elbows
the clip authors are what the player sees.

Board, dock, mount and dismount play while the runtime glides the root
between the ground and the anchor along ``sampleAttachmentCurve`` (a
smoothstep plus a small arc). They are authored in the root frame and end
(or begin) exactly on the seated or mounted pose of the ride clip.
"""
from __future__ import annotations

import math

from mathutils import Vector

from .player_actions import Context, V, palm_at, rod_hold, simple, stand
from .player_clips import Clip, foot, grip, merge, mirror_channels
from .player_motion import SIDES, FootSpec, clamp, foot_placement, lerp, side_sign, smooth

# The rowboat seat carries the pelvis this high above the soles on its footrests.
SEAT_HEIGHT = 0.292
SOLE_DEPTH = 0.0214     # the sole contact lies this far below the foot head, along the foot's up


def pelvis_at(ctx: Context, d: dict) -> Vector:
    return ctx.model.rest_head["Body"] + V(d["px"], d["py"], d["pz"])


def foot_to(ctx: Context, side: str, sole: Vector, pitch: float = 0.0, yaw: float = 10.0) -> dict:
    """Foot channels that put the sole contact at ``sole`` with the given pitch."""
    spec = FootSpec(0.0, 0.0, 0.0, yaw, pitch)
    head0, rotation = foot_placement(ctx.model, side, spec)
    rest_head = ctx.model.rest_head[f"Foot.{side}"]
    offset = head0 - V(0.0, 0.0, rest_head.z)
    head = sole + rotation @ V(0.0, 0.0, SOLE_DEPTH)
    return foot(side, head.x - offset.x, head.y - offset.y, head.z - rest_head.z - offset.z, yaw, pitch)


def companion(ctx: Context, key: str) -> dict:
    if not ctx.companions or key not in ctx.companions:
        raise ValueError(f"{ctx.spec['name']} needs companions.json with {key!r} "
                         "(tools/blender/sample_player_companions.mjs)")
    return ctx.companions[key]


# ------------------------------------------------------------------ rowboat


def rowboat_seated(ctx: Context, grips: dict | None, lean: float = 0.0) -> dict:
    """Seated on the thwart, soles on the tilted footrests, hands on the oar handles."""
    boat = companion(ctx, "rowboat")
    d = stand(pz=SEAT_HEIGHT - ctx.model.rest_head["Body"].z, ppitch=-2.0 + lean * 0.35, spitch=lean * 0.65,
              hlevel=0.85, wpitch=4.0)
    pelvis = pelvis_at(ctx, d)
    for side, name in (("L", "left"), ("R", "right")):
        rest = boat["feet"][name]
        normal = V(*rest["y"])
        tilt = math.degrees(math.atan2(normal.y, normal.z))
        d.update(foot_to(ctx, side, pelvis + V(*rest["position"]), pitch=tilt, yaw=8.0))
        d[f"knee_{side}"] = 6.0
        if grips is not None:
            handle = grips[name]
            d.update(palm_at(ctx, side, pelvis + V(*handle["position"]), handle["y"], handle["z"],
                             elbow=(side_sign(side) * 0.9, 0.3, -0.4)))
            d.update(grip(side, "handle"))
    return d


def oar_grips(ctx: Context, phase: float | None) -> dict:
    oars = companion(ctx, "rowboat")["oars"]
    if phase is None:
        return {side: oars[side]["rest"] for side in ("left", "right")}
    result = {}
    for side in ("left", "right"):
        stroke = oars[side]["stroke"]
        position = (phase % 1.0) * (len(stroke) - 1)
        i = min(int(position), len(stroke) - 2)
        f = position - i
        a, b = stroke[i], stroke[i + 1]
        result[side] = {key: [lerp(x, y, f) for x, y in zip(a[key], b[key])] for key in ("position", "y", "z")}
    return result


def rowboat_idle(ctx: Context) -> Clip:
    duration = ctx.duration

    def sample(t: float) -> dict:
        phase = t / duration
        breath = math.sin(2.0 * math.pi * phase)
        d = rowboat_seated(ctx, oar_grips(ctx, None), lean=1.5 + 0.8 * breath)
        d["cpitch"] = -0.8 * breath
        d["hyaw"] = 6.0 * math.sin(2.0 * math.pi * (phase + 0.15))
        return d

    return Clip(ctx.spec["name"], duration, True, sample)


def row(ctx: Context) -> Clip:
    """Follow the runtime oar stroke: reach forward to the catch, lay back through the finish."""
    duration = ctx.duration

    def sample(t: float) -> dict:
        phase = t / duration
        # Catch at phase 0 (handles furthest forward), finish at 0.5. The
        # trunk swings a beat after the handles; the head stays level.
        swing = math.cos(2.0 * math.pi * (phase - 0.04))
        d = rowboat_seated(ctx, oar_grips(ctx, phase), lean=4.0 + 16.0 * swing)
        d["hlevel"] = 0.95
        for side in SIDES:
            sign = side_sign(side)
            # Elbows flare out and back through the finish.
            d[f"ex_{side}"], d[f"ey_{side}"], d[f"ez_{side}"] = sign * 0.85, 0.45 - 0.25 * swing, -0.3
            d[f"cprot_{side}"] = 5.0 * swing
        return d

    return Clip(ctx.spec["name"], duration, True, sample)


# ------------------------------------------------------------------ skiff


def skiff_stance(ctx: Context, helm: str = "none", sway: float = 0.0) -> dict:
    """Standing at the driver station, soles on the deck footholds, knees soft for the swell."""
    skiff = companion(ctx, "skiff")["driver"]
    d = stand(pz=-0.03, ppitch=3.0, spitch=3.0, hlevel=0.9, wpitch=3.0)
    d["px"] = 0.012 * sway
    d["proll"] = -1.5 * sway
    d["sroll"] = 1.8 * sway
    for side, name in (("L", "left"), ("R", "right")):
        d.update(foot_to(ctx, side, V(*skiff["feet"][name]["position"]), yaw=12.0))
        d[f"knee_{side}"] = 10.0
    for side, name in (("L", "left"), ("R", "right")):
        if helm == "both" or (helm == "right" and side == "R"):
            handle = skiff["helm"][name]
            d.update(palm_at(ctx, side, V(*handle["position"]), handle["y"], handle["z"],
                             elbow=(side_sign(side) * 0.7, 0.3, -0.7)))
            d.update(grip(side, "handle"))
    return d


def skiff_idle(ctx: Context) -> Clip:
    duration = ctx.duration

    def sample(t: float) -> dict:
        phase = t / duration
        d = skiff_stance(ctx, "right", math.sin(2.0 * math.pi * phase))
        d["hyaw"] = 8.0 * math.sin(2.0 * math.pi * (phase + 0.3))
        d.update({"flex_L": 4.0, "abd_L": -6.0, "elbow_L": 18.0})
        return d

    return Clip(ctx.spec["name"], duration, True, sample)


def skiff_drive(ctx: Context) -> Clip:
    duration = ctx.duration

    def sample(t: float) -> dict:
        phase = t / duration
        d = skiff_stance(ctx, "both", math.sin(2.0 * math.pi * phase))
        # Knees ride the chop twice a cycle; the chest leans into the wheel.
        d["pz"] -= 0.012 * (0.5 - 0.5 * math.cos(4.0 * math.pi * phase))
        d["spitch"] = 5.0 + 1.5 * math.sin(4.0 * math.pi * phase)
        return d

    return Clip(ctx.spec["name"], duration, True, sample)


def skiff_fishing(ctx: Context) -> Clip:
    """A wide sea stance with the rod held ready, weight drifting with the boat's roll."""
    duration = ctx.duration

    def sample(t: float) -> dict:
        phase = t / duration
        sway = math.sin(2.0 * math.pi * phase)
        d = rod_hold(ctx)
        d.update(foot("L", 0.19, -0.14, 0.0, 16.0))
        d.update(foot("R", -0.18, 0.06, 0.0, 8.0))
        d["pz"] = -0.045
        d["px"] = 0.02 * sway
        d["proll"] = -2.5 * sway
        d["sroll"] = 3.0 * sway
        d["knee_L"] = d["knee_R"] = 12.0
        return d

    return Clip(ctx.spec["name"], duration, True, sample)


# ------------------------------------------------------------------ donkey


def mounted(ctx: Context, lean: float = 3.0) -> dict:
    """Astride: thighs round the barrel, soles in the stirrups, fists on the reins."""
    donkey = companion(ctx, "donkey")["gaits"]["idle"]["frames"][0]
    d = stand(pz=0.0, ppitch=2.0 + lean * 0.3, spitch=lean * 0.7, hlevel=0.9, wpitch=4.0)
    pelvis = pelvis_at(ctx, d)
    for side, name in (("L", "left"), ("R", "right")):
        d.update(foot_to(ctx, side, pelvis + V(*donkey["stirrups"][name]["position"]), yaw=6.0, pitch=4.0))
        d[f"knee_{side}"] = 32.0
        rein = donkey["reins"][name]
        d.update(palm_at(ctx, side, pelvis + V(*rein["position"]), rein["y"], rein["z"],
                         elbow=(side_sign(side) * 0.5, 0.6, -0.6)))
        d.update(grip(side, "reins"))
    return d


def mounted_gait(ctx: Context, kind: str) -> Clip:
    duration = ctx.duration

    def sample(t: float) -> dict:
        phase = t / duration
        if kind == "idle":
            breath = math.sin(2.0 * math.pi * phase)
            d = mounted(ctx, 3.0 + 0.6 * breath)
            d["cpitch"] = -0.8 * breath
            d["hyaw"] = 7.0 * math.sin(2.0 * math.pi * (phase + 0.2))
            return d
        if kind == "walk":
            # The back swings under the seat: hips roll and turn with each
            # hind step while the shoulders and head ride level.
            d = mounted(ctx, 4.0)
            d["proll"] = 3.0 * math.sin(2.0 * math.pi * phase)
            d["pyaw"] = 2.5 * math.sin(2.0 * math.pi * (phase - 0.25))
            d["ppitch"] += 1.5 * math.sin(4.0 * math.pi * phase)
            d["sroll"] = -2.4 * math.sin(2.0 * math.pi * (phase - 0.05))
            d["syaw"] = -2.0 * math.sin(2.0 * math.pi * (phase - 0.3))
            return d
        if kind == "trot":
            # Two diagonal beats a stride, absorbed in the lower back.
            beat = math.cos(4.0 * math.pi * phase)
            d = mounted(ctx, 6.0)
            d["ppitch"] += 3.0 * beat
            d["spitch"] += -2.2 * math.cos(4.0 * math.pi * (phase - 0.06))
            d["cpitch"] = 1.2 * math.cos(4.0 * math.pi * (phase - 0.1))
            return d
        # Gallop: half-seat forward, the torso rocking once a stride.
        rock = math.sin(2.0 * math.pi * phase)
        d = mounted(ctx, 24.0)
        d["ppitch"] += 5.0 * rock
        d["spitch"] += -3.5 * math.sin(2.0 * math.pi * (phase - 0.08))
        d["wpitch"] = 2.0
        return d

    return Clip(ctx.spec["name"], duration, True, sample)


# ------------------------------------------------------------------ transitions


def _step(u: float, start: float, end: float) -> float:
    return smooth(clamp((u - start) / (end - start), 0.0, 1.0))


def _arc(u: float, start: float, end: float) -> float:
    q = clamp((u - start) / (end - start), 0.0, 1.0)
    return math.sin(math.pi * q)


def blend(a: dict, b: dict, k: float) -> dict:
    return {key: lerp(a[key], b[key], k) for key in a}


def _in_boat(upright: dict) -> dict:
    """Standing on the boat's floor boards in front of the thwart."""
    d = dict(upright)
    d.update(foot("L", 0.12, -0.10, 0.0, 12.0))
    d.update(foot("R", -0.12, -0.08, 0.0, 12.0))
    return d


def _move_feet(d: dict, a: dict, b: dict, u: float, spans, lift: float, toe: float) -> None:
    """Each foot lifts and travels from ``a`` to ``b`` over its own span."""
    for side, (start, end) in spans:
        k = _step(u, start, end)
        for key in ("fx", "fy", "fyaw", "fpitch", "flift"):
            d[f"{key}_{side}"] = lerp(a[f"{key}_{side}"], b[f"{key}_{side}"], k)
        d[f"flift_{side}"] += lift * _arc(u, start, end)
        d[f"fpitch_{side}"] += toe * _arc(u, start, start + (end - start) * 0.5)


def board(ctx: Context) -> Clip:
    """Step over the gunwale right foot first, bring the left in, sit, then set feet and oars."""
    duration = ctx.duration
    seated = rowboat_seated(ctx, oar_grips(ctx, None))
    upright = stand()
    inside = _in_boat(upright)

    def sample(t: float) -> dict:
        u = t / duration
        d = blend(upright, seated, _step(u, 0.42, 0.86))
        # The feet stay under the body until the seat takes the weight.
        for key in d:
            if key[:2] in ("fx", "fy", "fl", "fp") or key.startswith("fyaw") or key.startswith("knee"):
                d[key] = upright[key]
        _move_feet(d, upright, inside, u, (("R", (0.06, 0.36)), ("L", (0.26, 0.56))), 0.20, -20.0)
        if u > 0.66:
            _move_feet(d, inside, seated, u, (("L", (0.66, 0.90)), ("R", (0.72, 0.98))), 0.05, 0.0)
        # Lean towards the boat and down while lowering, arms out for balance.
        lower = _arc(u, 0.38, 0.95)
        d["ppitch"] += 16.0 * lower
        d["spitch"] += 10.0 * lower
        d["sroll"] += -6.0 * _arc(u, 0.05, 0.5)
        d["hlevel"] = 0.8
        d["wpitch"] = 4.0 + 18.0 * _arc(u, 0.0, 0.7)
        d["ik_L"] = d["ik_R"] = _step(u, 0.62, 0.95)
        d["abd_L"] = lerp(d["abd_L"], 22.0, _arc(u, 0.05, 0.6))
        d["abd_R"] = lerp(d["abd_R"], 14.0, _arc(u, 0.05, 0.45))
        return d

    return Clip(ctx.spec["name"], duration, False, sample)


def dock(ctx: Context) -> Clip:
    """Let go of the oars, draw the feet in, lean over them and stand, step out left foot first."""
    duration = ctx.duration
    seated = rowboat_seated(ctx, oar_grips(ctx, None))
    upright = stand()
    inside = _in_boat(upright)

    def sample(t: float) -> dict:
        u = t / duration
        d = blend(seated, upright, _step(u, 0.14, 0.50))
        for key in d:
            if key[:2] in ("fx", "fy", "fl", "fp") or key.startswith("fyaw") or key.startswith("knee"):
                d[key] = seated[key]
        _move_feet(d, seated, inside, u, (("L", (0.0, 0.16)), ("R", (0.04, 0.20))), 0.05, 0.0)
        if u > 0.16:
            for side in SIDES:
                for key in ("fx", "fy", "fyaw", "fpitch", "flift"):
                    d[f"{key}_{side}"] = inside[f"{key}_{side}"]
        if u > 0.46:
            _move_feet(d, inside, upright, u, (("L", (0.46, 0.72)), ("R", (0.66, 0.92))), 0.20, -18.0)
        d["ik_L"] = d["ik_R"] = 1.0 - _step(u, 0.0, 0.18)
        # Rising from a seat: nose over toes first.
        d["ppitch"] += 24.0 * _arc(u, 0.10, 0.55)
        d["spitch"] += 12.0 * _arc(u, 0.10, 0.55)
        d["sroll"] += 5.0 * _arc(u, 0.45, 0.9)
        d["abd_L"] = lerp(d["abd_L"], 18.0, _arc(u, 0.4, 0.85))
        d["abd_R"] = lerp(d["abd_R"], 12.0, _arc(u, 0.5, 0.95))
        d["hlevel"] = 0.85
        return d

    return Clip(ctx.spec["name"], duration, False, sample)


def board_skiff(ctx: Context) -> Clip:
    """A long step up onto the deck, right foot then left, arms out, settling at the helm."""
    duration = ctx.duration
    deck = skiff_stance(ctx, "right")
    upright = stand()

    def sample(t: float) -> dict:
        u = t / duration
        d = blend(upright, deck, _step(u, 0.45, 0.95))
        for side, (a, b) in (("R", (0.06, 0.42)), ("L", (0.32, 0.66))):
            k = _step(u, a, b)
            for key in ("fx", "fy", "fyaw", "fpitch"):
                d[f"{key}_{side}"] = lerp(upright[f"{key}_{side}"], deck[f"{key}_{side}"], k)
            d[f"flift_{side}"] = lerp(upright[f"flift_{side}"], deck[f"flift_{side}"], k) + 0.24 * _arc(u, a, b)
            d[f"fpitch_{side}"] += -18.0 * _arc(u, a, a + (b - a) * 0.5)
        d["pz"] -= 0.06 * _arc(u, 0.0, 0.35) + 0.04 * _arc(u, 0.55, 0.9)
        d["ppitch"] += 8.0 * _arc(u, 0.0, 0.6)
        d["abd_L"] = lerp(d["abd_L"], 26.0, _arc(u, 0.05, 0.75))
        d["abd_R"] = lerp(d["abd_R"], 20.0, _arc(u, 0.05, 0.5))
        d["elbow_L"] = lerp(d["elbow_L"], 40.0, _arc(u, 0.05, 0.75))
        return d

    return Clip(ctx.spec["name"], duration, False, sample)


def dock_skiff(ctx: Context) -> Clip:
    """Let go of the helm and step down off the deck, left foot first."""
    duration = ctx.duration
    deck = skiff_stance(ctx, "right")
    upright = stand()

    def sample(t: float) -> dict:
        u = t / duration
        d = blend(deck, upright, _step(u, 0.05, 0.45))
        for side, (a, b) in (("L", (0.30, 0.62)), ("R", (0.55, 0.88))):
            k = _step(u, a, b)
            for key in ("fx", "fy", "fyaw", "fpitch"):
                d[f"{key}_{side}"] = lerp(deck[f"{key}_{side}"], upright[f"{key}_{side}"], k)
            d[f"flift_{side}"] = lerp(deck[f"flift_{side}"], upright[f"flift_{side}"], k) + 0.16 * _arc(u, a, b)
            d[f"fpitch_{side}"] += -14.0 * _arc(u, a, a + (b - a) * 0.5)
        d["pz"] -= 0.07 * _arc(u, 0.55, 1.0)
        d["ppitch"] += 7.0 * _arc(u, 0.25, 0.9)
        d["abd_L"] = lerp(d["abd_L"], 22.0, _arc(u, 0.2, 0.9))
        d["abd_R"] = lerp(d["abd_R"], 16.0, _arc(u, 0.3, 0.95))
        d["elbow_L"] = lerp(d["elbow_L"], 36.0, _arc(u, 0.2, 0.9))
        return d

    return Clip(ctx.spec["name"], duration, False, sample)


def mount(ctx: Context, mirror: bool = False) -> Clip:
    """From the near (left) side: hands to the saddle, a spring, the right leg over, settle.

    While this plays the runtime glides the root up and across onto the rider
    socket, so the clip raises the pelvis over the root only for the spring and
    keeps the swinging leg high and behind while it crosses the donkey's back.
    """
    duration = ctx.duration
    seat_contact = ctx.marker("seat_contact")
    astride = mounted(ctx)
    upright = stand()

    def sample(t: float) -> dict:
        u = t / duration
        d = blend(upright, astride, _step(u, 0.30, seat_contact / duration))
        # Hands go to the saddle first: the far hand to the pommel, the near
        # hand to the cantle, then onto the reins once seated.
        reach = _arc(u, 0.0, 0.92)
        d["abd_R"] = lerp(d["abd_R"], 25.0, reach)
        d["flex_R"] = lerp(d["flex_R"], 70.0, reach)
        d["elbow_R"] = lerp(d["elbow_R"], 35.0, reach)
        d["flex_L"] = lerp(d["flex_L"], 40.0, reach)
        d["elbow_L"] = lerp(d["elbow_L"], 50.0, reach)
        d["ik_L"] = d["ik_R"] = _step(u, 0.62, 0.95)
        # Load, then spring: the pelvis dips and rises over the root.
        d["pz"] += -0.10 * _arc(u, 0.10, 0.36) + 0.14 * _arc(u, 0.34, 0.70)
        d["ppitch"] += 26.0 * _arc(u, 0.25, 0.85)
        d["spitch"] += 16.0 * _arc(u, 0.25, 0.85)
        d["syaw"] += -10.0 * _arc(u, 0.2, 0.8)
        # The near foot pushes off; the far leg swings up behind and over.
        push = _arc(u, 0.30, 0.55)
        d["fpitch_L"] += -30.0 * push
        over = _arc(u, 0.34, seat_contact / duration)
        d["flift_R"] += 0.34 * over
        d["fy_R"] += 0.32 * over
        d["fx_R"] += -0.22 * over
        d["knee_R"] = lerp(d["knee_R"], 45.0, over)
        d["hlevel"] = 0.8
        return mirror_channels(d) if mirror else d

    return Clip(ctx.spec["name"], duration, False, sample)


def dismount(ctx: Context, mirror: bool = False) -> Clip:
    """Lean over the neck, swing the right leg back over, slide down the near side, land soft."""
    duration = ctx.duration
    contact = ctx.marker("ground_contact")
    astride = mounted(ctx)
    upright = stand()

    def sample(t: float) -> dict:
        u = t / duration
        d = blend(astride, upright, _step(u, 0.30, contact / duration))
        d["ik_L"] = d["ik_R"] = 1.0 - _step(u, 0.05, 0.35)
        lean = _arc(u, 0.0, 0.75)
        d["ppitch"] += 24.0 * lean
        d["spitch"] += 14.0 * lean
        d["syaw"] += 8.0 * _arc(u, 0.1, 0.7)
        over = _arc(u, 0.10, 0.55)
        d["flift_R"] += 0.34 * over
        d["fy_R"] += 0.34 * over
        d["fx_R"] += 0.20 * over
        # Both feet reach for the ground, then the knees take the landing.
        land = _arc(u, contact / duration - 0.04, 1.0)
        d["pz"] += -0.10 * land
        d["ppitch"] += 6.0 * land
        d["abd_L"] = lerp(d["abd_L"], 20.0, _arc(u, 0.4, 1.0))
        d["abd_R"] = lerp(d["abd_R"], 14.0, _arc(u, 0.4, 1.0))
        d["hlevel"] = 0.8
        return mirror_channels(d) if mirror else d

    return Clip(ctx.spec["name"], duration, False, sample)


def _runtime_feet(recipe):
    """The runtime owns these feet (footrests, stirrups or a gliding root): no catalog contacts."""
    def build(ctx: Context) -> Clip:
        clip = recipe(ctx)
        clip.contacts = "none"
        return clip
    return build


RECIPES = {
    "rowboat_idle": _runtime_feet(rowboat_idle), "row": _runtime_feet(row),
    "board": _runtime_feet(board), "dock": _runtime_feet(dock),
    "skiff_idle": _runtime_feet(skiff_idle), "skiff_drive": _runtime_feet(skiff_drive),
    "skiff_fishing": skiff_fishing,
    "board_skiff": _runtime_feet(board_skiff), "dock_skiff": _runtime_feet(dock_skiff),
    "mounted_idle": _runtime_feet(lambda ctx: mounted_gait(ctx, "idle")),
    "mounted_walk": _runtime_feet(lambda ctx: mounted_gait(ctx, "walk")),
    "mounted_trot": _runtime_feet(lambda ctx: mounted_gait(ctx, "trot")),
    "mounted_gallop": _runtime_feet(lambda ctx: mounted_gait(ctx, "gallop")),
    "mount": _runtime_feet(mount), "mount_right": _runtime_feet(lambda ctx: mount(ctx, True)),
    "dismount": _runtime_feet(dismount), "dismount_right": _runtime_feet(lambda ctx: dismount(ctx, True)),
}
