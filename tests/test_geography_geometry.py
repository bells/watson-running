"""Minimal binary wheel/import, STRtree and geodesic contract across Python versions."""

import unittest

import pyproj
import shapely
from pyproj import Geod, Transformer
from shapely import STRtree
from shapely.geometry import LineString, box


class GeometryCompatibilityTest(unittest.TestCase):
    def test_pinned_versions(self):
        self.assertEqual(shapely.__version__, "2.2.0")
        self.assertEqual(pyproj.__version__, "3.8.0")

    def test_geodesic_intersection_and_candidates(self):
        polygon = box(0, -1, 1, 1)
        line = LineString([(-1, 0), (2, 0)])
        self.assertEqual(list(STRtree([polygon]).query(line)), [0])
        clipped = line.intersection(polygon)
        geod = Geod(ellps="WGS84")
        self.assertAlmostEqual(geod.geometry_length(clipped), 111319.490793, places=5)
        # Geographic degrees are topology units, never the reported distance.
        self.assertEqual(clipped.length, 1)
        self.assertGreater(geod.geometry_length(clipped), 100000)

    def test_crs_transform(self):
        transform = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)
        x, y = transform.transform(1, 0)
        self.assertAlmostEqual(x, 111319.490793, places=5)
        self.assertAlmostEqual(y, 0)


if __name__ == "__main__":
    unittest.main()
