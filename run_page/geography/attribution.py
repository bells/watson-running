"""Exclusive geodesic region lengths; topology is evaluated in local metres."""

import math
from functools import lru_cache

from pyproj import CRS, Geod, Transformer
from shapely import transform
from shapely.affinity import translate
from shapely.geometry import LineString, box
from shapely.ops import unary_union

from .catalog import LEVELS
from .rules import BOUNDARY_BUFFER_M, BRIEF_CROSSING_M, RULES_VERSION, _interpolate

GEOD = Geod(ellps="WGS84")


@lru_cache(maxsize=512)
def _transformer(latitude, longitude):
    crs = CRS.from_proj4(
        f"+proj=aeqd +lat_0={latitude} +lon_0={longitude} +datum=WGS84 +units=m"
    )
    return Transformer.from_crs("EPSG:4326", crs, always_xy=True)


def _parameters(geometry, line):
    if geometry.is_empty:
        return []
    if hasattr(geometry, "geoms"):
        return [value for child in geometry.geoms for value in _parameters(child, line)]
    return [
        max(0.0, min(1.0, line.project(point) / line.length))
        for point in _points(geometry)
    ]


def _points(geometry):
    from shapely.geometry import Point

    return [Point(coordinate) for coordinate in geometry.coords]


def _piece(a, b, package, catalog):
    center = _interpolate(a, b, 0.5)
    transformer = _transformer(round(center.latitude, 1), round(center.longitude, 1))
    line = transform(
        LineString([(a.longitude, a.latitude), (b.longitude, b.latitude)]),
        transformer.transform,
        interleaved=False,
    )
    if line.length <= 1e-8:
        return []
    margin_lat = 200 / 110000
    margin_lon = margin_lat / max(0.00001, math.cos(math.radians(center.latitude)))
    window = box(
        min(a.longitude, b.longitude) - margin_lon,
        min(a.latitude, b.latitude) - margin_lat,
        max(a.longitude, b.longitude) + margin_lon,
        max(a.latitude, b.latitude) + margin_lat,
    )
    shapes = {}
    thresholds = {0.0, 1.0}
    for level, layer in package.layers.items():
        shapes[level] = []
        candidates = {}
        for offset in (-360, 0, 360):
            for region_id, polygon in layer.candidates(translate(window, xoff=-offset)):
                candidates.setdefault(region_id, []).append(
                    translate(polygon, xoff=offset)
                )
        for region_id, polygons in sorted(candidates.items()):
            polygon = unary_union(polygons)
            local = transform(
                polygon.intersection(window), transformer.transform, interleaved=False
            )
            boundary = transform(
                polygon.boundary.intersection(window),
                transformer.transform,
                interleaved=False,
            )
            buffered = boundary.buffer(BOUNDARY_BUFFER_M)
            shapes[level].append((region_id, local, buffered))
            thresholds.update(_parameters(local.intersection(line), line))
            thresholds.update(_parameters(buffered.intersection(line), line))
    intervals = []
    ordered = sorted(thresholds)
    for start, end in zip(ordered, ordered[1:]):
        if end - start <= 1e-10:
            continue
        midpoint = line.interpolate((start + end) * line.length / 2)
        assignments = {}
        owners = {}
        for level in LEVELS:
            if level not in package.layers:
                assignments[level] = (None, "uncovered", "boundary_unavailable")
                continue
            candidates = shapes[level]
            hits = [
                region_id
                for region_id, polygon, _ in candidates
                if polygon.covers(midpoint)
            ]
            owners[level] = hits[0] if len(hits) == 1 else None
            near = any(buffered.covers(midpoint) for _, _, buffered in candidates)
            if len(hits) > 1:
                assignments[level] = (None, "uncertain", "overlap")
            elif near:
                assignments[level] = (None, "uncertain", "near_boundary")
            elif len(hits) == 1:
                assignments[level] = (hits[0], "trusted", None)
            else:
                assignments[level] = (None, "uncovered", "coverage_gap")
        country_id = assignments["country"][0]
        if country_id and catalog.regions[country_id]["countryCode"] != "CHN":
            for level in LEVELS[1:]:
                assignments[level] = (None, "uncovered", "out_of_scope")
        _enforce_parents(assignments, catalog)
        left, right = _interpolate(a, b, start), _interpolate(a, b, end)
        length = GEOD.inv(
            left.longitude, left.latitude, right.longitude, right.latitude
        )[2]
        intervals.append(
            {"length": length, "assignments": assignments, "owners": owners}
        )
    return intervals


def _enforce_parents(assignments, catalog):
    for parent_level, level in zip(LEVELS, LEVELS[1:]):
        region_id, category, _ = assignments[level]
        if (
            category == "trusted"
            and catalog.regions[region_id]["parentId"] != assignments[parent_level][0]
        ):
            assignments[level] = (None, "uncertain", "parent_conflict")


def _brief_crossings(intervals, level):
    groups = []
    for index, interval in enumerate(intervals):
        region_id = interval.get("owners", {}).get(level)
        if groups and groups[-1]["id"] == region_id:
            groups[-1]["indices"].append(index)
            groups[-1]["length"] += interval["length"]
        else:
            groups.append(
                {"id": region_id, "indices": [index], "length": interval["length"]}
            )
    for previous, current, following in zip(groups, groups[1:], groups[2:]):
        span = range(previous["indices"][-1] + 1, following["indices"][0])
        if (
            current["id"] is not None
            and previous["id"] is not None
            and previous["id"] == following["id"]
            and current["length"] < BRIEF_CROSSING_M
            and all(intervals[i]["assignments"][level][1] != "uncovered" for i in span)
        ):
            for index in current["indices"]:
                intervals[index]["assignments"][level] = (
                    None,
                    "uncertain",
                    "brief_crossing",
                )


