"""Consumer validation and aggregation of the coordinate-free public contract."""

import math

from .catalog import LEVELS, load_catalog, parse_provider_location
from .export import validate_public_result

CATALOG = load_catalog()


def read_public_geography(value):
    if not isinstance(value, dict):
        return None
    try:
        if (
            type(value["schemaVersion"]) is not int
            or value["schemaVersion"] != 1
            or value["source"] != "private_route"
        ):
            return None
        if set(value["levels"]) != set(LEVELS) or set(value["versions"]) != {
            "catalog",
            "boundaries",
            "rules",
        }:
            return None
        provider = value["provider"]
        if provider["source"] not in (None, "provider", "catalog_inferred") or (
            (provider["source"] is None) != (provider["countryId"] is None)
        ):
            return None
        parent = None
        for level in LEVELS:
            region_id = provider[f"{level}Id"]
            if region_id is not None:
                entry = CATALOG.regions[region_id]
                if entry["level"] != level or entry["parentId"] != parent:
                    return None
            parent = region_id
        seen = set()
        for region in value["regions"]:
            known = CATALOG.regions[region["id"]]
            length = region["distanceM"]
            if (
                region["id"] in seen
                or any(region[key] != known[key] for key in ("level", "parentId"))
                or not isinstance(region["name"], str)
                or not region["name"].strip()
            ):
                return None
            if (
                isinstance(length, bool)
                or not isinstance(length, (int, float))
                or not math.isfinite(length)
                or length <= 0
            ):
                return None
            seen.add(region["id"])
        valid = value["validGpsDistanceM"]
        if valid is None and seen:
            return None
        if valid is not None and (
            isinstance(valid, bool)
            or not isinstance(valid, (int, float))
            or not math.isfinite(valid)
            or valid < 0
        ):
            return None
        tolerance = max(1, valid * 0.0001) if valid is not None else 1
        for parent in value["regions"]:
            if (
                sum(
                    child["distanceM"]
                    for child in value["regions"]
                    if child["parentId"] == parent["id"]
                )
                > parent["distanceM"] + tolerance
            ):
                return None
        for summary in value["levels"].values():
            for key in ("trustedDistanceM", "uncertainDistanceM", "uncoveredDistanceM"):
                length = summary[key]
                if valid is None:
                    if length is not None:
                        return None
                elif (
                    isinstance(length, bool)
                    or not isinstance(length, (int, float))
                    or not math.isfinite(length)
                    or length < 0
                ):
                    return None
            if summary["status"] == "complete" and (
                valid is None
                or summary["uncertainDistanceM"] > tolerance
                or summary["uncoveredDistanceM"] > tolerance
            ):
                return None
            if (
                summary["status"]
                in ("unavailable", "out_of_scope", "boundary_unavailable")
                and (summary["trustedDistanceM"] or 0) > 0
            ):
                return None
        if value["status"] == "complete" and any(
            s["status"] != "complete" for s in value["levels"].values()
        ):
            return None
        validate_public_result(value, CATALOG)
        return value
    except (KeyError, TypeError, ValueError, AttributeError, OverflowError):
        return None


def activity_regions(activity, source, level):
    geography = read_public_geography(activity.geography)
    if source == "route":
        return (
            [r for r in geography["regions"] if r["level"] == level]
            if geography and geography["status"] in ("complete", "partial")
            else []
        )
    provider = (
        geography["provider"]
        if geography
        else parse_provider_location(activity.location_country, CATALOG)
    )
    region_id = provider[f"{level}Id"]
    if region_id is None:
        return []
    region = CATALOG.regions[region_id]
    return [
        dict(
            id=region_id,
            name=region["name"],
            parentId=region["parentId"],
            level=level,
            distanceM=activity.distance,
        )
    ]


def aggregate_regions(activities, source, level):
    rows = {}
    covered = 0
    for activity in activities:
        entries = activity_regions(activity, source, level)
        covered += bool(entries)
        for region in entries:
            old = rows.get(region["id"], dict(distanceM=0, activityCount=0))
            rows[region["id"]] = {
                **region,
                "distanceM": old["distanceM"] + region["distanceM"],
                "activityCount": old["activityCount"] + 1,
            }
    return dict(
        rows=sorted(rows.values(), key=lambda r: (-r["distanceM"], r["id"])),
        coveredActivities=covered,
        totalActivities=len(activities),
        unavailableActivities=len(activities) - covered,
    )
