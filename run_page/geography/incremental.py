"""Best-effort geography after committed provider facts; never implicitly migrate."""

import sqlite3
import uuid
from collections import Counter
from pathlib import Path

from .catalog import load_catalog
from .export import configured_package, unavailable_result
from .repository import (
    migrated,
    read_summary,
    replace_activity,
    start_batch,
    update_batch,
)
from .rules import RULES_VERSION, is_current
from .service import calculate_activity, load_activity_input, attach_detail_input


def sync_incremental(session):
    database = Path(session.bind.url.database)
    catalog = load_catalog()
    package = configured_package(database.parent, catalog)
    counts = Counter()
    connection = sqlite3.connect(database, timeout=0)
    try:
        connection.execute("PRAGMA foreign_keys=ON")
        if not migrated(connection):
            return {"not_migrated": 1}
        cursor = connection.execute("SELECT * FROM activities ORDER BY run_id")
        keys = [column[0] for column in cursor.description]
        activities = [dict(zip(keys, row)) for row in cursor.fetchall()]
        batch_id = str(uuid.uuid4())
        start_batch(
            connection,
            batch_id,
            dict(
                catalog=catalog.version,
                boundaries=package.version if package else "unavailable",
                rules=RULES_VERSION,
            ),
            {},
        )
        for activity in activities:
            activity = attach_detail_input(connection, activity)
            route, _, provider, fingerprint = load_activity_input(
                activity, database.parent, catalog, package
            )
            old = read_summary(connection, activity["run_id"])
            if is_current(old, fingerprint) and old["status"] != "error":
                counts["skipped"] += 1
                continue
            try:
                result, fingerprint, route = calculate_activity(
                    activity, database.parent, catalog, package
                )
            except Exception:
                result = unavailable_result(
                    "error",
                    provider,
                    dict(
                        catalog=catalog.version,
                        boundaries=package.version if package else "unavailable",
                        rules=RULES_VERSION,
                    ),
                    "calculation_error",
                )
            try:
                connection.execute("BEGIN IMMEDIATE")
                cursor = connection.execute(
                    "SELECT * FROM activities WHERE run_id=?", (activity["run_id"],)
                )
                fresh = dict(
                    zip([column[0] for column in cursor.description], cursor.fetchone())
                )
                fresh = attach_detail_input(connection, fresh)
                _, _, _, fresh_fingerprint = load_activity_input(
                    fresh, database.parent, catalog, package
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
                connection.commit()
                counts[result["status"]] += 1
            except (ValueError, sqlite3.Error):
                connection.rollback()
                # Old results remain private; the exporter detects the changed
                # fingerprint and refuses to publish old associations.
                counts["error"] += 1
        update_batch(
            connection,
            batch_id,
            dict(counts),
            "partial" if counts.get("error") else "complete",
        )
        return dict(sorted(counts.items()))
    finally:
        connection.close()
