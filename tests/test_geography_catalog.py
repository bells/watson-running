"""No database, network or private route inputs are used by this contract suite."""

import copy
import json
import unittest
from pathlib import Path

from run_page.geography.catalog import Catalog, load_catalog, parse_provider_location

FIXTURE = Path(__file__).parent / "fixtures" / "geography-contract.json"


class GeographyCatalogTest(unittest.TestCase):
    def setUp(self):
        self.fixture = json.loads(FIXTURE.read_text())
        self.catalog = Catalog(self.fixture["catalog"])

    def test_provider_chains_and_original_text(self):
        for case in self.fixture["cases"]:
            with self.subTest(raw=case["raw"]):
                before = copy.deepcopy(case)
                self.assertEqual(
                    parse_provider_location(case["raw"], self.catalog),
                    case["provider"],
                )
                self.assertEqual(case, before)

    def test_catalog_rejects_invalid_identity_or_parent(self):
        for mutation in ("duplicate", "parent", "level", "code"):
            data = copy.deepcopy(self.fixture["catalog"])
            if mutation == "duplicate":
                data["regions"].append(data["regions"][0])
            elif mutation == "parent":
                data["regions"][-1]["parentId"] = "country:USA"
            elif mutation == "level":
                data["regions"][-1]["level"] = "county"
            else:
                data["regions"][-1]["code"] = data["regions"][-3]["code"]
            with self.assertRaises(ValueError):
                Catalog(data)

    def test_runtime_catalog_matches_existing_names(self):
        catalog = load_catalog()
        self.assertEqual(
            parse_provider_location("深圳:广东", catalog)["cityId"],
            "CHN:city:440300",
        )
        self.assertEqual(
            parse_provider_location("南昌:江西", catalog)["cityId"],
            "CHN:city:360100",
        )
        self.assertFalse(
            any(r["code"].endswith("9000") for r in catalog.regions.values())
        )

    def test_unknown_and_zero_distances_remain_distinct(self):
        contract = self.fixture["contract"]
        self.assertEqual(contract["schemaVersion"], 1)
        self.assertEqual(contract["distanceUnit"], "m")
        self.assertIsNone(contract["unknownDistance"])
        self.assertEqual(contract["zeroDistance"], 0)
        self.assertTrue(contract["onlyPositiveTrustedRegions"])


if __name__ == "__main__":
    unittest.main()
