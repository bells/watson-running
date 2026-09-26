"""Offline JoyRun detail contract checks with synthetic records."""

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import polyline
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "run_page"))

from generator.db import Activity, Base, JoyrunDetail  # noqa: E402
from joyrun_detail import normalize_joyrun_detail  # noqa: E402
from joyrun_detail_sync import (  # noqa: E402
    assert_existing_activities_unchanged,
    export_public,
    save_detail,
)
import polyline_processor  # noqa: E402


def fixture():
    listed = {"fid": 42, "calorie": 310000, "source": "Garmin", "uid": 99}
    record = {
        "fid": 42,
        "starttime": 1000,
        "endtime": 1310,
        "meter": 1050,
        "second": 300,
        "sampleinterval": 5,
        "totalsteps": 450,
        "source": "Garmin",
        "node": "[[1000,280]]",
        "heartrate": '[120,"bad",130]',
        "altitude": '[10,"bad",12]',
        "stepcontent": '[["8","10"],["7","9"],["6","8"]]',
        "content": "[[123456789,123456789]]",
        "nodeattach": "[[123456789,123456789]]",
        "uid": 99,
    }
    return listed, record


class JoyrunDetailTest(unittest.TestCase):
    def test_short_route_remains_visible_when_endpoint_clipping_overlaps(self):
        points = [(0.0, 0.0), (0.0, 0.005), (0.0, 0.01)]
        with patch.object(polyline_processor, "IGNORE_START_END_RANGE", 0.5):
            self.assertEqual(
                polyline.encode(points),
                polyline_processor.filter_out(polyline.encode(points)),
            )

    def test_summary_export_rejects_route_changes(self):
        previous = [{"run_id": 42, "summary_polyline": "longer-clipped-route"}]
        current = [
            {
                "run_id": 42,
                "summary_polyline": "shorter-clipped-route",
                "source": "Garmin",
            }
        ]
        with self.assertRaisesRegex(ValueError, "Refusing to change"):
            assert_existing_activities_unchanged(previous, current)
        current[0]["summary_polyline"] = previous[0]["summary_polyline"]
        assert_existing_activities_unchanged(previous, current)

    def test_missing_samples_keep_time_alignment_and_splits(self):
        listed, record = fixture()
        detail = normalize_joyrun_detail(listed, record)
        self.assertEqual(
            [120, None, 130], [sample["heart_rate_bpm"] for sample in detail["samples"]]
        )
        self.assertEqual(
            [10, None, 12], [sample["altitude_m"] for sample in detail["samples"]]
        )
        self.assertEqual(
            [0, 5, 10], [sample["moving_seconds"] for sample in detail["samples"]]
        )
        self.assertEqual(
            [1000, 50], [split["distance_m"] for split in detail["splits"]]
        )
        self.assertEqual(310, detail["calories_kcal"])
        self.assertNotIn("content", detail)
        self.assertNotIn("uid", detail)

    def test_public_export_uses_only_normalized_fields(self):
        listed, record = fixture()
        with tempfile.TemporaryDirectory() as temp_dir:
            engine = create_engine("sqlite://")
            Base.metadata.create_all(engine)
            session = sessionmaker(bind=engine)()
            session.add(Activity(run_id=42, name="Run", distance=1050))
            session.commit()
            save_detail(session, listed, record)
            self.assertEqual(1, export_public(session, Path(temp_dir)))
            public = (Path(temp_dir) / "42.json").read_text()
            self.assertNotIn("123456789", public)
            self.assertNotIn("uid", public)
            self.assertNotIn("nodeattach", public)
            self.assertEqual(42, json.loads(public)["run_id"])
            self.assertEqual(
                [42], json.loads((Path(temp_dir) / "index.json").read_text())["run_ids"]
            )
            private = session.get(JoyrunDetail, 42)
            self.assertIn("nodeattach", private.raw_detail_json)


if __name__ == "__main__":
    unittest.main()
