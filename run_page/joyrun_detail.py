"""Normalize JoyRun activity metrics without exposing source coordinates."""

import json
import math


def _number(value):
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def _series(value):
    if value is None or value == "":
        return []
    parsed = json.loads(value) if isinstance(value, str) else value
    if not isinstance(parsed, list):
        raise ValueError("Expected a JoyRun series")
    return parsed


def normalize_joyrun_detail(list_record, runrecord):
    """Return the public, location-free detail contract for one activity."""
    run_id = int(runrecord["fid"])
    if int(list_record["fid"]) != run_id:
        raise ValueError("JoyRun list and detail IDs differ")

    distance_m = int(runrecord["meter"])
    moving_seconds = int(runrecord["second"])
    elapsed_seconds = max(0, int(runrecord["endtime"]) - int(runrecord["starttime"]))
    sample_interval = int(runrecord.get("sampleinterval") or 5)
    if distance_m < 0 or moving_seconds < 0 or not 1 <= sample_interval <= 60:
        raise ValueError("Invalid JoyRun distance, duration or sample interval")

    total_steps = int(runrecord.get("totalsteps") or 0)
    if total_steps < 0:
        total_steps = 0

    heart_rates = [
        int(hr) if hr is not None and 20 <= hr <= 250 else None
        for value in _series(runrecord.get("heartrate"))
        for hr in [_number(value)]
    ]
    altitudes = [
        altitude if altitude is not None and -500 <= altitude <= 10_000 else None
        for value in _series(runrecord.get("altitude"))
        for altitude in [_number(value)]
    ]

    steps = []
    for row in _series(runrecord.get("stepcontent")):
        if not isinstance(row, list) or len(row) < 2:
            steps.append((None, None))
            continue
        count, measure = _number(row[0]), _number(row[1])
        steps.append(
            (
                int(count) if count is not None and 0 <= count <= 1000 else None,
                measure if measure is not None and measure >= 0 else None,
            )
        )

    splits = []
    previous_distance = previous_seconds = 0
    for node in _series(runrecord.get("node")):
        if not isinstance(node, list) or len(node) < 2:
            continue
        cumulative_distance = _number(node[0])
        cumulative_seconds = _number(node[1])
        if cumulative_distance is None or cumulative_seconds is None:
            continue
        cumulative_distance, cumulative_seconds = (
            int(cumulative_distance),
            int(cumulative_seconds),
        )
        if not (
            previous_distance < cumulative_distance <= distance_m
            and previous_seconds <= cumulative_seconds <= moving_seconds
        ):
            continue
        splits.append(
            {
                "distance_m": cumulative_distance - previous_distance,
                "moving_seconds": cumulative_seconds - previous_seconds,
                "cumulative_distance_m": cumulative_distance,
                "cumulative_moving_seconds": cumulative_seconds,
                "partial": False,
            }
        )
        previous_distance, previous_seconds = cumulative_distance, cumulative_seconds
    if previous_distance < distance_m and previous_seconds <= moving_seconds:
        splits.append(
            {
                "distance_m": distance_m - previous_distance,
                "moving_seconds": moving_seconds - previous_seconds,
                "cumulative_distance_m": distance_m,
                "cumulative_moving_seconds": moving_seconds,
                "partial": True,
            }
        )

    samples = []
    for index in range(max(len(heart_rates), len(altitudes), len(steps))):
        step_count, step_measure = steps[index] if index < len(steps) else (None, None)
        cadence = (
            round(step_count * 60 / sample_interval, 1)
            if step_count is not None
            else None
        )
        stride = (
            round(step_measure / step_count, 3)
            if step_count
            and step_measure is not None
            and 0 < step_measure / step_count <= 3
            else None
        )
        samples.append(
            {
                "moving_seconds": index * sample_interval,
                "heart_rate_bpm": heart_rates[index]
                if index < len(heart_rates)
                else None,
                "altitude_m": altitudes[index] if index < len(altitudes) else None,
                "steps": step_count,
                "step_measure": step_measure,
                "cadence_spm": cadence,
                "stride_m_estimate": stride,
            }
        )

    valid_heart_rates = [value for value in heart_rates if value is not None]
    valid_altitudes = [value for value in altitudes if value is not None]
    calories = _number(list_record.get("calorie"))
    return {
        "schema_version": 1,
        "run_id": run_id,
        "start_time_unix": int(runrecord["starttime"]),
        "source": runrecord.get("source") or None,
        "heart_rate_source": runrecord.get("heartratesource") or None,
        "distance_m": distance_m,
        "moving_seconds": moving_seconds,
        "elapsed_seconds": elapsed_seconds,
        "calories_kcal": round(calories / 1000, 1)
        if calories is not None and calories >= 0
        else None,
        "total_steps": total_steps or None,
        "sample_interval_seconds": sample_interval,
        "average_cadence_spm": round(total_steps * 60 / moving_seconds, 1)
        if total_steps and moving_seconds
        else None,
        "average_stride_m": round(distance_m / total_steps, 3) if total_steps else None,
        "min_heart_rate_bpm": min(valid_heart_rates) if valid_heart_rates else None,
        "max_heart_rate_bpm": max(valid_heart_rates) if valid_heart_rates else None,
        "average_heart_rate_bpm": round(
            sum(valid_heart_rates) / len(valid_heart_rates), 1
        )
        if valid_heart_rates
        else None,
        "min_altitude_m": min(valid_altitudes) if valid_altitudes else None,
        "max_altitude_m": max(valid_altitudes) if valid_altitudes else None,
        "splits": splits,
        "samples": samples,
    }
