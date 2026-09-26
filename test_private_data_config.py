import os
import runpy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from run_page.private_data import validate_joyrun_export

ROOT = Path(__file__).resolve().parent
CONFIG = ROOT / "run_page" / "config.py"


class PrivateDataConfigTests(unittest.TestCase):
    def test_private_source_keeps_public_export_in_checkout(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, {"RUNNING_DATA_DIR": directory}):
                config = runpy.run_path(str(CONFIG))

            source = Path(directory).resolve()
            self.assertEqual(config["SQL_FILE"], str(source / "data.db"))
            self.assertEqual(config["GPX_FOLDER"], str(source / "GPX_OUT"))
            self.assertEqual(config["SYNCED_FILE"], str(source / "imported.json"))
            self.assertEqual(
                config["JSON_FILE"], str(ROOT / "src" / "static" / "activities.json")
            )

    def test_legacy_default_is_available_for_isolated_import_tests(self):
        with patch.dict(os.environ, {}, clear=True):
            config = runpy.run_path(str(CONFIG))

        self.assertEqual(config["SQL_FILE"], str(ROOT / "run_page" / "data.db"))

    def test_joyrun_requires_private_source_and_public_route_clipping(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory).resolve()
            (source / "data.db").touch()
            (source / "GPX_OUT").mkdir()

            self.assertEqual(
                validate_joyrun_export(str(source), ROOT, "500", None), source
            )
            with self.assertRaisesRegex(ValueError, "at least 500"):
                validate_joyrun_export(str(source), ROOT, "499", None)
            with self.assertRaisesRegex(ValueError, "IGNORE_BEFORE_SAVING"):
                validate_joyrun_export(str(source), ROOT, "500", "False")
            with self.assertRaisesRegex(ValueError, "outside the public repository"):
                validate_joyrun_export(str(source), source.parent, "500", None)

        with self.assertRaisesRegex(ValueError, "Set RUNNING_DATA_DIR"):
            validate_joyrun_export(None, ROOT, "500", None)


if __name__ == "__main__":
    unittest.main()
