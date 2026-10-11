"""Read-only adapters tested with synthetic original files and mocked FIT decoding."""

import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import polyline

from run_page.geography.routes import RouteSource, read_activity_route


class RouteAdapterTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def gpx(self, segments):
        path = self.root / "101.gpx"
        content = '<gpx version="1.1" creator="synthetic" xmlns="http://www.topografix.com/GPX/1/1"><trk>'
        for points in segments:
            content += "<trkseg>"
            for lat, lon in points:
                content += f'<trkpt lat="{lat}" lon="{lon}"><time>2026-01-01T00:00:00Z</time></trkpt>'
            content += "</trkseg>"
        path.write_text(content + "</trk></gpx>")
        return RouteSource("101", "gpx", True, "EPSG:4326", path=path)

    def db(self, points):
        return RouteSource(
            "101",
            "db_polyline",
            True,
            "EPSG:4326",
            encoded_polyline=polyline.encode(points),
        )

    def test_gpx_segments_times_and_immutable_inputs(self):
        source = self.gpx([[(0, 0), (0, 0.001)], [(0, 1), (0, 1.001)]])
        before = source.path.read_bytes()
        result = read_activity_route("101", [source])
        self.assertEqual(result.status, "available")
        self.assertEqual(len(result.segments), 2)
        self.assertIsNotNone(result.segments[0][0].timestamp)
        self.assertEqual(result.content_digest, hashlib.sha256(before).hexdigest())
        self.assertEqual(source.path.read_bytes(), before)
        self.assertEqual(sorted(p.name for p in self.root.iterdir()), ["101.gpx"])

    def test_empty_singleton_invalid_coordinates_and_missing_original(self):
        for points, status in [
            ([], "no_route"),
            ([(0, 0)], "no_route"),
            ([(100, 0), (100, 1)], "invalid_route"),
        ]:
            self.assertEqual(
                read_activity_route("101", [self.gpx([points])]).status, status
            )
        missing = RouteSource("101", "gpx", True, path=self.root / "101.gpx")
        missing.path.unlink()
        self.assertEqual(read_activity_route("101", [missing]).status, "no_route")
        self.assertEqual(
            read_activity_route("101", [missing, self.db([(0, 0), (0, 0.001)])]).source,
            "db_polyline",
        )

    def test_conflicting_sources_and_borrowed_or_wrong_id_rejected(self):
        source = self.gpx([[(0, 0), (0, 0.001)]])
        for sources in [
            [source, self.db([(1, 1), (1, 1.001)])],
            [RouteSource("102", "gpx", True, path=source.path)],
            [RouteSource("101", "gpx", False, path=source.path)],
        ]:
            self.assertEqual(
                read_activity_route("101", sources).reasons, ("source_conflict",)
            )
        result = read_activity_route("101", [source, self.db([(0, 0), (0, 0.001)])])
        self.assertEqual(result.source, "gpx")

    def test_tcx_preserves_separate_tracks(self):
        path = self.root / "101.tcx"
        body = '<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="Running"><Id>2026-01-01T00:00:00Z</Id><Lap StartTime="2026-01-01T00:00:00Z"><TotalTimeSeconds>120</TotalTimeSeconds><DistanceMeters>222</DistanceMeters><Calories>1</Calories><Intensity>Active</Intensity><TriggerMethod>Manual</TriggerMethod>'
        for offset in (0, 1):
            body += "<Track>"
            for index in (0, 1):
                body += f"<Trackpoint><Time>2026-01-01T00:0{offset}:{index * 30:02d}Z</Time><Position><LatitudeDegrees>0</LatitudeDegrees><LongitudeDegrees>{offset + index * 0.001}</LongitudeDegrees></Position></Trackpoint>"
            body += "</Track>"
        path.write_text(
            body + "</Lap></Activity></Activities></TrainingCenterDatabase>"
        )
        result = read_activity_route(
            "101", [RouteSource("101", "tcx", True, "EPSG:4326", path=path)]
        )
        self.assertEqual(result.status, "available", result.reasons)
        self.assertEqual(len(result.segments), 2)

    def test_fit_pause_segments_and_corruption_never_deletes_file(self):
        path = self.root / "101.fit"
        path.write_bytes(b"synthetic fit decoder input")
        source = RouteSource("101", "fit", True, "EPSG:4326", path=path)
        messages = {
            "event_mesgs": [{"event": "timer", "event_type": "stop", "timestamp": 20}],
            "record_mesgs": [
                {"timestamp": stamp, "position_lat": 0, "position_long": index * 10000}
                for index, stamp in enumerate((0, 10, 30, 40))
            ],
        }
        with (
            patch("run_page.geography.routes.Stream.from_file"),
            patch("run_page.geography.routes.Decoder") as decoder,
        ):
            decoder.return_value.read.return_value = (messages, [])
            result = read_activity_route("101", [source])
            self.assertEqual(len(result.segments), 2)
            decoder.return_value.read.return_value = ({}, ["corrupt"])
            self.assertEqual(
                read_activity_route("101", [source]).status, "invalid_route"
            )
        self.assertEqual(path.read_bytes(), b"synthetic fit decoder input")


if __name__ == "__main__":
    unittest.main()
