"""Pose model and solvers for authoring the Neva player's performances.

The player's rig (``char_player_rig``) was fitted to the Tripo body by
``adapt_tripo_humanoid.py``. Its feet are *detached* IK endpoints parented to
``Root``: each ``Foot`` bone's head sits on the sole beneath the ankle, on the
shin axis extended past the ankle (the catalog ``humanoidRig.legs.*.shinTip``).
A performance that moves a foot away from that point tears the boot from the
shin, so every leg here is solved, never keyed free.

Everything is expressed in the rig's armature space, which is the character's
frame: +X is the character's left, -Y is forward and +Z is up, in metres, with
the ground at z = 0. A pose is built top down from *local deltas*: each bone's
rotation relative to its rest orientation, expressed in axes that coincide with
the character axes while the parent is at rest. ``yaw`` turns to the
character's left (+Z), ``pitch`` bows forward (+X) and ``roll`` leans to the
left (+Y). Rotating a parent carries its children rigidly, so a spine bend
takes the arms and head with it.

The pose converts to Blender pose-bone channels only at the end, through
``Bone.convert_local_to_pose``; nothing here depends on depsgraph updates.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

from mathutils import Matrix, Quaternion, Vector

FPS = 30
X = Vector((1.0, 0.0, 0.0))
Y = Vector((0.0, 1.0, 0.0))
Z = Vector((0.0, 0.0, 1.0))
FORWARD = Vector((0.0, -1.0, 0.0))
SIDES = ("L", "R")
FINGERS = ("Index", "Middle", "Ring", "Pinky")


def side_sign(side: str) -> float:
    """+1 for the left side (+X), -1 for the right."""
    return 1.0 if side == "L" else -1.0


def q_axis(axis: Vector, degrees: float) -> Quaternion:
    return Quaternion(axis, math.radians(degrees))


def q_ypr(yaw: float = 0.0, pitch: float = 0.0, roll: float = 0.0) -> Quaternion:
    """Character-axis rotation in degrees: yaw left, then pitch forward, then roll left."""
    return q_axis(Z, yaw) @ q_axis(X, pitch) @ q_axis(Y, roll)


def frame(primary: Vector, secondary: Vector) -> Matrix:
    """Orthonormal basis whose first column is ``primary`` and second lies towards ``secondary``."""
    a = primary.normalized()
    b = secondary - a * secondary.dot(a)
    if b.length < 1e-9:
        b = a.orthogonal()
    b.normalize()
    c = a.cross(b)
    return Matrix((a, b, c)).transposed()


def align(a0: Vector, b0: Vector, a1: Vector, b1: Vector) -> Quaternion:
    """Rotation taking direction ``a0`` to ``a1`` whose plane (a0, b0) lands on (a1, b1)."""
    return (frame(a1, b1) @ frame(a0, b0).transposed()).to_quaternion()


def swing_twist(rotation: Quaternion, axis: Vector) -> tuple[Quaternion, float]:
    """Split ``rotation`` into swing @ twist about ``axis``; returns (swing, twist radians)."""
    axis = axis.normalized()
    projection = axis * Vector(rotation[1:]).dot(axis)
    twist = Quaternion((rotation.w, projection.x, projection.y, projection.z))
    if twist.magnitude < 1e-9:
        return rotation.copy(), 0.0
    twist.normalize()
    angle = 2.0 * math.atan2(Vector(twist[1:]).dot(axis), twist.w)
    angle = (angle + math.pi) % (2.0 * math.pi) - math.pi
    swing = rotation @ Quaternion(axis, angle).inverted()
    return swing, angle


def lerp(a, b, t):
    return a + (b - a) * t


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def smooth(t: float) -> float:
    t = clamp(t, 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def smoother(t: float) -> float:
    t = clamp(t, 0.0, 1.0)
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0)


# --------------------------------------------------------------------------- rig


@dataclass
class LegRest:
    thigh: str
    shin: str
    foot: str
    thigh_length: float
    shin_length: float        # knee to the foot head (the shin tip)
    hinge: Vector             # rest knee axis (+ bends the knee forward)
    heel: Vector              # sole pivots relative to the rest foot head
    toe: Vector
    boot_yaw: float           # rest boot axis, degrees outward from straight ahead


@dataclass
class ArmRest:
    clavicle: str
    upper: str
    lower: str
    hand: str
    upper_length: float
    lower_length: float
    hinge: Vector             # rest elbow axis (+ flexes the elbow)
    palm: Vector              # rest palm normal, out of the palm
    fingers: Vector           # rest wrist-to-middle-knuckle direction
    curl_axes: dict = field(default_factory=dict)
    thumb_axis: Vector = field(default_factory=Vector)
    thumb_opposition_axis: Vector = field(default_factory=Vector)
    socket: Matrix = field(default_factory=Matrix)   # hand socket in the hand bone's rest frame


class RigModel:
    """Rest data and derived anatomy of the fitted player rig."""

    def __init__(self, rig, sockets: dict[str, Matrix], feet: dict[str, dict]):
        self.rig = rig
        bones = rig.data.bones
        self.rest = {bone.name: bone.matrix_local.copy() for bone in bones}
        self.rest_rot = {name: matrix.to_quaternion() for name, matrix in self.rest.items()}
        self.rest_head = {name: matrix.translation.copy() for name, matrix in self.rest.items()}
        self.rest_tail = {bone.name: bone.tail_local.copy() for bone in bones}
        self.parent = {bone.name: bone.parent.name if bone.parent else None for bone in bones}
        self.children: dict[str, list[str]] = {name: [] for name in self.rest}
        for name, parent in self.parent.items():
            if parent:
                self.children[parent].append(name)
        order, pending = [], [bone.name for bone in bones if bone.parent is None]
        while pending:
            name = pending.pop(0)
            order.append(name)
            pending.extend(self.children[name])
        self.order = order
        self.legs = {side: self._leg(side, feet[side]) for side in SIDES}
        self.arms = {side: self._arm(side, sockets[side]) for side in SIDES}

    def _leg(self, side: str, foot: dict) -> LegRest:
        thigh, shin, foot_bone = f"UpperLeg.{side}", f"LowerLeg.{side}", f"Foot.{side}"
        hip, knee, tip = self.rest_head[thigh], self.rest_head[shin], self.rest_head[foot_bone]
        thigh_dir, shin_dir = (knee - hip).normalized(), (tip - knee).normalized()
        hinge = shin_dir.cross(thigh_dir)
        # A near-straight rest leg: the hinge is the lateral axis; orient it
        # so that a positive rotation swings the shin backwards (knee forward).
        hinge = X.copy() if hinge.length < 1e-6 else hinge.normalized()
        if (Quaternion(hinge, 0.3) @ shin_dir).y < shin_dir.y:
            hinge.negate()
        return LegRest(thigh, shin, foot_bone, (knee - hip).length, (tip - knee).length, hinge,
                       Vector(foot["heel"]) - tip, Vector(foot["toe"]) - tip, foot["bootYaw"])

    def _arm(self, side: str, socket_local: Matrix) -> ArmRest:
        clavicle, upper, lower, hand = (f"Shoulder.{side}", f"UpperArm.{side}", f"LowerArm.{side}",
                                        f"Wrist.{side}")
        shoulder, elbow, wrist = self.rest_head[upper], self.rest_head[lower], self.rest_head[hand]
        upper_dir, lower_dir = (elbow - shoulder).normalized(), (wrist - elbow).normalized()
        index, pinky = self.rest_head[f"Index2.{side}"], self.rest_head[f"Pinky2.{side}"]
        knuckle = self.rest_head[f"Middle2.{side}"]
        fingers = (knuckle - wrist).normalized()
        palm = (pinky - index).cross(fingers).normalized()
        # The palm faces the thigh at rest.
        if palm.x * side_sign(side) > 0:
            palm.negate()
        # Elbow hinge: perpendicular to the upper arm, flexion carries the
        # forearm forwards (towards -Y) from the hanging rest pose.
        hinge = upper_dir.cross(FORWARD).normalized()
        if (Quaternion(hinge, 0.3) @ lower_dir).y > lower_dir.y:
            hinge.negate()
        curl_axes = {}
        for finger in FINGERS:
            direction = (self.rest_head[f"{finger}3.{side}"] - self.rest_head[f"{finger}2.{side}"]).normalized()
            axis = direction.cross(palm).normalized()
            curl_axes[finger] = axis
        thumb_dir = (self.rest_head[f"Thumb3.{side}"] - self.rest_head[f"Thumb2.{side}"]).normalized()
        thumb_axis = thumb_dir.cross(palm).normalized()
        opposition = (self.rest_head[f"Index2.{side}"] - wrist).normalized()
        return ArmRest(clavicle, upper, lower, hand, (elbow - shoulder).length, (wrist - elbow).length,
                       hinge, palm, fingers, curl_axes, thumb_axis, opposition, socket_local)

    def descendants(self, name: str) -> list[str]:
        result, pending = [], [name]
        while pending:
            current = pending.pop(0)
            result.append(current)
            pending.extend(self.children[current])
        return result


# -------------------------------------------------------------------------- pose


class Pose:
    """World-space (armature) rotation deltas and heads for every bone."""

    def __init__(self, model: RigModel):
        self.m = model
        self.local = {name: Quaternion() for name in model.order}
        self.W = {name: Quaternion() for name in model.order}
        self.H = {name: model.rest_head[name].copy() for name in model.order}
        self.override: dict[str, Vector] = {}
        self.notes: list[str] = []

    # Hierarchy -----------------------------------------------------------
    def evaluate(self, start: str = "Root") -> None:
        """Recompute ``start`` and its descendants from local deltas and overrides."""
        m = self.m
        for name in m.descendants(start):
            parent = m.parent[name]
            if parent is None:
                self.W[name] = self.local[name].copy()
                self.H[name] = self.override.get(name, m.rest_head[name]).copy()
                continue
            self.W[name] = self.W[parent] @ self.local[name]
            if name in self.override:
                self.H[name] = self.override[name].copy()
            else:
                self.H[name] = self.H[parent] + self.W[parent] @ (m.rest_head[name] - m.rest_head[parent])

    def set_world(self, name: str, rotation: Quaternion) -> None:
        parent = self.m.parent[name]
        parent_world = self.W[parent] if parent else Quaternion()
        self.local[name] = parent_world.inverted() @ rotation

    def point(self, name: str, rest_point: Vector) -> Vector:
        """Where a point attached to bone ``name`` at rest is now."""
        return self.H[name] + self.W[name] @ (rest_point - self.m.rest_head[name])

    def tail(self, name: str) -> Vector:
        return self.point(name, self.m.rest_tail[name])

    def matrix(self, name: str) -> Matrix:
        return Matrix.Translation(self.H[name]) @ (self.W[name] @ self.m.rest_rot[name]).to_matrix().to_4x4()

    # Export --------------------------------------------------------------
    def channels(self) -> dict[str, tuple[Vector, Quaternion]]:
        m, bones = self.m, self.m.rig.data.bones
        matrices = {name: self.matrix(name) for name in m.order}
        result = {}
        for name in m.order:
            bone, parent = bones[name], m.parent[name]
            kwargs = {}
            if parent:
                kwargs = {"parent_matrix": matrices[parent], "parent_matrix_local": bones[parent].matrix_local}
            basis = bone.convert_local_to_pose(matrices[name], bone.matrix_local, invert=True, **kwargs)
            location, rotation, _ = basis.decompose()
            result[name] = (location, rotation)
        return result


# ----------------------------------------------------------------------- solvers


def solve_two_bone(origin: Vector, target: Vector, l1: float, l2: float, bend_hint: Vector,
                   softening: float = 0.012) -> tuple[Vector, Vector, Vector, float]:
    """Joint and reachable endpoint for a planar two-bone chain.

    Returns (joint, endpoint, bend direction, reach error). Near full extension
    the reach is softened exponentially instead of snapping straight, the way a
    real knee or elbow keeps a trace of flexion.
    """
    offset = target - origin
    distance = offset.length
    direction = offset.normalized() if distance > 1e-9 else Vector((0.0, 0.0, -1.0))
    maximum = l1 + l2 - 1e-4
    minimum = abs(l1 - l2) + 1e-4
    reach = distance
    start = maximum - softening
    if reach > start:
        reach = start + softening * (1.0 - math.exp(-(reach - start) / softening))
    reach = clamp(reach, minimum, maximum)
    bend = bend_hint - direction * bend_hint.dot(direction)
    if bend.length < 1e-6:
        bend = direction.orthogonal()
    bend.normalize()
    along = (l1 * l1 - l2 * l2 + reach * reach) / (2.0 * reach)
    height = math.sqrt(max(0.0, l1 * l1 - along * along))
    joint = origin + direction * along + bend * height
    endpoint = origin + direction * reach
    return joint, endpoint, bend, distance - reach


@dataclass
class FootSpec:
    """A foot on (or above) the ground, in the character frame.

    ``x``/``y`` place the flat foot's head (the sole point under the ankle).
    ``lift`` raises the flat foot. ``yaw`` turns the toe inwards (positive) or
    outwards from the boot's rest splay. ``pitch`` raises the toe (positive,
    rolling on the heel) or the heel (negative, rolling on the toe); the
    pivot, not the head, keeps its ground position, so a planted foot rolls
    without sliding. ``roll`` tilts the sole about the boot's long axis.
    """

    x: float
    y: float
    lift: float = 0.0
    yaw: float = 0.0
    pitch: float = 0.0
    roll: float = 0.0


def foot_placement(model: RigModel, side: str, spec: FootSpec) -> tuple[Vector, Quaternion]:
    leg = model.legs[side]
    rest_head = model.rest_head[leg.foot]
    sign = side_sign(side)
    yaw = q_axis(Z, -sign * spec.yaw)
    head = Vector((spec.x, spec.y, rest_head.z + spec.lift))
    boot_axis = yaw @ (q_axis(Z, sign * leg.boot_yaw) @ FORWARD)
    rotation = q_axis(boot_axis, sign * spec.roll) @ yaw
    if abs(spec.pitch) > 1e-9:
        pivot_offset = leg.heel if spec.pitch > 0 else leg.toe
        pivot = head + yaw @ pivot_offset
        # Rotate about the boot's lateral axis so a splayed boot rolls over
        # its own heel or toe, not over the bone's straight-ahead axis.
        axis = boot_axis.cross(Z).normalized()
        pitch = q_axis(axis, spec.pitch)
        head = pivot + pitch @ (head - pivot)
        rotation = pitch @ rotation
    return head, rotation


def sole_points(model: RigModel, pose: Pose, side: str) -> tuple[Vector, Vector]:
    """Current heel and toe pivot points of a foot."""
    leg = model.legs[side]
    head = pose.H[leg.foot]
    return head + pose.W[leg.foot] @ leg.heel, head + pose.W[leg.foot] @ leg.toe


def solve_leg(pose: Pose, side: str, head_target: Vector, foot_rotation: Quaternion,
              knee_out: float = 8.0) -> float:
    """Place a foot and bend the leg to reach it; returns the unreached distance."""
    m = pose.m
    leg = m.legs[side]
    sign = side_sign(side)
    hip = pose.H[leg.thigh]
    # The knee tracks over the foot: straight ahead of the foot's yaw plus a
    # small outward set, the way the leg's rest bend already leans.
    foot_forward = foot_rotation @ FORWARD
    foot_forward.z = 0.0
    if foot_forward.length < 1e-6:
        foot_forward = FORWARD.copy()
    hint = q_axis(Z, sign * knee_out) @ foot_forward.normalized()
    knee, endpoint, bend, error = solve_two_bone(hip, head_target, leg.thigh_length, leg.shin_length, hint)
    rest_hip, rest_knee = m.rest_head[leg.thigh], m.rest_head[leg.shin]
    rest_tip = m.rest_head[leg.foot]
    rest_thigh, rest_shin = rest_knee - rest_hip, rest_tip - rest_knee
    # The knee hinge is perpendicular to the leg plane: bend x reach direction
    # has the rest hinge's sense whenever the knee points along the hint.
    rest_normal = leg.hinge
    normal = bend.cross((endpoint - hip).normalized()).normalized()
    thigh_world = align(rest_thigh, rest_normal, knee - hip, normal)
    shin_world = align(rest_shin, rest_normal, endpoint - knee, normal)
    pose.set_world(leg.thigh, thigh_world)
    pose.evaluate(leg.thigh)
    pose.set_world(leg.shin, shin_world)
    pose.evaluate(leg.shin)
    tip = pose.H[leg.shin] + shin_world @ rest_shin
    pose.override[leg.foot] = tip
    pose.set_world(leg.foot, foot_rotation)
    pose.evaluate(leg.foot)
    return error


def knee_flexion(pose: Pose, side: str) -> float:
    m = pose.m
    leg = m.legs[side]
    thigh = pose.H[leg.shin] - pose.H[leg.thigh]
    shin = pose.H[leg.foot] - pose.H[leg.shin]
    return math.degrees(thigh.angle(shin))


# ------------------------------------------------------------------------ arms


@dataclass
class ArmFK:
    """Arm angles in degrees relative to the rest A-pose.

    ``flex`` swings the arm forwards, ``abd`` away from the body, ``twist``
    rotates the upper arm inwards; ``elbow`` flexes the forearm; ``pron``
    pronates (palm towards the back, then down); ``wflex`` flexes the wrist
    towards the palm and ``wdev`` bends it towards the thumb.
    """

    flex: float = 0.0
    abd: float = 0.0
    twist: float = 0.0
    elbow: float = 0.0
    pron: float = 0.0
    wflex: float = 0.0
    wdev: float = 0.0


def arm_fk(pose: Pose, side: str, fk: ArmFK) -> None:
    m = pose.m
    arm = m.arms[side]
    sign = side_sign(side)
    upper_dir = (m.rest_head[arm.lower] - m.rest_head[arm.upper]).normalized()
    lower_dir = (m.rest_head[arm.hand] - m.rest_head[arm.lower]).normalized()
    # Twist first about the arm's own axis, then abduct, then swing forwards.
    pose.local[arm.upper] = (q_axis(X, -fk.flex) @ q_axis(Y, -sign * fk.abd)
                             @ q_axis(upper_dir, sign * fk.twist))
    # Pronation is shared between the forearm and the wrist.
    pronation = sign * fk.pron
    pose.local[arm.lower] = q_axis(arm.hinge, fk.elbow) @ q_axis(lower_dir, pronation * 0.5)
    flexion_axis = arm.fingers.cross(arm.palm).normalized()
    pose.local[arm.hand] = (q_axis(lower_dir, pronation * 0.5) @ q_axis(flexion_axis, fk.wflex)
                            @ q_axis(arm.palm, sign * fk.wdev))
    pose.evaluate(arm.upper)


def hand_rotation(model: RigModel, side: str, fingers: Vector, palm: Vector) -> Quaternion:
    """World rotation delta that points the hand's fingers and palm as asked."""
    arm = model.arms[side]
    return align(arm.fingers, arm.palm, fingers, palm)


