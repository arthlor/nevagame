"""Small, Blender-independent trajectory and fixed-length leg solve helpers."""

from __future__ import annotations

import math


def support_path(seconds, duration=4 / 3, speed=0.975, lift=0.085, phase=0.0):
    """Return forward displacement, floor clearance, and stance membership.

    Each half-cycle is a 0.65 m support interval. The quintic recovery matches
    the support velocity and zero acceleration at both ends; it has no root
    motion. Vertical recovery also has zero velocity/acceleration at contacts.
    """
    half = duration / 2
    time = (seconds - phase) % duration
    stride = speed * half
    if time <= half:
        return stride / 2 - speed * time, 0.0, True
    u = (time - half) / half
    smooth = u**3 * (10 - 15 * u + 6 * u * u)
    forward = -stride / 2 - stride * u + 2 * stride * smooth
    return forward, lift * 64 * u**3 * (1 - u)**3, False


def solve_knee(hip, original_knee, target, upper_length, lower_length):
    """Analytic two-bone IK; reject unreachable targets instead of hiding slip."""
    sub = lambda a, b: tuple(x - y for x, y in zip(a, b))
    dot = lambda a, b: sum(x * y for x, y in zip(a, b))
    length = lambda a: math.sqrt(dot(a, a))
    direction = sub(target, hip)
    distance = length(direction)
    lower = abs(upper_length - lower_length)
    upper = upper_length + lower_length
    if not lower + 1e-7 < distance < upper - 1e-7:
        raise ValueError(f"Unreachable leg target: {distance:.8f}m outside ({lower:.8f}, {upper:.8f})m")
    direction = tuple(x / distance for x in direction)
    pole = sub(original_knee, hip)
    projection = dot(pole, direction)
    pole = tuple(x - projection * y for x, y in zip(pole, direction))
    norm = length(pole)
    if norm < 1e-7:
        raise ValueError("Original knee pole is collinear; an explicit pole review is required")
    pole = tuple(x / norm for x in pole)
    along = (upper_length**2 - lower_length**2 + distance**2) / (2 * distance)
    height = math.sqrt(max(0.0, upper_length**2 - along**2))
    return tuple(h + d * along + p * height for h, d, p in zip(hip, direction, pole))
