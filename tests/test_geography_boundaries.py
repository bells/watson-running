"""Package acceptance and activation use only copied synthetic files."""

import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from shapely.geometry import LineString, Point, box

from run_page.geography.boundaries import (
    BoundaryError,
    activate_package,
    load_active_package,
    load_package,
)
from run_page.geography.catalog import load_catalog

FIXTURE = Path(__file__).parent / "fixtures" / "geography-boundaries"


class BoundaryAcceptanceTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "package"
        shutil.copytree(FIXTURE, self.root)
        self.catalog = load_catalog(self.root / "catalog.json")

    def manifest(self, mutate):
        path = self.root / "manifest.json"
        data = json.loads(path.read_text())
        mutate(data)
        path.write_text(json.dumps(data))

    def geometry(self, mutate):
        path = self.root / "city.geojson"
        data = json.loads(path.read_text())
        mutate(data)
        path.write_text(json.dumps(data))
        self.manifest(
            lambda doc: doc["layers"][2].update(
                sha256=hashlib.sha256(path.read_bytes()).hexdigest()
            )
        )

    def load(self):
        return load_package(self.root, self.catalog, allow_synthetic=True)

    def test_holes_islands_and_candidate_completeness(self):
        package = self.load()
        layer = package.layers["country"]
        by_id = dict(zip(layer.ids, layer.geometries))
        self.assertFalse(by_id["country:CHN"].covers(Point(0.3, 0.6)))
        self.assertTrue(by_id["country:USA"].covers(Point(9.5, 1)))
        for query in [LineString([(-1, 1), (11, 1)]), box(0, 0, 10, 2)]:
            candidates = {region_id for region_id, _ in layer.candidates(query)}
            expected = {
                region_id for region_id, geom in by_id.items() if geom.intersects(query)
            }
            self.assertTrue(expected.issubset(candidates))
        self.assertEqual(
            package.report["layers"]["city"]["overlaps"],
            [["CHN:city:440300", "CHN:city:441900"]],
        )
        self.assertTrue(package.report["layers"]["city"]["hasGaps"])

    def test_country_only_explicitly_unavailable_lower_layers(self):
        self.manifest(lambda doc: doc.update(layers=doc["layers"][:1]))
        package = self.load()
        self.assertEqual(package.layer_status("country"), "available")
        for level in ("province", "city"):
            self.assertEqual(package.layer_status(level), "boundary_unavailable")

    def test_bad_manifests_rejected_without_file_changes(self):
        mutations = [
            lambda doc: doc["layers"][2].update(sourceAdministrativeSemantics="county"),
            lambda doc: doc["layers"][0].update(sha256="0" * 64),
            lambda doc: doc["layers"][0].update(sourceCrs="unknown"),
            lambda doc: doc["layers"][0].update(crsEvidence=""),
            lambda doc: doc["layers"][0].update(upstreamDataLicense={}),
            lambda doc: doc["layers"][0].update(regionIds=["country:CHN"]),
            lambda doc: doc["layers"][2].update(knownOverlaps=[]),
            lambda doc: doc["layers"][0].update(knownGaps=[]),
            lambda doc: doc["layers"][0].update(file="../outside.geojson"),
        ]
        original = (self.root / "manifest.json").read_bytes()
        for mutation in mutations:
            with self.subTest(mutation=mutation):
                (self.root / "manifest.json").write_bytes(original)
                self.manifest(mutation)
                before = {p.name: p.read_bytes() for p in self.root.iterdir()}
                with self.assertRaises(BoundaryError):
                    self.load()
                self.assertEqual(
                    before, {p.name: p.read_bytes() for p in self.root.iterdir()}
                )
        self.assertFalse(any(self.root.glob("*.db*")))

    def test_invalid_geometry_parent_code_and_dateline_rejected(self):
        mutations = [
            lambda doc: doc["features"][0]["properties"].update(
                parent_id="country:USA"
            ),
            lambda doc: doc["features"][0]["properties"].update(
                region_id="CHN:city:440301"
            ),
            lambda doc: doc["features"][0].update(
                geometry={
                    "type": "Polygon",
                    "coordinates": [[[0, 0], [2, 2], [0, 2], [2, 0], [0, 0]]],
                }
            ),
            lambda doc: doc["features"][0].update(
                geometry={
                    "type": "Polygon",
                    "coordinates": [
                        [[179, 0], [-179, 0], [-179, 1], [179, 1], [179, 0]]
                    ],
                }
            ),
        ]
        original = (self.root / "city.geojson").read_bytes()
        for mutation in mutations:
            (self.root / "city.geojson").write_bytes(original)
            self.geometry(mutation)
            with self.assertRaises(BoundaryError):
                self.load()

    def test_activation_revalidation_and_explicit_synthetic_guard(self):
        with self.assertRaises(BoundaryError):
            load_package(self.root, self.catalog)
        with self.assertRaises(BoundaryError):
            load_active_package(self.root, self.catalog, allow_synthetic=True)
        activate_package(self.root, self.catalog, allow_synthetic=True)
        self.assertTrue(
            load_active_package(self.root, self.catalog, allow_synthetic=True).synthetic
        )
        self.manifest(lambda doc: doc.update(packageVersion="changed"))
        with self.assertRaises(BoundaryError):
            load_active_package(self.root, self.catalog, allow_synthetic=True)

    def test_acceptance_cli_good_and_bad_packages(self):
        command = [
            sys.executable,
            "-m",
            "run_page.geography.boundaries",
            str(self.root),
            "--catalog",
            str(self.root / "catalog.json"),
            "--allow-synthetic",
            "--activate",
        ]
        good = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(good.returncode, 0, good.stderr)
        report = json.loads(good.stdout)
        self.assertTrue(report["accepted"])
        self.assertNotIn("coordinates", good.stdout)
        self.manifest(
            lambda doc: doc["layers"][2].update(sourceAdministrativeSemantics="county")
        )
        bad = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(bad.returncode, 1)
        self.assertFalse(json.loads(bad.stdout)["accepted"])
        self.assertNotIn(str(self.root), bad.stdout)


if __name__ == "__main__":
    unittest.main()
