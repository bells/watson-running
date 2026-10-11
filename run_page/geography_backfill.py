"""Offline region backfill. Default is immutable, read-only preview."""

import argparse
import json
import os
import re
import sqlite3
import sys
import uuid
from collections import Counter
from pathlib import Path
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from run_page.geography.boundaries import load_active_package  # noqa: E402
from run_page.geography.catalog import load_catalog  # noqa: E402
from run_page.geography.repository import (  # noqa: E402
    migrate,
    migrated,
    read_summary,
    replace_activity,
    start_batch,
    update_batch,
)
from run_page.geography.rules import RULES_VERSION, is_current  # noqa: E402
from run_page.geography.safety import (  # noqa: E402
    backup_database,
    preview_connection,
    require_private_path,
    write_lock,
)
from run_page.geography.service import (
    attach_detail_input,
    calculate_activity,
    load_activity_input,
)  # noqa: E402


def activities(connection):
    cursor = connection.execute("SELECT * FROM activities ORDER BY run_id")
    keys = [column[0] for column in cursor.description]
    return [dict(zip(keys, row)) for row in cursor.fetchall()]


def process(connection, root, catalog, package, args, batch_id=None):
    counts = Counter()
    selected = 0
    for activity in activities(connection):
        if args.id and activity["run_id"] not in args.id:
            continue
        activity = attach_detail_input(connection, activity)
        route, _, _, fingerprint = load_activity_input(activity, root, catalog, package)
        summary = read_summary(connection, activity["run_id"])
        current = is_current(summary, fingerprint)
        status = summary["status"] if current else ("stale" if summary else "pending")
        if args.status and status not in args.status:
            continue
        if args.retry_errors and status != "error":
            continue
        if selected >= args.limit:
            break
        selected += 1
        if current and summary["status"] != "error" and not args.force:
            counts["skipped"] += 1
            continue
        try:
            result, fingerprint, route = calculate_activity(
                activity, root, catalog, package
            )
        except Exception:
            from run_page.geography.export import unavailable_result
            from run_page.geography.catalog import parse_provider_location

            result = unavailable_result(
                "error",
                parse_provider_location(activity.get("location_country"), catalog),
                dict(
                    catalog=catalog.version,
                    boundaries=package.version if package else "unavailable",
                    rules=RULES_VERSION,
                ),
                "calculation_error",
            )
        if batch_id:
            connection.execute("BEGIN IMMEDIATE")
            try:
                cursor = connection.execute(
                    "SELECT * FROM activities WHERE run_id=?", (activity["run_id"],)
                )
                fresh = dict(
                    zip([column[0] for column in cursor.description], cursor.fetchone())
                )
                fresh = attach_detail_input(connection, fresh)
                _, _, _, fresh_fingerprint = load_activity_input(
                    fresh, root, catalog, package
                )
                if fresh_fingerprint != fingerprint:
                    raise ValueError("source_changed_during_apply")
                replace_activity(
                    connection,
                    activity["run_id"],
                    result,
                    fingerprint,
                    batch_id,
                    route.source,
                    route.crs,
                )
                pending_counts = counts.copy()
                pending_counts[result["status"]] += 1
                update_batch(connection, batch_id, dict(pending_counts))
                connection.commit()
                counts = pending_counts
            except Exception:
                connection.rollback()
                counts["error"] += 1
                failure = dict(result)
                failure.update(
                    status="error",
                    primary=dict(countryId=None, provinceId=None, cityId=None),
                    regions=[],
                    validGpsDistanceM=None,
                )
                failure["levels"] = {
                    level: dict(
                        status="unavailable",
                        trustedDistanceM=None,
                        uncertainDistanceM=None,
                        uncoveredDistanceM=None,
                        reasons=["calculation_error"],
                    )
                    for level in ("country", "province", "city")
                }
                connection.execute("BEGIN IMMEDIATE")
                replace_activity(
                    connection,
                    activity["run_id"],
                    failure,
                    fingerprint,
                    batch_id,
                    route.source,
                    route.crs,
                )
                update_batch(connection, batch_id, dict(counts))
                connection.commit()
        else:
            counts[result["status"]] += 1
    return {"selected": selected, **dict(sorted(counts.items()))}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", type=Path)
    parser.add_argument("--boundaries", type=Path)
    parser.add_argument("--catalog", type=Path)
    parser.add_argument("--allow-synthetic", action="store_true")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true")
    mode.add_argument("--apply", action="store_true")
    parser.add_argument("--id", type=int, action="append")
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--status", action="append")
    parser.add_argument("--run-id")
    parser.add_argument("--retry-errors", action="store_true")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args(argv)
    if args.limit < 0:
        parser.error("limit must be nonnegative")
    if args.run_id and not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", args.run_id):
        parser.error("invalid run id")
    database = args.database
    if database is None:
        root = os.getenv("RUNNING_DATA_DIR")
        if not root:
            parser.error("set RUNNING_DATA_DIR or provide --database")
        database = Path(root) / "data.db"
    try:
        catalog = load_catalog(args.catalog)
        package = (
            load_active_package(
                args.boundaries, catalog, allow_synthetic=args.allow_synthetic
            )
            if args.boundaries
            else None
        )
        if not args.apply:
            with preview_connection(database) as connection:
                counts = process(connection, database.parent, catalog, package, args)
            print(json.dumps({"mode": "dry-run", "counts": counts}, sort_keys=True))
            return 0
        database = require_private_path(database)
        os.umask(0o077)
        batch_id = args.run_id or str(uuid.uuid4())
        with write_lock(database.parent):
            connection = sqlite3.connect(database, timeout=0)
            try:
                connection.execute("PRAGMA foreign_keys=ON")
                connection.execute("BEGIN IMMEDIATE")
                backup_source = sqlite3.connect(
                    f"file:{quote(str(database), safe='/')}?mode=ro", uri=True
                )
                try:
                    backup = backup_database(backup_source, database)
                finally:
                    backup_source.close()
                if args.run_id and (
                    not migrated(connection)
                    or not connection.execute(
                        "SELECT 1 FROM geography_runs WHERE batch_id=?", (batch_id,)
                    ).fetchone()
                ):
                    raise ValueError("unknown_batch")
                migrate(connection, catalog)
                versions = {
                    "catalog": catalog.version,
                    "boundaries": package.version if package else "unavailable",
                    "rules": RULES_VERSION,
                }
                start_batch(connection, batch_id, versions, backup)
                connection.commit()
                counts = process(
                    connection, database.parent, catalog, package, args, batch_id
                )
                update_batch(
                    connection,
                    batch_id,
                    counts,
                    "partial" if counts.get("error") else "complete",
                )
            finally:
                connection.close()
        print(
            json.dumps(
                {"mode": "apply", "batchId": batch_id, "counts": counts}, sort_keys=True
            )
        )
        return 1 if counts.get("error") else 0
    except (ValueError, OSError, sqlite3.Error):
        print(
            json.dumps(
                {
                    "mode": "apply" if args.apply else "dry-run",
                    "available": False,
                    "reason": "maintenance_or_input_unavailable",
                }
            )
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