def primary_chain(regions, catalog):
    primary = dict(countryId=None, provinceId=None, cityId=None)
    parent_id = None
    for level in LEVELS:
        candidates = [
            region
            for region in regions
            if region["level"] == level and region["parentId"] == parent_id
        ]
        if not candidates:
            break
        selected = min(
            candidates,
            key=lambda region: (-round(region["distanceM"], 6), region["id"]),
        )
        primary[f"{level}Id"] = selected["id"]
        parent_id = selected["id"]
    return primary


def validate_conservation(result):
    valid = result["validGpsDistanceM"]
    if valid is None:
        if result["regions"]:
            raise ValueError("unknown_distance_with_regions")
        if any(
            summary.get(key) is not None
            for summary in result["levels"].values()
            for key in ("trustedDistanceM", "uncertainDistanceM", "uncoveredDistanceM")
        ):
            raise ValueError("unknown_distance_with_known_coverage")
        return
    if not math.isfinite(valid) or valid < 0:
        raise ValueError("invalid_distance")
    tolerance = max(1, valid * 0.0001)
    seen = set()
    for region in result["regions"]:
        if (
            region["id"] in seen
            or region["level"] not in LEVELS
            or not math.isfinite(region["distanceM"])
            or region["distanceM"] <= 0
        ):
            raise ValueError("invalid_region_distance")
        seen.add(region["id"])
    for level in LEVELS:
        summary = result["levels"][level]
        values = [
            summary[key]
            for key in ("trustedDistanceM", "uncertainDistanceM", "uncoveredDistanceM")
        ]
        if (
            any(
                value is None or not math.isfinite(value) or value < 0
                for value in values
            )
            or abs(sum(values) - valid) > tolerance
        ):
            raise ValueError("distance_conservation_failed")
        region_total = sum(
            region["distanceM"]
            for region in result["regions"]
            if region["level"] == level
        )
        if abs(region_total - summary["trustedDistanceM"]) > tolerance:
            raise ValueError("region_conservation_failed")


def attribute_route(prepared, package, catalog, provider):
    result = {
        "schemaVersion": 1,
        "status": prepared.status,
        "source": "private_route",
        "versions": {
            "catalog": catalog.version,
            "boundaries": package.version if package else "unavailable",
            "rules": RULES_VERSION,
        },
        "provider": provider,
        "primary": dict(countryId=None, provinceId=None, cityId=None),
        "validGpsDistanceM": prepared.valid_distance_m,
        "levels": {},
        "regions": [],
    }
    if prepared.status != "available":
        for level in LEVELS:
            result["levels"][level] = dict(
                status="unavailable",
                trustedDistanceM=None,
                uncertainDistanceM=None,
                uncoveredDistanceM=None,
                reasons=list(prepared.reasons),
            )
        return result
    totals = {
        level: dict(
            trustedDistanceM=0.0, uncertainDistanceM=0.0, uncoveredDistanceM=0.0
        )
        for level in LEVELS
    }
    reasons = {level: set() for level in LEVELS}
    region_totals = {}
    intervals = []
    if package:
        for segment in prepared.segments:
            current = [
                interval
                for a, b in zip(segment, segment[1:])
                for interval in _piece(a, b, package, catalog)
            ]
            for level in LEVELS:
                _brief_crossings(current, level)
            for interval in current:
                _enforce_parents(interval["assignments"], catalog)
            intervals.extend(current)
    else:
        intervals = [
            {
                "length": prepared.valid_distance_m,
                "assignments": {
                    level: (None, "uncovered", "boundary_unavailable")
                    for level in LEVELS
                },
            }
        ]
    for interval in intervals:
        for level, (region_id, category, reason) in interval["assignments"].items():
            key = {
                "trusted": "trustedDistanceM",
                "uncertain": "uncertainDistanceM",
                "uncovered": "uncoveredDistanceM",
            }[category]
            totals[level][key] += interval["length"]
            if reason:
                reasons[level].add(reason)
            if region_id:
                region_totals[region_id] = (
                    region_totals.get(region_id, 0.0) + interval["length"]
                )
    for region_id, distance in sorted(
        region_totals.items(),
        key=lambda item: (LEVELS.index(catalog.regions[item[0]]["level"]), item[0]),
    ):
        region = catalog.regions[region_id]
        result["regions"].append(
            dict(
                id=region_id,
                level=region["level"],
                name=region["name"],
                parentId=region["parentId"],
                distanceM=distance,
            )
        )
    for level in LEVELS:
        summary = totals[level]
        if not reasons[level]:
            status = "complete"
        elif summary["trustedDistanceM"] > 0 or summary["uncertainDistanceM"] > 0:
            status = "partial"
        elif reasons[level] == {"out_of_scope"}:
            status = "out_of_scope"
        elif "boundary_unavailable" in reasons[level]:
            status = "boundary_unavailable"
        else:
            status = "partial"
        result["levels"][level] = {
            "status": status,
            **summary,
            "reasons": sorted(reasons[level]),
        }
    result["primary"] = primary_chain(result["regions"], catalog)
    result["status"] = (
        "complete"
        if all(result["levels"][level]["status"] == "complete" for level in LEVELS)
        else ("boundary_unavailable" if not package else "partial")
    )
    validate_conservation(result)
    return result
