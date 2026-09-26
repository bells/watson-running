"""Resumeable private JoyRun detail backfill and location-free public export."""

import argparse
import getpass
import json
import os
import random
import time
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from config import JSON_FILE, SQL_FILE
from generator import Generator
from generator.db import Activity, Base, JoyrunDetail
from joyrun_detail import normalize_joyrun_detail
from joyrun_sync import Joyrun
from private_data import validate_joyrun_export


PUBLIC_DIR = Path(__file__).resolve().parent.parent / "public/activity-details"
DETAIL_SUMMARY_KEYS = {
    "source",
    "detail_available",
    "calories_kcal",
    "total_steps",
    "average_cadence_spm",
    "average_stride_m",
}


def _json(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def save_detail(session, list_record, runrecord):
    detail = normalize_joyrun_detail(list_record, runrecord)
    row = session.get(JoyrunDetail, detail["run_id"]) or JoyrunDetail(
        run_id=detail["run_id"]
    )
    row.source = detail["source"]
    row.heartrate_source = detail["heart_rate_source"]
    row.calories_kcal = detail["calories_kcal"]
    row.total_steps = detail["total_steps"]
    row.sample_interval_seconds = detail["sample_interval_seconds"]
    row.moving_seconds = detail["moving_seconds"]
    row.elapsed_seconds = detail["elapsed_seconds"]
    row.average_cadence_spm = detail["average_cadence_spm"]
    row.average_stride_m = detail["average_stride_m"]
    row.min_heartrate = detail["min_heart_rate_bpm"]
    row.max_heartrate = detail["max_heart_rate_bpm"]
    row.average_heartrate = detail["average_heart_rate_bpm"]
    row.min_altitude_m = detail["min_altitude_m"]
    row.max_altitude_m = detail["max_altitude_m"]
    row.splits_json = _json(detail["splits"])
    row.step_samples_json = _json(runrecord.get("stepcontent"))
    row.heart_rate_samples_json = _json(runrecord.get("heartrate"))
    row.altitude_samples_json = _json(runrecord.get("altitude"))
    row.pause_json = _json(runrecord.get("pause"))
    row.raw_list_json = _json(list_record)
    row.raw_detail_json = _json(runrecord)
    row.fetched_at = datetime.now(timezone.utc).isoformat()
    session.add(row)
    session.commit()


def export_public(session, destination=PUBLIC_DIR):
    activity_ids = {run_id for (run_id,) in session.query(Activity.run_id)}
    exported_ids = []
    destination.mkdir(parents=True, exist_ok=True)
    for row in session.query(JoyrunDetail).yield_per(100):
        if row.run_id not in activity_ids:
            continue
        record = normalize_joyrun_detail(
            json.loads(row.raw_list_json), json.loads(row.raw_detail_json)
        )
        path = destination / f"{row.run_id}.json"
        temporary = path.with_suffix(".json.tmp")
        temporary.write_text(_json(record), encoding="utf-8")
        temporary.replace(path)
        exported_ids.append(row.run_id)
    manifest = destination / "index.json"
    temporary = destination / "index.json.tmp"
    temporary.write_text(
        _json({"schema_version": 1, "run_ids": sorted(exported_ids)}),
        encoding="utf-8",
    )
    temporary.replace(manifest)
    return len(exported_ids)


def export_activity_summaries():
    activities = Generator(SQL_FILE).load()
    destination = Path(JSON_FILE)
    if destination.exists():
        previous = json.loads(destination.read_text(encoding="utf-8"))
        assert_existing_activities_unchanged(previous, activities)
    temporary = destination.with_suffix(".json.tmp")
    temporary.write_text(_json(activities), encoding="utf-8")
    temporary.replace(destination)
    return len(activities)


def assert_existing_activities_unchanged(previous, current):
    old_by_id = {item["run_id"]: item for item in previous}
    new_by_id = {item["run_id"]: item for item in current}
    changed = [
        run_id
        for run_id in old_by_id.keys() | new_by_id.keys()
        if {
            key: value
            for key, value in old_by_id.get(run_id, {}).items()
            if key not in DETAIL_SUMMARY_KEYS
        }
        != {
            key: value
            for key, value in new_by_id.get(run_id, {}).items()
            if key not in DETAIL_SUMMARY_KEYS
        }
    ]
    if changed:
        raise ValueError(
            f"Refusing to change {len(changed)} existing activity records; "
            "check route clipping and source data before publishing"
        )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--phone", help="JoyRun phone number; code is prompted privately"
    )
    parser.add_argument("--export-only", action="store_true")
    parser.add_argument("--refresh-activities-json", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--delay", type=float, default=0.7)
    args = parser.parse_args()
    validate_joyrun_export(
        os.getenv("RUNNING_DATA_DIR"),
        Path(__file__).resolve().parent.parent,
        os.getenv("IGNORE_START_END_RANGE"),
        os.getenv("IGNORE_BEFORE_SAVING"),
    )
    engine = create_engine(f"sqlite:///{SQL_FILE}")
    Base.metadata.create_all(engine, tables=[JoyrunDetail.__table__])
    session = sessionmaker(bind=engine)()
    if args.export_only:
        print(f"Exported {export_public(session)} reviewed public details")
        if args.refresh_activities_json:
            print(f"Exported {export_activity_summaries()} activity summaries")
        return
    if not args.phone:
        parser.error("--phone is required for backfill")
    code = getpass.getpass("JoyRun SMS code: ")
    client = Joyrun(user_name=args.phone, identifying_code=code)
    del code
    client.login_by_phone()
    list_records = client.get_runs_records()
    existing = {run_id for (run_id,) in session.query(JoyrunDetail.run_id)}
    pending = [record for record in list_records if int(record["fid"]) not in existing]
    if args.limit:
        pending = pending[: args.limit]
    print(f"List {len(list_records)}; existing {len(existing)}; pending {len(pending)}")
    success = 0
    failures = []
    for index, record in enumerate(pending, 1):
        run_id = int(record["fid"])
        for attempt in range(3):
            try:
                response = client.get_single_run_record(run_id)
                save_detail(session, record, response["runrecord"])
                success += 1
                break
            except Exception as error:
                session.rollback()
                if attempt == 2:
                    failures.append((run_id, type(error).__name__))
                else:
                    time.sleep(2**attempt + random.uniform(0, 0.5))
        if index % 50 == 0:
            print(
                f"Processed {index}/{len(pending)}; saved {success}; failed {len(failures)}",
                flush=True,
            )
        time.sleep(max(args.delay, 0))
    print(f"Saved {success}; failed {len(failures)}; public {export_public(session)}")
    if not failures:
        print(f"Exported {export_activity_summaries()} activity summaries")
    if failures:
        print(f"Failed IDs: {failures[:25]}")


if __name__ == "__main__":
    main()
