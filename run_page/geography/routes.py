"""Read original route sources without TrackLoader, network or database side effects."""

import hashlib
import math
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import gpxpy
import polyline
from garmin_fit_sdk import Decoder, Stream
from garmin_fit_sdk.util import FIT_EPOCH_S
from lxml import etree
from pyproj import Geod
from tcxreader.tcxreader import TCXReader

GEOD = Geod(ellps="WGS84")
MAX_SOURCE_BYTES = 64 * 1024 * 1024


@dataclass(frozen=True)
class RoutePoint:
    longitude: float
    latitude: float
    timestamp: float | None = None


@dataclass(frozen=True)
class RouteSource:
    activity_id: str
    kind: str
    original: bool
    crs: str | None = None
    path: Path | None = None
    encoded_polyline: str | None = None


@dataclass(frozen=True)
class RouteRead:
    status: str
    segments: tuple
    source: str | None
    crs: str | None
    reasons: tuple
    content_digest: str | None


def _timestamp(value):
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return None
        return value.timestamp()
    if isinstance(value, (int, float)) and math.isfinite(value):
        return float(value)
    return None


def _point(longitude, latitude, timestamp=None):
    try:
        longitude, latitude = float(longitude), float(latitude)
    except (ValueError, TypeError):
        return None
    if (
        not math.isfinite(longitude)
        or not math.isfinite(latitude)
        or abs(longitude) > 180
        or abs(latitude) > 90
    ):
        return None
    return RoutePoint(longitude, latitude, _timestamp(timestamp))


def _gpx(path):
    with path.open(encoding="utf-8") as stream:
        document = gpxpy.parse(stream)
    return [
        [_point(p.longitude, p.latitude, p.time) for p in segment.points]
        for track in document.tracks
        for segment in track.segments
    ]


def _tcx(path):
    # TCXReader supplies typed values; XML Track boundaries prevent its flat list
    # from inventing connections across distinct tracks/laps or missing positions.
    exercise = TCXReader().read(str(path), only_gps=False, null_value_handling=1)
    parser = etree.XMLParser(resolve_entities=False, no_network=True)
    document = etree.parse(str(path), parser)
    counts = [
        len(track.findall("{*}Trackpoint")) for track in document.findall(".//{*}Track")
    ]
    if sum(counts) != len(exercise.trackpoints):
        raise ValueError("tcx_structure_mismatch")
    segments = []
    offset = 0
    for count in counts:
        segments.append(
            [
                _point(p.longitude, p.latitude, p.time)
                for p in exercise.trackpoints[offset : offset + count]
            ]
        )
        offset += count
    return segments


def _fit(path):
    messages, errors = Decoder(Stream.from_file(str(path))).read(
        convert_datetimes_to_dates=False
    )
    if errors:
        raise ValueError("invalid_fit")
    segments = [[]]
    timer_stops = sorted(
        event["timestamp"]
        for event in messages.get("event_mesgs", [])
        if event.get("event") == "timer"
        and event.get("event_type")
        in ("stop", "stop_all", "stop_disable", "stop_disable_all")
        and isinstance(event.get("timestamp"), (int, float))
    )
    previous_time = None
    for record in messages.get("record_mesgs", []):
        stamp = record.get("timestamp")
        if previous_time is not None and stamp is not None:
            if any(previous_time <= stop < stamp for stop in timer_stops):
                segments.append([])
        if isinstance(stamp, (int, float)):
            previous_time = stamp
            time = datetime.fromtimestamp(stamp + FIT_EPOCH_S, tz=timezone.utc)
        else:
            time = stamp
        lon, lat = record.get("position_long"), record.get("position_lat")
        if lon is None or lat is None:
            segments.append([])
        else:
            segments[-1].append(_point(lon * 180 / 2**31, lat * 180 / 2**31, time))
    return segments


def _length(segments):
    return sum(
        GEOD.inv(a.longitude, a.latitude, b.longitude, b.latitude)[2]
        for segment in segments
        for a, b in zip(segment, segment[1:])
    )


