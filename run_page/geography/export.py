"""Construct public geography from explicit fields, never an ORM/raw JSON dump."""

import json
import os
import re
from pathlib import Path

from .attribution import validate_conservation
from .boundaries import BoundaryError, load_active_package
from .catalog import LEVELS, load_catalog, parse_provider_location
from .repository import read_summary
from .rules import is_current
from .service import load_activity_input, attach_detail_input

CONTRACT = json.loads(Path(__file__).with_name("contract.json").read_text())


def validate_public_result(result, catalog):
    if result["status"] not in CONTRACT["statuses"]:
        raise ValueError("invalid_public_status")
    if any(
        not isinstance(version, str)
        or not re.fullmatch(r"[A-Za-z0-9._-]{1,128}", version)
        for version in result["versions"].values()
    ):
        raise ValueError("invalid_public_version")
    for summary in result["levels"].values():
        if (
            summary["status"] not in CONTRACT["levelStatuses"]
            or not isinstance(summary["reasons"], list)
            or any(
                not isinstance(reason, str) or reason not in CONTRACT["reasons"]
                for reason in summary["reasons"]
            )
        ):
            raise ValueError("invalid_public_reason")
    by_id = {region["id"]: region for region in result["regions"]}
    parent_id = None
    for level in LEVELS:
        region_id = result["primary"][f"{level}Id"]
        if region_id is not None:
            if (
                region_id not in by_id
                or by_id[region_id]["level"] != level
                or by_id[region_id]["parentId"] != parent_id
            ):
                raise ValueError("invalid_primary_chain")
        parent_id = region_id
    for region in result["regions"]:
        if region["id"] not in catalog.regions or (
            region["parentId"] and region["parentId"] not in by_id
        ):
            raise ValueError("invalid_public_parent")
    if result["status"] not in ("complete", "partial") and (
        by_id or any(result["primary"].values())
    ):
        raise ValueError("failed_result_with_regions")
    validate_conservation(result)


def configured_package(private_root, catalog):
    directory = Path(
        os.getenv("GEOGRAPHY_BOUNDARIES_DIR")
        or Path(private_root) / "geography/boundaries/approved"
    )
    if not directory.is_dir():
        return None
    try:
        return load_active_package(directory, catalog)
    except (BoundaryError, OSError, ValueError):
        return None


def unavailable_result(status, provider, versions, reason):
    versions = {
        key: (
            value
            if isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9._-]{1,128}", value)
            else "unavailable"
        )
        for key, value in versions.items()
    }
    return dict(
        schemaVersion=1,
        status=status,
        source="private_route",
        versions=versions,
        provider=provider,
        primary=dict(countryId=None, provinceId=None, cityId=None),
        validGpsDistanceM=None,
        regions=[],
        levels={
            level: dict(
                status="unavailable",
                trustedDistanceM=None,
                uncertainDistanceM=None,
                uncoveredDistanceM=None,
                reasons=[reason],
            )
            for level in LEVELS
        },
    )


def export_geography(connection, activity, private_root, catalog=None, package=None):
    catalog = catalog or load_catalog()
    summary = read_summary(connection, activity["run_id"])
    if summary is None:
        return None
    provider = parse_provider_location(activity.get("location_country"), catalog)
    versions = dict(
        catalog=summary["catalog_version"],
        boundaries=summary["boundary_version"],
        rules=summary["rules_version"],
    )
    activity = attach_detail_input(connection, activity)
    _, _, _, fingerprint = load_activity_input(activity, private_root, catalog, package)
    if not is_current(summary, fingerprint):
        return unavailable_result("stale", provider, versions, "input_changed")
    status = summary["status"]
    if status == "error":
        return unavailable_result("error", provider, versions, "calculation_error")
    try:
        stored_levels = json.loads(summary["levels_json"])
        levels = {
            level: {
                key: stored_levels[level][key]
                for key in (
                    "status",
                    "trustedDistanceM",
                    "uncertainDistanceM",
                    "uncoveredDistanceM",
                    "reasons",
                )
            }
            for level in LEVELS
        }
        regions = []
        for region_id, distance in connection.execute(
            "SELECT region_id,distance_m FROM activity_regions WHERE run_id=?",
            (activity["run_id"],),
        ):
            region = catalog.regions[region_id]
            regions.append(
                dict(
                    id=region_id,
                    level=region["level"],
                    name=region["name"],
                    parentId=region["parentId"],
                    distanceM=distance,
                )
            )
        regions.sort(key=lambda region: (LEVELS.index(region["level"]), region["id"]))
        result = dict(
            schemaVersion=1,
            status=status,
            source="private_route",
            versions=versions,
            provider=provider,
            primary={f"{level}Id": summary[f"primary_{level}_id"] for level in LEVELS},
            validGpsDistanceM=summary["valid_gps_distance_m"],
            levels=levels,
            regions=regions,
        )
        validate_public_result(result, catalog)
        return result
    except (ValueError, KeyError, TypeError):
        return unavailable_result("error", provider, versions, "calculation_error")


def export_context(session):
    database = Path(session.bind.url.database)
    catalog = load_catalog()
    package = configured_package(database.parent, catalog)
    raw_connection = session.connection().connection.driver_connection
    return raw_connection, database.parent, catalog, package
