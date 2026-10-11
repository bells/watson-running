import copy
import unittest
from dataclasses import replace
from unittest.mock import patch

from pyproj import Geod

from run_page.geography.catalog import load_catalog
from run_page.geography.routes import RoutePoint, RouteRead
from run_page.geography.rules import input_fingerprint, is_current, prepare_route

GEOD = Geod(ellps="WGS84")


def route(segments, crs="EPSG:4326"):
    return RouteRead(
        "available",
        tuple(tuple(RoutePoint(*point) for point in segment) for segment in segments),
        "db_polyline",
        crs,
        (),
        "synthetic",
    )


class RouteRulesTest(unittest.TestCase):
    def test_unknown_crs_joyrun_and_indoor_have_no_distance(self):
        value = route([[(0, 0, 0), (0.001, 0, 60)]])
        cases = [
            (replace(value, crs=None), {}, "unknown_crs"),
            (value, {"provider": "joyrun"}, "unknown_crs"),
            (value, {"subtype": "treadmill"}, "indoor"),
            (value, {"borrowed": True}, "indoor"),
        ]
        for source, inputs, expected in cases:
            result = prepare_route(source, inputs)
            self.assertEqual(result.status, expected)
            self.assertIsNone(result.valid_distance_m)
            self.assertFalse(result.segments)

    def test_explicit_segments_jumps_and_time_reversal_do_not_connect(self):
        value = route(
            [
                [(0, 0, 0), (0.001, 0, 60), (1, 0, 61), (1.001, 0, 121)],
                [(2, 0, 0), (2.001, 0, -1)],
            ]
        )
        result = prepare_route(value)
        self.assertEqual(len(result.segments), 2)
        self.assertIn("time_reversal", result.reasons)
        self.assertIn("jump_point", result.reasons)
        self.assertIn("segment_break", result.reasons)
        self.assertAlmostEqual(result.valid_distance_m, 222.638981586, places=5)
        self.assertGreater(result.excluded_chord_m, 100000)

    def test_dateline_short_path_and_normal_timed_long_segment(self):
        value = route([[(179.9, 0, 0), (-179.9, 0, 1000)]])
        result = prepare_route(value)
        self.assertAlmostEqual(result.valid_distance_m, 22263.8981586, places=4)
        self.assertEqual(len(result.segments), 2)
        total = 0
        for segment in result.segments:
            for a, b in zip(segment, segment[1:]):
                length = GEOD.inv(a.longitude, a.latitude, b.longitude, b.latitude)[2]
                self.assertLessEqual(length, 25.0001)
                self.assertLessEqual(abs(a.longitude - b.longitude), 180)
                total += length
        self.assertAlmostEqual(total, result.valid_distance_m, places=5)
        self.assertEqual(
            prepare_route(route([[(0, 0, None), (1, 0, None)]])).status, "no_route"
        )

    def test_fingerprints_include_compute_inputs_only(self):
        value = route([[(0, 0, 0), (0.001, 0, 60)]])
        catalog = load_catalog()
        original = input_fingerprint(value, {}, catalog)
        self.assertEqual(
            original,
            input_fingerprint(
                value, {"IGNORE_START_END_RANGE": 1000, "svg": "new"}, catalog
            ),
        )
        self.assertNotEqual(
            original, input_fingerprint(replace(value, crs=None), {}, catalog)
        )
        self.assertNotEqual(
            original, input_fingerprint(value, {"subtype": "indoor"}, catalog)
        )
        self.assertNotEqual(
            original,
            input_fingerprint(replace(value, content_digest="changed"), {}, catalog),
        )
        changed = copy.deepcopy(catalog)
        changed.regions["CHN:city:440300"]["name"] = "展示别名"
        self.assertEqual(original, input_fingerprint(value, {}, changed))
        changed.version = "next"
        self.assertNotEqual(original, input_fingerprint(value, {}, changed))
        self.assertTrue(is_current({"input_fingerprint": original}, original))
        self.assertFalse(is_current({"input_fingerprint": "old"}, original))
        with patch("run_page.geography.rules.RULES_VERSION", "next"):
            self.assertNotEqual(original, input_fingerprint(value, {}, catalog))


if __name__ == "__main__":
    unittest.main()
