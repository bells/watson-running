"""Exercise the portable entry point without a real JoyRun login."""

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


class JoyrunScriptTest(unittest.TestCase):
    def test_entry_point_from_other_directory_and_empty_phone(self):
        script = Path(__file__).resolve().parents[1] / "joyrunSync.sh"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            interpreter = root / "fake-python"
            result = root / "result.json"
            interpreter.write_text(
                "#!/usr/bin/env python3\n"
                "import json, os, sys\n"
                "from pathlib import Path\n"
                "Path(os.environ['JOYRUN_TEST_RESULT']).write_text(json.dumps({"
                "'argv': sys.argv[1:], 'cwd': os.getcwd(), "
                "'range': os.environ['IGNORE_START_END_RANGE'], "
                "'before': os.environ.get('IGNORE_BEFORE_SAVING'), "
                "'root': os.environ['RUNNING_DATA_DIR']}))\n"
            )
            interpreter.chmod(0o700)
            env = {
                **os.environ,
                "JOYRUN_PYTHON": str(interpreter),
                "JOYRUN_TEST_RESULT": str(result),
                "JOYRUN_PHONE": "synthetic-phone",
                "RUNNING_DATA_DIR": str(root),
                "IGNORE_START_END_RANGE": "500",
                "IGNORE_BEFORE_SAVING": "2000",
            }
            completed = subprocess.run(
                [str(script)], cwd=root, env=env, capture_output=True, text=True
            )
            self.assertEqual(0, completed.returncode, completed.stderr)
            output = json.loads(result.read_text())
            self.assertEqual(str(script.parent), output["cwd"])
            self.assertEqual(str(root), output["root"])
            self.assertEqual("500", output["range"])
            self.assertIsNone(output["before"])
            self.assertEqual(
                [
                    "run_page/joyrun_sync.py",
                    "--phone",
                    "synthetic-phone",
                    "--with-gpx",
                    "--athlete",
                    "watson",
                ],
                output["argv"],
            )
            result.unlink()
            env["JOYRUN_PHONE"] = ""
            completed = subprocess.run(
                [str(script)],
                cwd=root,
                env=env,
                input="\n",
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(0, completed.returncode)
            self.assertFalse(result.exists())


if __name__ == "__main__":
    unittest.main()
