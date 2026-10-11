import copy
import unittest

from pyproj import Geod
from shapely import STRtree
from shapely.geometry import MultiPolygon, Polygon, box

from run_page.geography.attribution import (
    attribute_route,
    primary_chain,
    validate_conservation,
)
from run_page.geography.boundaries import BoundaryLayer, BoundaryPackage
from run_page.geography.catalog import Catalog, parse_provider_location
from run_page.geography.rules import input_fingerprint, prepare_route
from test_geography_rules import route

GEOD = Geod(ellps="WGS84")


def catalog():
    return Catalog(
        {
            "version": "synthetic-v1",
            "regions": [
                dict(
                    id="country:CHN",
                    countryCode="CHN",
                    level="country",
                    codeNamespace="ISO3166-1-alpha3",
                    code="CHN",
                    name="中国",
                    parentId=None,
                    aliases=[],
                ),
                dict(
                    id="country:USA",
                    countryCode="USA",
                    level="country",
                    codeNamespace="ISO3166-1-alpha3",
                    code="USA",
                    name="美国",
                    parentId=None,
                    aliases=[],
                ),
                *[
                    dict(
                        id=f"CHN:{level}:{code}",
                        countryCode="CHN",
                        level=level,
                        codeNamespace="CN-adcode",
                        code=code,
                        name=name,
                        parentId=parent,
                        aliases=[],
                    )
                    for level, code, name, parent in [
                        ("province", "440000", "广东省", "country:CHN"),
                        ("province", "110000", "北京市", "country:CHN"),
                        ("city", "440300", "深圳市", "CHN:province:440000"),
                        ("city", "110000", "北京市", "CHN:province:110000"),
                    ]
                ],
            ],
        }
    )


def package(shapes, reverse=False):
    layers = {}
    for level, entries in shapes.items():
        ordered = sorted(entries.items(), reverse=reverse)
        ids, geometries = tuple(key for key, _ in ordered), tuple(
            value for _, value in ordered
        )
        layers[level] = BoundaryLayer(ids, geometries, STRtree(geometries))
    return BoundaryPackage(
        "synthetic-v1", "synthetic-v1", "synthetic-hash", True, layers, {}
    )


