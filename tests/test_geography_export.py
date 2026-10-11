import datetime
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import polyline

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "run_page"))

from generator import Generator  # noqa: E402
from generator.db import Activity, ACTIVITY_KEYS, JoyrunDetail  # noqa: E402
from run_page.geography.catalog import load_catalog  # noqa: E402
from run_page.geography.export import export_geography  # noqa: E402
from run_page.geography.incremental import sync_incremental  # noqa: E402
from run_page.geography.repository import migrate, read_summary  # noqa: E402
import polyline_processor  # noqa: E402


class GeographyExportTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.database = self.root / "data.db"
        self.generator = Generator(str(self.database))
        self.addCleanup(self.generator.session.close)
        self.catalog = load_catalog()
        self.source = polyline.encode([(0, index * 0.0002) for index in range(151)])
        self.generator.session.add(
            Activity(
                run_id=101,
                name="run from joyrun",
                distance=21100,
                type="Run",
                subtype="Run",
                moving_time=datetime.timedelta(seconds=1800),
                elapsed_time=datetime.timedelta(seconds=1800),
                start_date="2026-01-01 08:00:00",
                start_date_local="2026-01-01 08:00:00",
                location_country="深圳:广东",
                summary_polyline=self.source,
            )
        )
        self.generator.session.commit()

    def migrate(self):
        with sqlite3.connect(self.database) as connection:
            migrate(connection, self.catalog)

    def test_old_db_export_remains_without_implicit_schema_migration(self):
        self.assertEqual(sync_incremental(self.generator.session), {"not_migrated": 1})
        with patch.object(polyline_processor, "IGNORE_START_END_RANGE", 0.5):
            activity = self.generator.load()[0]
        self.assertNotIn("geography", activity)
        with sqlite3.connect(self.database) as connection:
            self.assertFalse(
                connection.execute(
                    "SELECT name FROM sqlite_master WHERE name='geography_schema'"
                ).fetchone()
            )
        self.assertNotIn("geography", ACTIVITY_KEYS)

    def test_incremental_missing_changed_and_unchanged_sources(self):
        self.migrate()
        self.assertEqual(sync_incremental(self.generator.session), {"unknown_crs": 1})
        self.assertEqual(sync_incremental(self.generator.session), {"skipped": 1})
        activity = self.generator.session.get(Activity, 101)
        activity.subtype = "treadmill"
        self.generator.session.commit()
        self.assertEqual(sync_incremental(self.generator.session), {"indoor": 1})

    def test_incremental_failure_is_persisted_retried_and_keeps_facts(self):
        self.migrate()
        with patch(
            "run_page.geography.incremental.calculate_activity",
            side_effect=RuntimeError("synthetic failure"),
        ):
            self.assertEqual(sync_incremental(self.generator.session), {"error": 1})
        self.assertEqual(self.generator.session.get(Activity, 101).distance, 21100)
        with sqlite3.connect(self.database) as connection:
            self.assertEqual(read_summary(connection, 101)["status"], "error")
        self.assertEqual(sync_incremental(self.generator.session), {"unknown_crs": 1})

    def test_raw_detail_change_invalidates_geography(self):
        self.migrate()
        self.generator.session.add(
            JoyrunDetail(run_id=101, raw_detail_json="{}", raw_list_json="{}")
        )
        self.generator.session.commit()
        sync_incremental(self.generator.session)
        detail = self.generator.session.get(JoyrunDetail, 101)
        activity = self.generator.session.get(Activity, 101)
        activity.name = "renamed activity"
        detail.raw_detail_json = '{"synthetic": "changed"}'
        self.generator.session.commit()
        with sqlite3.connect(self.database) as connection:
            result = export_geography(
                connection,
                self.generator.session.get(Activity, 101).to_dict(),
                self.root,
                self.catalog,
            )
            self.assertEqual(result["status"], "stale")
        self.assertEqual(sync_incremental(self.generator.session), {"unknown_crs": 1})

    def test_stale_does_not_publish_previous_relationships_or_paths(self):
        self.migrate()
        sync_incremental(self.generator.session)
        activity = self.generator.session.get(Activity, 101).to_dict()
        with sqlite3.connect(self.database) as connection:
            original = read_summary(connection, 101)
            self.assertIn("input_fingerprint", original)
            activity["summary_polyline"] = ""
            result = export_geography(connection, activity, self.root, self.catalog)
        self.assertEqual(result["status"], "stale")
        self.assertEqual(result["regions"], [])
        self.assertTrue(all(value is None for value in result["primary"].values()))
        serialized = json.dumps(result)
        for forbidden in (
            "input_fingerprint",
            "raw_detail_json",
            "coordinates",
            "timestamp",
            "latitude",
            "longitude",
            str(self.root),
        ):
            self.assertNotIn(forbidden, serialized)

    def test_unknown_crs_geo_and_public_clipping_are_independent_of_source(self):
        self.migrate()
        sync_incremental(self.generator.session)
        with patch.object(polyline_processor, "IGNORE_START_END_RANGE", 0.5):
            item = self.generator.load()[0]
        self.assertEqual(item["geography"]["status"], "unknown_crs")
        self.assertEqual(item["geography"]["provider"]["cityId"], "CHN:city:440300")
        self.assertLess(
            len(polyline.decode(item["summary_polyline"])),
            len(polyline.decode(self.source)),
        )
        self.assertEqual(
            self.generator.session.get(Activity, 101).summary_polyline, self.source
        )

    def test_corrupt_reason_payload_is_locally_rejected(self):
        self.migrate()
        sync_incremental(self.generator.session)
        activity = self.generator.session.get(Activity, 101).to_dict()
        with sqlite3.connect(self.database) as connection:
            old = read_summary(connection, 101)
            levels = json.loads(old["levels_json"])
            levels["city"]["reasons"] = [{"coordinates": [0, 0], "sid": "secret"}]
            connection.execute(
                "UPDATE activity_region_summaries SET levels_json=? WHERE run_id=101",
                (json.dumps(levels),),
            )
            result = export_geography(connection, activity, self.root, self.catalog)
        self.assertEqual(result["status"], "error")
        self.assertNotIn("secret", json.dumps(result))
        self.assertEqual(self.generator.session.get(Activity, 101).distance, 21100)


if __name__ == "__main__":
    unittest.main()
