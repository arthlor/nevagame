"""Coral generators: colonies that branch from one holdfast on a rock base."""

from __future__ import annotations

import math

from common.geometry import add_cone, add_cylinder, add_ico, add_tapered_beam, add_lofted_form, add_limb_tube, seeded_rng
from common.authored import grow_branch

GOLDEN_ANGLE = 2.39996322972865332
