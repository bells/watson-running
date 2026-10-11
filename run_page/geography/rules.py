"""Versioned source policy, continuous geodesic preparation and input identity."""

import hashlib
import json
import math
from dataclasses import asdict, dataclass

from pyproj import Geod

from .routes import RoutePoint

GEOD = Geod(ellps="WGS84")
RULES_VERSION = "geography-rules-v1"
MAX_SPEED_MPS = 60
UNTIMED_JUMP_M = 1000
MAX_PIECE_M = 25
BOUNDARY_BUFFER_M = 30
BRIEF_CROSSING_M = 100
INDOOR_SUBTYPES = {"treadmill", "indoor", "virtualrun", "virtualride"}


@dataclass(frozen=True)
class PreparedRoute:
    status: str
    segments: tuple
    valid_distance_m: float | None
    reasons: tuple
    excluded_chord_m: float = 0


def source_status(route, indoor_inputs):
    if indoor_inputs.get("borrowed") or indoor_inputs.get("explicitIndoor"):
        return "indoor"
    if str(indoor_inputs.get("subtype", "")).lower() in INDOOR_SUBTYPES:
        return "indoor"
    if route.status != "available":
        return route.status
    # JoyRun wgs=1 is intentionally insufficient until control evidence exists.
    if indoor_inputs.get("provider") == "joyrun" and not indoor_inputs.get(
        "crsEvidenceVersion"
    ):
        return "unknown_crs"
    return "available" if route.crs in ("EPSG:4326", "OGC:CRS84") else "unknown_crs"


def _interpolate(a, b, ratio):
    azimuth, _, length = GEOD.inv(a.longitude, a.latitude, b.longitude, b.latitude)
    longitude, latitude, _ = GEOD.fwd(a.longitude, a.latitude, azimuth, length * ratio)
    stamp = (
        a.timestamp + (b.timestamp - a.timestamp) * ratio
        if a.timestamp is not None and b.timestamp is not None
        else None
    )
    return RoutePoint(longitude, latitude, stamp)


def _dateline(a, b):
    """Return equivalent ±180 points on the short geodesic; no world-spanning chord."""
    positive = a.longitude > 0
    low, high = 0.0, 1.0
    for _ in range(50):
        middle = (low + high) / 2
        point = _interpolate(a, b, middle)
        before = point.longitude >= 0 if positive else point.longitude <= 0
        if before:
            low = middle
        else:
            high = middle
    point = _interpolate(a, b, (low + high) / 2)
    edge = 180 if positive else -180
    return RoutePoint(edge, point.latitude, point.timestamp), RoutePoint(
        -edge, point.latitude, point.timestamp
    )


def prepare_route(route, indoor_inputs=None):
    status = source_status(route, indoor_inputs or {})
    if status != "available":
        return PreparedRoute(status, (), None, tuple(sorted({*route.reasons, status})))
    segments = []
    reasons = set(route.reasons)
    excluded = 0.0
    valid = 0.0
    for original in route.segments:
        current = [original[0]]
        for a, b in zip(original, original[1:]):
            _, _, length = GEOD.inv(a.longitude, a.latitude, b.longitude, b.latitude)
            reason = None
            if a.timestamp is not None and b.timestamp is not None:
                elapsed = b.timestamp - a.timestamp
                if elapsed < 0:
                    reason = "time_reversal"
                elif (elapsed == 0 and length > 0) or (
                    elapsed > 0 and length / elapsed > MAX_SPEED_MPS
                ):
                    reason = "jump_point"
            elif length > UNTIMED_JUMP_M:
                reason = "jump_point"
            if reason:
                reasons.add(reason)
                excluded += length
                if len(current) >= 2:
                    segments.append(tuple(current))
                current = [b]
                continue
            if length == 0:
                continue
            count = max(1, math.ceil(length / MAX_PIECE_M))
            points = (
                [a] + [_interpolate(a, b, i / count) for i in range(1, count)] + [b]
            )
            for start, end in zip(points, points[1:]):
                if abs(start.longitude - end.longitude) > 180:
                    first, second = _dateline(start, end)
                    current.append(first)
                    if len(current) >= 2:
                        segments.append(tuple(current))
                    current = [second, end]
                else:
                    current.append(end)
            valid += length
        if len(current) >= 2:
            segments.append(tuple(current))
    if len(route.segments) > 1:
        reasons.add("segment_break")
    return PreparedRoute(
        "available" if valid > 0 else "no_route",
        tuple(segments),
        valid if valid > 0 else None,
        tuple(sorted(reasons)),
        excluded,
    )


def input_fingerprint(route, indoor_inputs, catalog, boundary_package=None):
    identity_catalog = [
        {
            key: region[key]
            for key in (
                "id",
                "parentId",
                "level",
                "code",
                "codeNamespace",
                "countryCode",
            )
        }
        for region in sorted(catalog.regions.values(), key=lambda region: region["id"])
    ]
    data = {
        "route": {
            "status": route.status,
            "source": route.source,
            "crs": route.crs,
            "content": route.content_digest,
            "segments": [
                [asdict(point) for point in segment] for segment in route.segments
            ],
            "reasons": route.reasons,
        },
        "indoor": {
            key: indoor_inputs.get(key)
            for key in (
                "rawDetailDigest",
                "subtype",
                "explicitIndoor",
                "borrowed",
                "provider",
                "crsEvidenceVersion",
                "providerLocation",
            )
        },
        "catalog": {"version": catalog.version, "identities": identity_catalog},
        "boundaries": (
            {
                "version": boundary_package.version,
                "manifest": boundary_package.manifest_hash,
                "levels": sorted(boundary_package.layers),
            }
            if boundary_package
            else {"levels": [], "state": "boundary_unavailable"}
        ),
        "rules": {
            "version": RULES_VERSION,
            "maxSpeed": MAX_SPEED_MPS,
            "untimedJump": UNTIMED_JUMP_M,
            "maxPiece": MAX_PIECE_M,
            "buffer": BOUNDARY_BUFFER_M,
            "briefCrossing": BRIEF_CROSSING_M,
        },
    }
    return hashlib.sha256(
        json.dumps(
            data, sort_keys=True, separators=(",", ":"), allow_nan=False
        ).encode()
    ).hexdigest()


def is_current(summary, fingerprint):
    return bool(summary and summary.get("input_fingerprint") == fingerprint)
