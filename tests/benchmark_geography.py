import resource
import contextlib
import io
import json
import shutil
import sqlite3
import sys
import tempfile
import time
import tracemalloc
from pathlib import Path

sys.path[:0] = [
    str(Path.cwd() / "run_page"),
    str(Path.cwd() / "tests"),
    str(Path.cwd()),
]
from run_page.geography_backfill import main  # noqa: E402
from test_geography_repository import create_legacy  # noqa: E402
from test_geography_attribution import AttributionTest  # noqa: E402
from run_page.geography.boundaries import activate_package  # noqa: E402
from run_page.geography.catalog import load_catalog  # noqa: E402

test = AttributionTest()
test.setUp()
tracemalloc.start()
start = time.perf_counter()
for _ in range(20):
    result = test.calculate([(0, 0, 0), (0.02, 0, 1000), (0, 0, 2000)])
assert result["regions"]
algorithm_seconds = time.perf_counter() - start
_, peak = tracemalloc.get_traced_memory()
tracemalloc.stop()
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    root.chmod(0o700)
    database = root / "data.db"
    create_legacy(database)
    with sqlite3.connect(database) as c:
        row = c.execute("SELECT * FROM activities LIMIT 1").fetchone()
        c.executemany(
            "INSERT INTO activities VALUES (?,?,?,?,?,?,?,?)",
            [(i, *row[1:]) for i in range(1000, 1018)],
        )

    package = root / "package"
    shutil.copytree(Path("tests/fixtures/geography-boundaries"), package)
    activate_package(
        package, load_catalog(package / "catalog.json"), allow_synthetic=True
    )
    routes = root / "GPX_OUT"
    routes.mkdir()
    with sqlite3.connect(database) as connection:
        connection.execute("DELETE FROM joyrun_details")
        connection.execute("UPDATE activities SET name='synthetic GPX activity'")
        ids = [row[0] for row in connection.execute("SELECT run_id FROM activities")]
    for run_id in ids:
        (routes / f"{run_id}.gpx").write_text(
            '<gpx version="1.1" creator="synthetic"><trk><trkseg><trkpt lat="1.5" lon="1.5"><time>2026-01-01T00:00:00Z</time></trkpt><trkpt lat="1.5" lon="1.52"><time>2026-01-01T00:20:00Z</time></trkpt></trkseg></trk></gpx>'
        )

    def run():
        output = io.StringIO()
        start = time.perf_counter()
        with contextlib.redirect_stdout(output):
            code = main(
                [
                    "--database",
                    str(database),
                    "--apply",
                    "--limit",
                    "20",
                    "--boundaries",
                    str(package),
                    "--catalog",
                    str(package / "catalog.json"),
                    "--allow-synthetic",
                ]
            )
        assert code == 0
        return time.perf_counter() - start, json.loads(output.getvalue())["counts"]

    first, c1 = run()
    assert c1["complete"] == 20
    second, c2 = run()
    assert c2["skipped"] == 20
print(
    json.dumps(
        dict(
            processPeakRssMiB=round(
                resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
                / (1024**2 if sys.platform == "darwin" else 1024),
                3,
            ),
            algorithmActivities=20,
            algorithmSeconds=round(algorithm_seconds, 3),
            pythonAllocationPeakMiB=round(peak / 1024**2, 3),
            batchActivities=20,
            firstApplySeconds=round(first, 3),
            firstCounts=c1,
            secondApplySeconds=round(second, 3),
            secondCounts=c2,
        )
    )
)