def socket_rotation(model: RigModel, side: str, along: Vector, palm: Vector) -> Quaternion:
    """World rotation delta that lays a held handle along ``along`` with the palm facing ``palm``.

    The hand socket's +X is the held handle's axis (a rod's butt-to-tip line)
    and its -Y the palm normal, per the palm-frame grip contract.
    """
    arm = model.arms[side]
    socket = model.rest[arm.hand].to_3x3() @ arm.socket.to_3x3()
    rest_along = (socket @ X).normalized()
    rest_palm = -(socket @ Y).normalized()
    return align(rest_along, rest_palm, along, palm)


def comfortable_elbow(pose: Pose, side: str, wrist_target: Vector, hint: Vector,
                      forearm: Vector | None) -> Vector:
    """The bend direction that puts the elbow where a real arm would.

    The elbow may sit anywhere on the circle round the shoulder-to-wrist line;
    a relaxed arm picks the place whose forearm lines up with the hand (a
    straight wrist), keeps the elbow below the shoulder and outside the torso,
    and otherwise leans towards the authored ``hint``.
    """
    m = pose.m
    arm = m.arms[side]
    sign = side_sign(side)
    shoulder = pose.H[arm.upper]
    l1, l2 = arm.upper_length, arm.lower_length
    offset = wrist_target - shoulder
    distance = clamp(offset.length, abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4)
    axis = offset.normalized()
    along = (l1 * l1 - l2 * l2 + distance * distance) / (2.0 * distance)
    radius = math.sqrt(max(0.0, l1 * l1 - along * along))
    u = axis.orthogonal().normalized()
    v = axis.cross(u).normalized()
    chest = pose.W["Chest"]
    centre = pose.H["Chest"] + chest @ Vector((0.01, -0.03, 0.0))
    best, best_cost = hint, None
    hint_n = hint - axis * hint.dot(axis)
    hint_n = hint_n.normalized() if hint_n.length > 1e-6 else u
    for step in range(72):
        angle = 2.0 * math.pi * step / 72.0
        bend = u * math.cos(angle) + v * math.sin(angle)
        elbow = shoulder + axis * along + bend * radius
        lower = (wrist_target - elbow).normalized()
        cost = 0.35 * (1.0 - bend.dot(hint_n))
        if forearm is not None:
            cost += 1.0 - lower.dot(forearm)
        # Elbows hang: above the shoulder is a strain, above it by much is wrong.
        rise = elbow.z - (shoulder.z - 0.06)
        if rise > 0.0:
            cost += 8.0 * rise
        # Never through the chest or belly, and never across the midline.
        local = chest.inverted() @ (elbow - centre)
        inside = (local.x / 0.24) ** 2 + (local.y / 0.20) ** 2
        if inside < 1.0 and -0.45 < local.z < 0.25:
            cost += 4.0 * (1.0 - inside)
        if elbow.x * sign < 0.05:
            cost += 4.0 * (0.05 - elbow.x * sign)
        if best_cost is None or cost < best_cost:
            best, best_cost = bend, cost
    return best


