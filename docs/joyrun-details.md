# JoyRun activity details

The JoyRun backfill reads `userRunList.aspx` and `Run/GetInfo.aspx`. The list
provides the activity ID, device source and calorie value. The detail response
provides cumulative kilometre nodes, step samples, heart rate, altitude,
pauses, and the original route. The private `joyrun_details` table in
`RUNNING_DATA_DIR/data.db` saves each list item and `runrecord` response so a
later RunAgent importer can revisit fields without another platform request.
The script deliberately excludes the response's session ID.

The public site contains a location-free subset:

- `src/static/activities.json` has optional `source`, `detail_available`,
  `calories_kcal`, `total_steps`, `average_cadence_spm`, and
  `average_stride_m` summary fields. Existing activity IDs and units remain.
- `public/activity-details/<run_id>.json` contains splits and timed heart
  rate, altitude, steps, cadence, and estimated stride samples. The small
  `public/activity-details/index.json` lists exported IDs. All URLs respect
  Vite's `BASE_URL`.

The private response also contains `content`, `nodeattach`, account IDs, and
other source fields. These are never copied to the public detail JSON. They
may include precise location and must stay outside the public checkout. A
RunAgent import should consume a reviewed read-only export rather than open
the private database or pass raw responses to an AI model.

`node` records cumulative distance and moving time, so consecutive entries
form each kilometre split. The first element of each `stepcontent` sample is
the step count. The second element approximately sums to activity distance;
the displayed stride is therefore labelled an estimate. The average stride
uses total distance divided by total steps. Source calorie values are divided
by 1000 to display kcal. Missing heart rate or altitude samples remain empty
at their original time index. Some older activities have no such samples.

To resume a backfill, set `RUNNING_DATA_DIR` and
`IGNORE_START_END_RANGE=500` for the current published route policy, then run:

```bash
.venv/bin/python run_page/joyrun_detail_sync.py --phone <phone>
```

The script prompts for an SMS code without echoing it, skips saved IDs, commits
each activity, retries temporary failures, and reports failures for another
run. It does not generate GPX or SVG. To rebuild public files from an already
populated private database:

```bash
.venv/bin/python run_page/joyrun_detail_sync.py --export-only --refresh-activities-json
```

Review the generated files before publishing. The old `activities.json`
consumer remains compatible; RunAgent v0.2 will see the new summary fields
when it reloads that file, but it does not yet consume per-activity detail
files.
