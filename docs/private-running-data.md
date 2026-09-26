# Private running history

The Python pipeline remains the only writer of running history. Its source
database and original tracks live outside this public Git checkout. The site
continues to build from reviewed `src/static/activities.json` and `assets/*.svg`.
RunAgent should later consume a separate, read-only export rather than opening
the source database.

## Local source directory

Set `RUNNING_DATA_DIR` to an existing directory outside the repository. Its
layout is:

```text
RUNNING_DATA_DIR/
├── data.db
├── GPX_OUT/
├── TCX_OUT/
├── FIT_OUT/
├── activities/
└── Workouts/
```

For the initial local migration, the existing database and GPX files were
copied to `$HOME/work/watson-running-data` and verified file by file with
SHA-256. A private `baseline-2026-09-26.json` records the initial counts and
checksums. The original checkout files were retained locally. At the baseline,
the database and published JSON both contained 994 activities through
2026-08-29. There are 986 GPX tracks; the eight activities without GPX are
indoor treadmill runs.

Set the directory in the shell before running Python data commands:

```bash
export RUNNING_DATA_DIR="$HOME/work/watson-running-data"
export IGNORE_START_END_RANGE=500
```

`run_page/config.py` redirects the database, original tracks and import log
to this directory. Generated website JSON remains in `src/static/`. JoyRun
sync refuses to run without an existing private database and GPX directory
outside the repository. It also requires at least 500 metres of route travel
to be clipped from each end when the route is long enough. Routes with less than
about 1 km of recorded path remain unchanged, including their original start
and end points. Review the generated routes before publishing; this policy does
not hide every sensitive location.

The private database keeps source routes. Indoor classification uses those
routes before any public clipping; JSON and SVG generation apply the privacy
filter to their own output without writing clipped or synthetic routes back
to the database. A second generation run should leave the database unchanged.
When using this private directory, both JSON and database-backed SVG generation
require `IGNORE_START_END_RANGE` of at least 500 metres.

Keep an independent encrypted or off-device backup of the private directory.
The copy in the Git checkout is only a temporary local baseline, not a backup
strategy.

## Publishing boundary

The source database and original GPX/TCX/FIT files are ignored and removed
from Git tracking in the current branch. Existing Git history still contains
earlier raw data; removing them from the latest tree does not erase that
history. A history rewrite would be a separate, reviewed operation.

The old `Run Data Sync` workflow is paused. It had no JoyRun download step and
would create or use a source database inside an ephemeral public checkout.
Resume scheduled ingestion only after private storage, credential handling,
privacy checks and publish validation are implemented together. GitHub Pages
can still build the committed static JSON through its separate workflow.

For each future publish, verify activity count, newest date, source IDs,
sport-type distribution, changed tracks and generated assets. Stage only
reviewed public outputs. A successful build or scheduled job is not evidence
that JoyRun supplied new activities or that Vercel deployed them.
