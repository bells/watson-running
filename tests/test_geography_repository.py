import contextlib
import copy
import io
import json
import shutil
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "run_page"))

from run_page.geography import repository  # noqa: E402
from run_page.geography.catalog import load_catalog  # noqa: E402
from run_page.geography.safety import (
    digest,
    preview_connection,
    snapshot,
    write_lock,
)  # noqa: E402
from run_page.geography.service import calculate_activity  # noqa: E402
from run_page.geography_backfill import main  # noqa: E402


def create_legacy(path):
    connection = sqlite3.connect(path)
    connection.execute(
        "CREATE TABLE activities (run_id INTEGER PRIMARY KEY,name TEXT,distance REAL,subtype TEXT,location_country TEXT,summary_polyline TEXT,start_date_local TEXT,type TEXT)"
    )
    connection.execute(
        "CREATE TABLE joyrun_details (run_id INTEGER PRIMARY KEY,raw_detail_json TEXT)"
    )
    connection.executemany(
        "INSERT INTO activities VALUES (?,?,?,?,?,?,?,?)",
        [
            (
                i,
                "run from joyrun",
                21100,
                "Run",
                "深圳:广东",
                "???gE",
                "2026-01-01 08:00:00",
                "Run",
            )
            for i in (101, 102)
        ],
    )
    connection.execute(
        "INSERT INTO joyrun_details VALUES (101,?)", ('{"synthetic":"raw"}',)
    )
    connection.commit()
    connection.close()
    path.chmod(0o600)


def facts(connection):
    return {
        table: connection.execute(f"SELECT * FROM {table} ORDER BY run_id").fetchall()
        for table in ("activities", "joyrun_details")
    }


class GeographyRepositoryTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.root.chmod(0o700)
        self.database = self.root / "data.db"
        create_legacy(self.database)
        self.catalog = load_catalog()

    def cli(self, *args):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            status = main(["--database", str(self.database), *args])
        return status, json.loads(output.getvalue())

    def test_migration_preserves_all_activity_facts_and_raw_details(self):
        connection = sqlite3.connect(self.database)
        before = facts(connection)
        self.assertFalse(repository.migrated(connection))
        self.assertIsNone(repository.read_summary(connection, 101))
        repository.migrate(connection, self.catalog)
        self.assertTrue(repository.migrated(connection))
        self.assertEqual(before, facts(connection))
        connection.close()

    def test_atomic_replace_rolls_back_on_summary_or_relation_failure(self):
        connection = sqlite3.connect(self.database)
        connection.execute("PRAGMA foreign_keys=ON")
        repository.migrate(connection, self.catalog)
        repository.start_batch(connection, "test", {}, {})
        activity = dict(
            run_id=101,
            name="joyrun",
            summary_polyline="",
            subtype="Run",
            location_country="深圳:广东",
        )
        result, fingerprint, route = calculate_activity(
            activity, self.root, self.catalog, None
        )
        repository.replace_activity(
            connection, 101, result, fingerprint, "test", route.source, route.crs
        )
        original = repository.read_summary(connection, 101)
        bad = copy.deepcopy(result)
        bad["primary"]["cityId"] = "missing-region"
        with self.assertRaises(sqlite3.IntegrityError):
            repository.replace_activity(
                connection, 101, bad, "new", "test", route.source, route.crs
            )
        self.assertEqual(original, repository.read_summary(connection, 101))
        connection.execute(
            "CREATE TRIGGER reject_regions BEFORE INSERT ON activity_regions BEGIN SELECT RAISE(ABORT,'synthetic failure'); END"
        )
        bad = copy.deepcopy(result)
        bad.update(status="complete", validGpsDistanceM=10)
        bad["regions"] = [dict(id="country:CHN", level="country", distanceM=10)]
        bad["levels"] = {
            level: dict(
                trustedDistanceM=10 if level == "country" else 0,
                uncertainDistanceM=0,
                uncoveredDistanceM=0 if level == "country" else 10,
            )
            for level in ("country", "province", "city")
        }
        with self.assertRaises(sqlite3.IntegrityError):
            repository.replace_activity(
                connection, 101, bad, "new", "test", route.source, route.crs
            )
        self.assertEqual(original, repository.read_summary(connection, 101))
        connection.close()

    def test_default_preview_hash_sidecars_and_public_assets_unchanged(self):
        before = snapshot(self.database)
        files = sorted(str(p.relative_to(self.root)) for p in self.root.rglob("*"))
        status, report = self.cli("--limit", "1", "--id", "101")
        self.assertEqual(status, 0)
        self.assertEqual(report["mode"], "dry-run")
        self.assertEqual(report["counts"]["selected"], 1)
        self.assertEqual(before, snapshot(self.database))
        self.assertEqual(
            files, sorted(str(p.relative_to(self.root)) for p in self.root.rglob("*"))
        )
        self.assertFalse(any(self.root.rglob("*.svg")))

    def test_wal_and_concurrent_change_preview_refused(self):
        connection = sqlite3.connect(self.database)
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("UPDATE activities SET distance=42 WHERE run_id=101")
        connection.commit()
        before = snapshot(self.database)
        status, report = self.cli()
        self.assertEqual(status, 1)
        self.assertFalse(report["available"])
        self.assertEqual(before, snapshot(self.database))
        connection.close()
        with self.assertRaisesRegex(ValueError, "preview_input_changed"):
            with preview_connection(self.database):
                with sqlite3.connect(self.database) as writer:
                    writer.execute("UPDATE activities SET distance=43 WHERE run_id=101")

    def test_apply_permissions_competing_writers_and_backup_failure(self):
        before = digest(self.database)
        self.root.chmod(0o755)
        self.assertEqual(self.cli("--apply")[0], 1)
        self.root.chmod(0o700)
        with write_lock(self.root):
            self.assertEqual(self.cli("--apply")[0], 1)
        writer = sqlite3.connect(self.database)
        writer.execute("BEGIN IMMEDIATE")
        self.assertEqual(self.cli("--apply")[0], 1)
        writer.close()
        with patch(
            "run_page.geography_backfill.backup_database",
            side_effect=OSError("synthetic failure"),
        ):
            self.assertEqual(self.cli("--apply")[0], 1)
        self.assertEqual(before, digest(self.database))

    def test_repository_path_is_refused(self):
        from run_page.geography.safety import require_private_path, REPOSITORY_ROOT

        with tempfile.TemporaryDirectory(dir=REPOSITORY_ROOT) as directory:
            path = Path(directory) / "data.db"
            create_legacy(path)
            Path(directory).chmod(0o700)
            with self.assertRaisesRegex(ValueError, "database_must_be_private"):
                require_private_path(path)

    def test_failed_activity_persists_error_then_retry_succeeds(self):
        before = snapshot(self.database)
        with patch(
            "run_page.geography_backfill.calculate_activity",
            side_effect=RuntimeError("synthetic coordinate-free failure"),
        ):
            status, first = self.cli("--apply")
        self.assertEqual(status, 1)
        self.assertEqual(first["counts"]["error"], 2)
        with sqlite3.connect(self.database) as connection:
            self.assertEqual(
                repository.read_summary(connection, 101)["status"], "error"
            )
        status, retried = self.cli(
            "--apply", "--run-id", first["batchId"], "--retry-errors"
        )
        self.assertEqual(status, 0)
        self.assertEqual(retried["counts"]["unknown_crs"], 2)
        self.assertEqual(self.cli("--apply")[1]["counts"]["skipped"], 2)
        self.assertNotIn("fingerprint", json.dumps(retried))
        self.assertNotEqual(before, snapshot(self.database))

    def test_backup_idempotent_resume_force_and_restore(self):
        with sqlite3.connect(self.database) as connection:
            original = facts(connection)
        status, first = self.cli("--apply", "--limit", "1")
        self.assertEqual(status, 0)
        backup = next((self.root / "geography/backups").glob("*.db"))
        metadata = json.loads(Path(str(backup) + ".json").read_text())
        self.assertEqual(metadata["sha256"], digest(backup))
        with sqlite3.connect(backup) as connection:
            self.assertEqual(
                connection.execute("PRAGMA quick_check").fetchone(), ("ok",)
            )
        status, second = self.cli("--apply", "--run-id", first["batchId"])
        self.assertEqual(status, 0)
        self.assertEqual(second["counts"]["skipped"], 1)
        self.assertEqual(second["counts"]["selected"], 2)
        self.assertEqual(
            self.cli("--apply", "--force")[1]["counts"].get("skipped", 0), 0
        )
        with sqlite3.connect(self.database) as connection:
            self.assertEqual(original, facts(connection))
            self.assertEqual(
                connection.execute(
                    "SELECT COUNT(*) FROM activity_region_summaries"
                ).fetchone()[0],
                2,
            )
            connection.execute(
                "INSERT INTO activities VALUES (103,'after-backup',1,'Run','', '', '', 'Run')"
            )
            connection.commit()
        recovery = self.root / "before-restore.db"
        shutil.copy2(self.database, recovery)
        shutil.copy2(backup, self.database)
        with sqlite3.connect(self.database) as connection:
            self.assertEqual(original, facts(connection))
        with sqlite3.connect(recovery) as connection:
            self.assertEqual(
                connection.execute("SELECT COUNT(*) FROM activities").fetchone()[0], 3
            )


if __name__ == "__main__":
    unittest.main()