def solve_arm(pose: Pose, side: str, wrist_target: Vector, elbow_hint: Vector,
              hand_world: Quaternion | None = None, twist_share: float = 0.45,
              comfort: bool = False) -> float:
    """Place the wrist, bend the elbow towards ``elbow_hint`` and orient the hand.

    With ``comfort`` the elbow instead goes where the forearm best lines up with
    the hand (``comfortable_elbow``), the hint only breaking ties.
    """
    m = pose.m
    arm = m.arms[side]
    shoulder = pose.H[arm.upper]
    if comfort and hand_world is not None:
        forearm = (hand_world @ arm.fingers).normalized()
        elbow_hint = comfortable_elbow(pose, side, wrist_target, elbow_hint, forearm)
    elbow, endpoint, bend, error = solve_two_bone(shoulder, wrist_target, arm.upper_length, arm.lower_length,
                                                  elbow_hint, softening=0.008)
    rest_shoulder, rest_elbow, rest_wrist = (m.rest_head[arm.upper], m.rest_head[arm.lower],
                                             m.rest_head[arm.hand])
    rest_upper, rest_lower = rest_elbow - rest_shoulder, rest_wrist - rest_elbow
    # Flexion carries the forearm away from the elbow's bend direction, so
    # bend x reach direction has the rest hinge's sense.
    rest_normal = arm.hinge
    normal = bend.cross((endpoint - shoulder).normalized()).normalized()
    upper_world = align(rest_upper, rest_normal, elbow - shoulder, normal)
    lower_world = align(rest_lower, rest_normal, endpoint - elbow, normal)
    if hand_world is not None:
        # Share pronation between forearm and wrist: rotate the forearm about
        # its own axis by part of the twist the hand asks for.
        residual = hand_world @ lower_world.inverted()
        axis = (endpoint - elbow).normalized()
        _, twist = swing_twist(residual, axis)
        lower_world = Quaternion(axis, twist * twist_share) @ lower_world
    pose.set_world(arm.upper, upper_world)
    pose.evaluate(arm.upper)
    pose.set_world(arm.lower, lower_world)
    pose.evaluate(arm.lower)
    if hand_world is not None:
        pose.set_world(arm.hand, hand_world)
    pose.evaluate(arm.hand)
    return error


