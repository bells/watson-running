"""Explicit schema migration and activity-level atomic geography persistence."""

import json
from contextlib import contextmanager
from datetime import datetime, timezone

from sqlalchemy.dialects import sqlite
from sqlalchemy.schema import CreateTable

from .attribution import validate_conservation
from .catalog import LEVELS

SCHEMA_VERSION = 1


def now():
    return datetime.now(timezone.utc).isoformat()


def encode(value):
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    )


@contextmanager
def transaction(connection):
    connection.execute("SAVEPOINT geography_activity")
    try:
        yield
        connection.execute("RELEASE SAVEPOINT geography_activity")
    except Exception:
        connection.execute("ROLLBACK TO SAVEPOINT geography_activity")
        connection.execute("RELEASE SAVEPOINT geography_activity")
        raise


def migrated(connection):
    exists = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='geography_schema'"
    ).fetchone()
    return bool(
        exists
        and connection.execute(
            "SELECT version FROM geography_schema WHERE version=?", (SCHEMA_VERSION,)
        ).fetchone()
    )


def migrate(connection, catalog):
    # Imported only by the explicit write path. Preview/export never imports
    # Generator or calls init_db, and no legacy activity columns are altered.
    from generator.db import GEOGRAPHY_TABLES

    with transaction(connection):
        for table in GEOGRAPHY_TABLES:
            connection.execute(
                str(
                    CreateTable(table, if_not_exists=True).compile(
                        dialect=sqlite.dialect()
                    )
                )
            )
        versions = connection.execute("SELECT version FROM geography_schema").fetchall()
        if any(row[0] != SCHEMA_VERSION for row in versions):
            raise ValueError("unsupported_geography_schema")
        connection.execute(
            "INSERT OR IGNORE INTO geography_schema VALUES (?)", (SCHEMA_VERSION,)
        )
        for region in sorted(
            catalog.regions.values(),
            key=lambda value: (LEVELS.index(value["level"]), value["id"]),
        ):
            old = connection.execute(
                "SELECT country_code,level,code_namespace,code,parent_id FROM regions WHERE region_id=?",
                (region["id"],),
            ).fetchone()
            identity = tuple(
                region[key]
                for key in ("countryCode", "level", "codeNamespace", "code", "parentId")
            )
            if old and tuple(old) != identity:
                raise ValueError("catalog_identity_changed")
            connection.execute(
                "INSERT INTO regions VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(region_id) DO UPDATE SET name=excluded.name,catalog_version=excluded.catalog_version",
                (
                    region["id"],
                    region["countryCode"],
                    region["level"],
                    region["codeNamespace"],
                    region["code"],
                    region["name"],
                    region["parentId"],
                    catalog.version,
                ),
            )
        connection.execute("DELETE FROM region_aliases")
        for region in catalog.regions.values():
            for alias in sorted(set([region["name"], *region.get("aliases", [])])):
                connection.execute(
                    "INSERT INTO region_aliases VALUES (?,?,?,?,?)",
                    (
                        alias,
                        region["id"],
                        region["parentId"] or "",
                        "catalog",
                        catalog.version,
                    ),
                )


def start_batch(connection, batch_id, versions, backup):
    with transaction(connection):
        old = connection.execute(
            "SELECT versions_json FROM geography_runs WHERE batch_id=?", (batch_id,)
        ).fetchone()
        if old and old[0] != encode(versions):
            raise ValueError("batch_version_changed")
        stamp = now()
        connection.execute(
            "INSERT OR IGNORE INTO geography_runs VALUES (?,?,?,?,?,?,?)",
            (
                batch_id,
                "running",
                encode(versions),
                encode({}),
                encode(backup),
                stamp,
                stamp,
            ),
        )
        connection.execute(
            "UPDATE geography_runs SET status='running',updated_at=? WHERE batch_id=?",
            (stamp, batch_id),
        )


def update_batch(connection, batch_id, counts, status="running"):
    with transaction(connection):
        connection.execute(
            "UPDATE geography_runs SET counts_json=?,status=?,updated_at=? WHERE batch_id=?",
            (encode(counts), status, now(), batch_id),
        )


def read_summary(connection, activity_id):
    if not migrated(connection):
        return None
    cursor = connection.execute(
        "SELECT * FROM activity_region_summaries WHERE run_id=?", (activity_id,)
    )
    row = cursor.fetchone()
    return dict(zip([column[0] for column in cursor.description], row)) if row else None


def replace_activity(
    connection, activity_id, result, fingerprint, batch_id, source, crs
):
    validate_conservation(result)
    if result["status"] in ("stale", "error") and result["regions"]:
        raise ValueError("failed_result_with_regions")
    versions = result["versions"]
    primary = result["primary"]
    with transaction(connection):
        connection.execute(
            "DELETE FROM activity_regions WHERE run_id=?", (activity_id,)
        )
        connection.execute(
            "DELETE FROM activity_region_summaries WHERE run_id=?", (activity_id,)
        )
        connection.execute(
            "INSERT INTO activity_region_summaries (run_id,provider_json,primary_country_id,primary_province_id,primary_city_id,status,levels_json,valid_gps_distance_m,input_fingerprint,route_source,route_crs,catalog_version,boundary_version,rules_version,batch_id,error_code,calculated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                activity_id,
                encode(result["provider"]),
                primary["countryId"],
                primary["provinceId"],
                primary["cityId"],
                result["status"],
                encode(result["levels"]),
                result["validGpsDistanceM"],
                fingerprint,
                source,
                crs,
                versions["catalog"],
                versions["boundaries"],
                versions["rules"],
                batch_id,
                "calculation_error" if result["status"] == "error" else None,
                now(),
            ),
        )
        for region in result["regions"]:
            connection.execute(
                "INSERT INTO activity_regions VALUES (?,?,?)",
                (activity_id, region["id"], region["distanceM"]),
            )
