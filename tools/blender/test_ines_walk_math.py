import math
import unittest

from ines_walk_math import solve_knee, support_path


class InesWalkMathTests(unittest.TestCase):
    def test_stance_is_constant_game_speed(self):
        for phase in (0, 2 / 3):
            points = [support_path(phase + i / 120, phase=phase) for i in range(81)]
            self.assertAlmostEqual(points[-1][0] - points[0][0], -0.65)
            for first, second in zip(points, points[1:]):
                self.assertAlmostEqual((second[0] - first[0]) * 120, -0.975)
            self.assertTrue(all(p[1] == 0 and p[2] for p in points))

    def test_cycle_position_velocity_and_lift_are_continuous(self):
        dt = 1e-5
        for time in (0, 2 / 3, 4 / 3):
            before, center, after = [support_path(time + offset) for offset in (-dt, 0, dt)]
            self.assertAlmostEqual((center[0] - before[0]) / dt, -0.975, places=6)
            self.assertAlmostEqual((after[0] - center[0]) / dt, -0.975, places=6)
            self.assertLess(abs(after[1] - before[1]), 1e-10)
        self.assertAlmostEqual(support_path(1)[1], 0.085)
        self.assertEqual(support_path(0), support_path(4 / 3))

    def test_analytic_solve_preserves_lengths_and_input_pole(self):
        hip, old, target = (0, 0, 1), (0, -0.2, 0.6), (0, 0.2, 0.1)
        knee = solve_knee(hip, old, target, 0.5, 0.5)
        self.assertAlmostEqual(math.dist(hip, knee), 0.5)
        self.assertAlmostEqual(math.dist(knee, target), 0.5)
        self.assertLess(knee[1], 0)

    def test_unreachable_target_is_not_clamped(self):
        with self.assertRaisesRegex(ValueError, "Unreachable"):
            solve_knee((0, 0, 1), (0, -0.1, 0.5), (0, 0.65, 0), 0.5, 0.5)


if __name__ == "__main__":
    unittest.main()