class AttributionTest(unittest.TestCase):
    def setUp(self):
        self.catalog = catalog()
        self.shapes = {
            "country": {"country:CHN": box(-1, -1, 1, 1)},
            "province": {
                "CHN:province:440000": box(-1, -1, 0.01, 1),
                "CHN:province:110000": box(0.01, -1, 1, 1),
            },
            "city": {
                "CHN:city:440300": box(-1, -1, 0.01, 1),
                "CHN:city:110000": box(0.01, -1, 1, 1),
            },
        }
        self.provider = parse_provider_location("深圳市:广东省", self.catalog)

    def calculate(self, points, shapes=None, reverse=False):
        prepared = prepare_route(route([points]))
        return attribute_route(
            prepared,
            package(shapes or self.shapes, reverse),
            self.catalog,
            self.provider,
        )

    def test_cross_province_city_repeat_and_platform_distance_unchanged(self):
        activity = {"distance": 21100}
        result = self.calculate([(0, 0, 0), (0.02, 0, 1000), (0, 0, 2000)])
        self.assertEqual(activity["distance"], 21100)
        reference = GEOD.inv(0, 0, 0.02, 0)[2] * 2
        self.assertAlmostEqual(result["validGpsDistanceM"], reference, places=5)
        self.assertEqual(len(result["regions"]), 5)
        self.assertEqual(len({region["id"] for region in result["regions"]}), 5)
        for level in ("province", "city"):
            self.assertAlmostEqual(
                result["levels"][level]["uncertainDistanceM"], 120, delta=0.01
            )
            self.assertAlmostEqual(
                result["levels"][level]["trustedDistanceM"], reference - 120, delta=0.01
            )
        self.assertEqual(result["primary"]["provinceId"], "CHN:province:110000")
        self.assertEqual(result["primary"]["cityId"], "CHN:city:110000")
        self.assertEqual(
            result,
            self.calculate([(0, 0, 0), (0.02, 0, 1000), (0, 0, 2000)], reverse=True),
        )

    def test_middle_country_b_detected_between_endpoints_in_a(self):
        shapes = {
            "country": {
                "country:CHN": MultiPolygon(
                    [box(-1, -1, 0.005, 1), box(0.015, -1, 1, 1)]
                ),
                "country:USA": box(0.005, -1, 0.015, 1),
            }
        }
        result = self.calculate([(0, 0, 0), (0.02, 0, 1000)], shapes)
        distances = {region["id"]: region["distanceM"] for region in result["regions"]}
        self.assertGreater(distances["country:USA"], 1000)
        self.assertAlmostEqual(
            result["levels"]["country"]["uncertainDistanceM"], 120, delta=0.01
        )
        self.assertIn("out_of_scope", result["levels"]["city"]["reasons"])
        self.assertIn("boundary_unavailable", result["levels"]["city"]["reasons"])

    def test_holes_overlaps_gaps_and_parent_conflict_are_not_double_counted(self):
        shapes = copy.deepcopy(self.shapes)
        shapes["country"]["country:CHN"] = Polygon(
            [(-1, -1), (1, -1), (1, 1), (-1, 1), (-1, -1)],
            [[(0.004, -0.1), (0.004, 0.1), (0.006, 0.1), (0.006, -0.1), (0.004, -0.1)]],
        )
        shapes["province"]["CHN:province:110000"] = box(0.009, -1, 1, 1)
        result = self.calculate([(0, 0, 0), (0.02, 0, 1000)], shapes)
        self.assertIn("coverage_gap", result["levels"]["country"]["reasons"])
        self.assertIn("overlap", result["levels"]["province"]["reasons"])
        self.assertIn("parent_conflict", result["levels"]["city"]["reasons"])
        validate_conservation(result)

    def test_brief_crossing_uncertain_and_overseas_out_of_scope(self):
        result = self.calculate([(0, 0, 0), (0.01035, 0, 1000), (0, 0, 2000)])
        self.assertIn("brief_crossing", result["levels"]["city"]["reasons"])
        self.assertNotIn(
            "CHN:city:110000", {region["id"] for region in result["regions"]}
        )
        shapes = {"country": {"country:USA": box(-1, -1, 1, 1)}}
        result = self.calculate([(0, 0, 0), (0.001, 0, 60)], shapes)
        for level in ("province", "city"):
            self.assertEqual(result["levels"][level]["status"], "out_of_scope")
            self.assertAlmostEqual(
                result["levels"][level]["uncoveredDistanceM"],
                result["validGpsDistanceM"],
            )

    def test_dateline_country_windows_short_distance(self):
        shapes = {
            "country": {
                "country:CHN": MultiPolygon(
                    [box(179, -1, 180, 1), box(-180, -1, -179, 1)]
                )
            }
        }
        result = self.calculate([(179.9, 0, 0), (-179.9, 0, 1000)], shapes)
        self.assertAlmostEqual(result["validGpsDistanceM"], 22263.8981586, places=4)
        self.assertEqual(len(result["regions"]), 1)
        self.assertEqual(result["levels"]["country"]["uncertainDistanceM"], 0)
        validate_conservation(result)

    def test_missing_package_unknown_values_and_broken_conservation(self):
        value = route([[(0, 0, 0), (0.001, 0, 60)]])
        result = attribute_route(
            prepare_route(value), None, self.catalog, self.provider
        )
        self.assertEqual(result["status"], "boundary_unavailable")
        self.assertFalse(result["regions"])
        validate_conservation(result)
        result["levels"]["city"]["trustedDistanceM"] = 100
        with self.assertRaises(ValueError):
            validate_conservation(result)
        first = input_fingerprint(value, {}, self.catalog)
        active = input_fingerprint(value, {}, self.catalog, package(self.shapes))
        self.assertNotEqual(first, active)

    def test_platform_21100_and_gps_20000_are_independent(self):
        longitude, latitude, _ = GEOD.fwd(0, 0, 90, 20000)
        platform = {"distance": 21100}
        result = self.calculate([(0, 0, 0), (longitude, latitude, 2000)])
        self.assertAlmostEqual(result["validGpsDistanceM"], 20000, places=5)
        self.assertEqual(platform["distance"], 21100)
        validate_conservation(result)

    def test_primary_chain_stays_with_winning_parent(self):
        regions = [
            dict(
                id=key,
                level=region["level"],
                parentId=region["parentId"],
                distanceM=100 if key in ("country:CHN", "CHN:province:440000") else 90,
            )
            for key, region in self.catalog.regions.items()
            if key != "country:USA"
        ]
        primary = primary_chain(regions, self.catalog)
        self.assertEqual(primary["provinceId"], "CHN:province:440000")
        self.assertEqual(primary["cityId"], "CHN:city:440300")


if __name__ == "__main__":
    unittest.main()
