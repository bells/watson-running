"""Keep pip, uv and PDM dependency entry points consistent without installing them."""

import re
import tomllib
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def dependency_map(requirements):
    dependencies = {}
    for requirement in requirements:
        name = re.match(r"[A-Za-z0-9_.-]+", requirement).group()
        normalized_name = re.sub(r"[-_.]+", "-", name).lower()
        dependencies[normalized_name] = re.sub(r"\s+", "", requirement[len(name) :])
    return dependencies


class DependencyContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        project = tomllib.loads((ROOT / "pyproject.toml").read_text())
        cls.declarations = dependency_map(project["project"]["dependencies"])
        cls.locks = {
            name: tomllib.loads((ROOT / name).read_text())["package"]
            for name in ("uv.lock", "pdm.lock")
        }

    def test_pip_mirrors_project_runtime_dependencies(self):
        requirements = [
            line.strip()
            for line in (ROOT / "requirements.txt").read_text().splitlines()
            if line.strip() and not line.lstrip().startswith("#")
        ]
        self.assertEqual(self.declarations, dependency_map(requirements))

    def test_direct_pins_match_both_locks(self):
        for name, constraint in self.declarations.items():
            pin = re.match(r"==([^;]+)", constraint)
            if pin is None:
                continue
            for lock_name, packages in self.locks.items():
                with self.subTest(package=name, lock=lock_name):
                    versions = {
                        package["version"]
                        for package in packages
                        if package["name"] == name
                    }
                    self.assertEqual({pin.group(1)}, versions)

    def test_oauthlib_security_floor_in_both_locks(self):
        self.assertEqual(
            ">=4.0.0,<5",
            self.declarations["oauthlib"],
        )
        for lock_name, packages in self.locks.items():
            with self.subTest(lock=lock_name):
                versions = [
                    package["version"]
                    for package in packages
                    if package["name"] == "oauthlib"
                ]
                self.assertTrue(versions)
                for version in versions:
                    self.assertEqual(4, int(version.split(".")[0]))


if __name__ == "__main__":
    unittest.main()
