import math
import unittest

from humanoid_adaptation_math import normalized_influences, semantic_bone


class HumanoidAdaptationTest(unittest.TestCase):
    def test_weights_merge_before_truncation(self):
        weights = normalized_influences([("hand", .1), ("hand", .6), ("chest", .1), ("head", .1), ("foot", .1), ("discard", .01)])
        self.assertEqual(len(weights), 4)
        self.assertEqual(weights[0][0], "hand")
        self.assertAlmostEqual(sum(w for _, w in weights), 1)

    def test_weights_fail_closed(self):
        for weights in ([], [("bone", 0)], [("bone", -1)], [("bone", math.nan)]):
            with self.assertRaises(ValueError):
                normalized_influences(weights)

    def test_spatial_sides_and_no_fabricated_fingers(self):
        sides = {"L": "right", "R": "left"}
        self.assertEqual(semantic_bone("UpperArm.L", sides), "rig_upper_arm_right")
        self.assertEqual(semantic_bone("Index4.R", sides), "rig_hand_left")
        self.assertEqual(semantic_bone("Torso", sides), "rig_spine_02")
        self.assertEqual(semantic_bone("Torso", sides, False), "rig_chest")

    def test_weighted_ik_controls_are_not_silently_bound(self):
        with self.assertRaises(ValueError):
            semantic_bone("PT.L", {"L": "right", "R": "left"})


if __name__ == "__main__":
    unittest.main()