def wrist_of_socket(pose: Pose, side: str, socket_target: Vector, hand_world: Quaternion) -> Vector:
    """Wrist head position that puts the hand socket at ``socket_target``."""
    m = pose.m
    arm = m.arms[side]
    socket_rest = m.rest[arm.hand] @ arm.socket
    offset = socket_rest.translation - m.rest_head[arm.hand]
    return socket_target - hand_world @ offset


def socket_point(pose: Pose, side: str) -> Vector:
    m = pose.m
    arm = m.arms[side]
    return pose.point(arm.hand, (m.rest[arm.hand] @ arm.socket).translation)


# ----------------------------------------------------------------------- hands


GRIPS = {
    # (finger joint 2, 3, 4 curl as a fraction of a full fist, thumb opposition, thumb curl)
    "relaxed": (0.10, 0.22, 0.18, 0.15, 0.20),
    "loose": (0.25, 0.40, 0.30, 0.30, 0.30),
    "fist": (0.95, 1.00, 0.85, 0.70, 0.75),
    "handle": (0.80, 0.85, 0.60, 0.80, 0.55),
    "reins": (0.70, 0.80, 0.55, 0.60, 0.45),
    "cup": (0.20, 0.30, 0.20, 0.25, 0.15),
    "flat": (-0.05, 0.00, 0.00, 0.05, 0.00),
    "pinch": (0.35, 0.55, 0.40, 0.85, 0.40),
    "spread": (0.05, 0.10, 0.05, 0.00, 0.05),
}
# A full fist per joint (degrees): proximal, middle, distal phalanges.
FIST_DEGREES = (80.0, 95.0, 60.0)


