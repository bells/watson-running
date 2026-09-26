import datetime
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import polyline

sys.path.insert(0, str(Path(__file__).resolve().parent / "run_page"))

import generator as generator_module
import gpxtrackposter.track as track_module
import polyline_processor
from generator.db import Activity


def route(points):
    return polyline.encode([(0.0, index * 0.0002) for index in range(points)])


class GeneratorPrivacyTests(unittest.TestCase):
    def test_short_route_remains_visible_when_both_ends_cannot_be_clipped(self):
        source = route(31)
        with patch.object(polyline_processor, "IGNORE_START_END_RANGE", 0.5):
            self.assertEqual(polyline_processor.filter_out(source), source)

    def test_public_clipping_does_not_change_source_or_misclassify_short_run(self):
        with tempfile.TemporaryDirectory() as directory:
            generator = generator_module.Generator(str(Path(directory) / "data.db"))
            (Path(directory) / "GPX_OUT").mkdir()
            source_routes = {1: route(151), 2: route(76), 3: ""}
            for run_id, distance in ((1, 3300), (2, 1650), (3, 1500)):
                generator.session.add(
                    Activity(
                        run_id=run_id,
                        name="test run",
                        distance=distance,
                        moving_time=datetime.timedelta(minutes=20),
                        elapsed_time=datetime.timedelta(minutes=20),
                        type="Run",
                        subtype="Run",
                        start_date=f"2026-09-0{run_id} 08:00:00",
                        start_date_local=f"2026-09-0{run_id} 08:00:00",
                        summary_polyline=source_routes[run_id],
                        average_speed=2.5,
                    )
                )
            generator.session.commit()

            with patch.dict(
                os.environ,
                {"RUNNING_DATA_DIR": directory, "IGNORE_START_END_RANGE": "0"},
            ):
                with self.assertRaisesRegex(ValueError, "at least 500"):
                    generator.load()

            with (
                patch.object(polyline_processor, "IGNORE_START_END_RANGE", 0.5),
                patch.object(generator_module, "IGNORE_BEFORE_SAVING", False),
            ):
                first = generator.load()
                second = generator.load()

            self.assertEqual(first, second)
            by_id = {activity["run_id"]: activity for activity in first}
            self.assertLess(
                len(polyline.decode(by_id[1]["summary_polyline"])),
                len(polyline.decode(source_routes[1])),
            )
            self.assertEqual(by_id[2]["subtype"], "Run")
            self.assertEqual(by_id[3]["subtype"], "indoor")
            for run_id, source in source_routes.items():
                stored = generator.session.get(Activity, run_id)
                self.assertEqual(stored.summary_polyline, source)
                self.assertEqual(stored.subtype, "Run")

    def test_svg_track_clips_source_route_without_changing_activity(self):
        source = route(151)
        activity = Activity(
            run_id=1,
            distance=3300,
            elapsed_time=datetime.timedelta(minutes=20),
            moving_time=datetime.timedelta(minutes=20),
            type="Run",
            subtype="Run",
            start_date_local="2026-09-01 08:00:00",
            summary_polyline=source,
        )
        with (
            patch.object(polyline_processor, "IGNORE_START_END_RANGE", 0.5),
            patch.object(track_module, "IGNORE_BEFORE_SAVING", False),
        ):
            track = track_module.Track()
            track.load_from_db(activity)

        self.assertLess(len(track.polylines[0]), len(polyline.decode(source)))
        self.assertEqual(activity.summary_polyline, source)


if __name__ == "__main__":
    unittest.main()
