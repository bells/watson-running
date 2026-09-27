"""Offline checks for credential output and private running data."""

import contextlib
import io
import os
import stat
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "run_page"))

from get_garmin_secret import write_secret  # noqa: E402
from joyrun_sync import parse_heart_rate_samples  # noqa: E402
from private_data import require_private_database  # noqa: E402


class SecurityBoundariesTest(unittest.TestCase):
    def test_garmin_credential_is_private_and_never_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / "garmin-secret"
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                write_secret("synthetic-secret", destination)
            self.assertEqual("", output.getvalue())
            self.assertEqual("synthetic-secret\n", destination.read_text())
            if os.name == "posix":
                self.assertEqual(0o600, stat.S_IMODE(destination.stat().st_mode))
            with self.assertRaises(FileExistsError):
                write_secret("new-secret", destination)
            self.assertEqual("synthetic-secret\n", destination.read_text())

    def test_garmin_credential_cannot_be_written_into_checkout(self):
        destination = Path(__file__).resolve().parent / "garmin-secret"
        with self.assertRaisesRegex(ValueError, "outside the public repository"):
            write_secret("synthetic-secret", destination)
        with tempfile.TemporaryDirectory() as directory:
            link = Path(directory) / "checkout"
            link.symlink_to(destination.parent, target_is_directory=True)
            with self.assertRaisesRegex(ValueError, "outside the public repository"):
                write_secret("synthetic-secret", link / "garmin-secret")

    def test_invalid_heart_rate_samples_are_not_logged(self):
        private_sample = "private-heart-rate-sample"
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            result = parse_heart_rate_samples(private_sample)
        self.assertIsNone(result)
        self.assertNotIn(private_sample, output.getvalue())
        self.assertEqual([120, 130], parse_heart_rate_samples("[120, 130]"))

    def test_private_detail_database_permissions(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            database = root / "data.db"
            database.touch(mode=0o600)
            if os.name == "posix":
                database.chmod(0o600)
            require_private_database(database, root)
            if os.name == "posix":
                database.chmod(0o644)
                with self.assertRaisesRegex(ValueError, "0600"):
                    require_private_database(database, root)
                database.chmod(0o600)
                root.chmod(0o755)
                with self.assertRaisesRegex(ValueError, "0700"):
                    require_private_database(database, root)


if __name__ == "__main__":
    unittest.main()