def _read(source):
    digest = None
    if source.kind == "db_polyline":
        content = source.encoded_polyline or ""
        digest = hashlib.sha256(content.encode()).hexdigest()
        segments = [[_point(lon, lat) for lat, lon in polyline.decode(content)]]
    else:
        if source.path is None or not source.path.is_file():
            return RouteRead(
                "no_route", (), source.kind, source.crs, ("missing_source_file",), None
            )
        if source.path.stem != source.activity_id:
            return RouteRead(
                "invalid_route", (), source.kind, source.crs, ("source_conflict",), None
            )
        if source.path.stat().st_size > MAX_SOURCE_BYTES:
            raise ValueError("source_too_large")
        digest = hashlib.sha256(source.path.read_bytes()).hexdigest()
        parser = {"gpx": _gpx, "tcx": _tcx, "fit": _fit}.get(source.kind)
        if parser is None:
            raise ValueError("unsupported_source")
        segments = parser(source.path)
        if hashlib.sha256(source.path.read_bytes()).hexdigest() != digest:
            return RouteRead(
                "invalid_route", (), source.kind, source.crs, ("source_changed",), None
            )
    clean = []
    reasons = set()
    for segment in segments:
        current = []
        for point in segment:
            if point is None:
                reasons.add("invalid_coordinate")
                if current:
                    clean.append(tuple(current))
                current = []
            else:
                current.append(point)
        if current:
            clean.append(tuple(current))
    usable = tuple(segment for segment in clean if len(segment) >= 2)
    status = "available" if usable else ("invalid_route" if reasons else "no_route")
    return RouteRead(
        status, usable, source.kind, source.crs, tuple(sorted(reasons)), digest
    )


def read_activity_route(activity_id, sources):
    """The caller supplies provenance, never a Generator's public/borrowed route.

    This adapter preserves CRS declarations; confirming them belongs to the
    versioned source policy, not to coordinate-range checks here.
    """
    reads = []
    for source in sources:
        if source.activity_id != str(activity_id) or not source.original:
            return RouteRead(
                "invalid_route", (), None, None, ("source_conflict",), None
            )
        try:
            result = _read(source)
        except Exception:
            # Format libraries may include original coordinates/paths in errors.
            result = RouteRead(
                "invalid_route", (), source.kind, source.crs, ("invalid_route",), None
            )
        if "source_conflict" in result.reasons or "source_changed" in result.reasons:
            return result
        reads.append(result)
    usable = [result for result in reads if result.status == "available"]
    if not usable:
        invalid = next(
            (result for result in reads if result.status == "invalid_route"), None
        )
        return invalid or RouteRead("no_route", (), None, None, ("no_route",), None)
    reference = usable[0]
    for candidate in usable[1:]:
        if reference.crs != candidate.crs:
            return RouteRead(
                "invalid_route", (), None, None, ("source_conflict",), None
            )
        # Only confirmed WGS84 can be compared in physical metres. Unknown CRS
        # remains for the source policy to reject before any attribution.
        if reference.crs in ("EPSG:4326", "OGC:CRS84"):
            lengths = [_length(result.segments) for result in (reference, candidate)]
            endpoints = [
                GEOD.inv(a.longitude, a.latitude, b.longitude, b.latitude)[2]
                for a, b in (
                    (reference.segments[0][0], candidate.segments[0][0]),
                    (reference.segments[-1][-1], candidate.segments[-1][-1]),
                )
            ]
            if (
                abs(lengths[0] - lengths[1]) > max(20, max(lengths) * 0.005)
                or max(endpoints) > 30
            ):
                return RouteRead(
                    "invalid_route", (), None, None, ("source_conflict",), None
                )
    priority = {"gpx": 0, "tcx": 1, "fit": 2, "db_polyline": 3}
    return min(usable, key=lambda result: priority[result.source])