def set_hand(pose: Pose, side: str, grip: tuple, stagger: float = 0.06) -> None:
    """Curl the fingers of one hand from its relaxed rest shape.

    ``stagger`` closes the little finger a little more than the index, the
    natural cascade of a resting or gripping hand.
    """
    m = pose.m
    arm = m.arms[side]
    c2, c3, c4, opposition, thumb = grip
    for index, finger in enumerate(FINGERS):
        axis = arm.curl_axes[finger]
        extra = 1.0 + stagger * index
        for joint, (curl, full) in enumerate(zip((c2, c3, c4), FIST_DEGREES), start=2):
            pose.local[f"{finger}{joint}.{side}"] = q_axis(axis, curl * full * extra)
        pose.local[f"{finger}1.{side}"] = Quaternion()
    sign = side_sign(side)
    pose.local[f"Thumb1.{side}"] = q_axis(arm.thumb_opposition_axis, -sign * 35.0 * opposition)
    pose.local[f"Thumb2.{side}"] = q_axis(arm.thumb_axis, 30.0 * thumb)
    pose.local[f"Thumb3.{side}"] = q_axis(arm.thumb_axis, 35.0 * thumb)
    pose.evaluate(arm.hand)


def blend_grip(a: tuple, b: tuple, t: float) -> tuple:
    return tuple(lerp(x, y, t) for x, y in zip(a, b))
