"""Offline JoyRun detail contract checks with synthetic records."""

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import polyline
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "run_page"))

from generator.db import Activity, Base, JoyrunDetail  # noqa: E402
from generator import Generator  # noqa: E402
from joyrun_sync import Joyrun, sync_joyrun_data  # noqa: E402
from joyrun_detail import normalize_joyrun_detail  # noqa: E402
from joyrun_detail_sync import (  # noqa: E402
    assert_existing_activities_unchanged,
    export_public,
    save_detail,
    sync_missing_details,
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
    def test_normal_sync_reuses_new_details_and_backfills_existing_activities(self):
        listed, record = fixture()
        record.update(
            content="", city="深圳", province="广东", pause="[]", heartrate="[120,130]"
        )
        client = Joyrun()
        client.get_runs_records = Mock(return_value=[listed])
        client.get_single_run_record = Mock(return_value={"runrecord": record})
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            generator = Generator(str(root / "data.db"))
            public_details = root / "details"
            summaries = root / "activities.json"
            from joyrun_detail_sync import export_public

            with (
                patch("joyrun_sync.GPX_FOLDER", directory),
                patch("joyrun_sync.JSON_FILE", str(summaries)),
                patch(
                    "joyrun_sync.export_public",
                    side_effect=lambda session: export_public(session, public_details),
                ),
            ):
                self.assertEqual([], sync_joyrun_data(client, generator))
                client.get_runs_records.assert_called_once()
                client.get_single_run_record.assert_called_once_with(42)
                activity = json.loads(summaries.read_text())[0]
                self.assertTrue(activity["detail_available"])
                self.assertEqual("Garmin", activity["source"])
                self.assertEqual(310, activity["calories_kcal"])
                self.assertTrue((public_details / "42.json").exists())
                client.get_single_run_record.reset_mock()
                self.assertEqual([], sync_joyrun_data(client, generator))
                client.get_single_run_record.assert_not_called()
                with patch(
                    "geography.incremental.sync_incremental",
                    side_effect=RuntimeError("synthetic geography failure"),
                ):
                    self.assertEqual([], sync_joyrun_data(client, generator))
                self.assertEqual(1, generator.session.query(Activity).count())
                self.assertIsNotNone(generator.session.get(JoyrunDetail, 42))
                generator.session.delete(generator.session.get(JoyrunDetail, 42))
                generator.session.commit()
                with patch("joyrun_detail_sync.time.sleep"):
                    self.assertEqual([], sync_joyrun_data(client, generator))
                client.get_single_run_record.assert_called_once_with(42)
                self.assertEqual(1, generator.session.query(Activity).count())
                client.get_runs_records.return_value = [{**listed, "fid": 43}]
                client.get_single_run_record.return_value = {
                    "runrecord": {
                        **record,
                        "fid": 43,
                        "sampleinterval": 61,
                        "starttime": 2000,
                        "endtime": 2310,
                    }
                }
                client.get_single_run_record.reset_mock()
                with patch("joyrun_detail_sync.time.sleep"):
                    self.assertEqual(
                        [(43, "ValueError")], sync_joyrun_data(client, generator)
                    )
                self.assertEqual(3, client.get_single_run_record.call_count)
                self.assertEqual(2, generator.session.query(Activity).count())
                activity = next(
                    item
                    for item in json.loads(summaries.read_text())
                    if item["run_id"] == 43
                )
                self.assertFalse(activity.get("detail_available", False))
                self.assertFalse((public_details / "43.json").exists())
            generator.session.close()
            generator.session.bind.dispose()

    def test_detail_retry_preserves_success_and_skips_non_activity_ids(self):
        listed, record = fixture()
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        session = sessionmaker(bind=engine)()
        session.add(Activity(run_id=42, name="Run", distance=1050))
        session.commit()
        client = Mock()
        client.get_single_run_record.side_effect = [
            TimeoutError(),
            TimeoutError(),
            {"runrecord": record},
        ]
        with patch("joyrun_detail_sync.time.sleep"):
            self.assertEqual(
                [],
                sync_missing_details(client, session, [listed, {"fid": 99}], delay=0),
            )
            self.assertEqual(3, client.get_single_run_record.call_count)
            client.get_single_run_record.side_effect = None
            client.get_single_run_record.reset_mock()
            self.assertEqual(
                [], sync_missing_details(client, session, [listed], delay=0)
            )
            client.get_single_run_record.assert_not_called()
            session.delete(session.get(JoyrunDetail, 42))
            session.commit()
            client.get_single_run_record.side_effect = TimeoutError()
            self.assertEqual(
                [(42, "TimeoutError")],
                sync_missing_details(client, session, [listed], delay=0),
            )
            self.assertIsNone(session.get(JoyrunDetail, 42))
        session.close()
        engine.dispose()

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
