"""Offline activity calculation; callers own database and export lifecycles."""

import hashlib
import json
from pathlib import Path

from .attribution import attribute_route
from .catalog import parse_provider_location
from .routes import RouteSource, read_activity_route
from .rules import PreparedRoute, input_fingerprint, prepare_route


def attach_detail_input(connection, activity):
    activity = dict(activity)
    columns = {
        row[1] for row in connection.execute("PRAGMA table_info(joyrun_details)")
    }
    selected = sorted(columns & {"raw_list_json", "raw_detail_json"})
    if selected:
        row = connection.execute(
            f"SELECT {','.join(selected)} FROM joyrun_details WHERE run_id=?",
            (activity["run_id"],),
        ).fetchone()
        if row:
            activity["_joyrun_origin"] = True
            activity["_detail_digest"] = hashlib.sha256(
                json.dumps(list(row), sort_keys=True).encode()
            ).hexdigest()
    return activity


def load_activity_input(activity, private_root, catalog, package):
    activity_id = str(activity["run_id"])
    joyrun = (
        bool(activity.get("_joyrun_origin"))
        or "joyrun" in str(activity.get("name", "")).lower()
    )
    crs = None if joyrun else "EPSG:4326"
    sources = []
    for kind in ("gpx", "tcx", "fit"):
        path = Path(private_root) / f"{kind.upper()}_OUT" / f"{activity_id}.{kind}"
        if path.is_file():
            sources.append(RouteSource(activity_id, kind, True, crs, path=path))
    encoded = activity.get("summary_polyline")
    if encoded and (joyrun or not sources):
        # Legacy DB polylines have no independently recorded CRS declaration.
        sources.append(
            RouteSource(
                activity_id, "db_polyline", True, None, encoded_polyline=encoded
            )
        )
    route = read_activity_route(activity_id, sources)
    indoor_inputs = {
        "rawDetailDigest": activity.get("_detail_digest"),
        "subtype": activity.get("subtype"),
        "provider": "joyrun" if joyrun else None,
        "providerLocation": activity.get("location_country"),
    }
    provider = parse_provider_location(activity.get("location_country"), catalog)
    return (
        route,
        indoor_inputs,
        provider,
        input_fingerprint(route, indoor_inputs, catalog, package),
    )


def calculate_activity(activity, private_root, catalog, package):
    route, indoor_inputs, provider, fingerprint = load_activity_input(
        activity, private_root, catalog, package
    )
    prepared = prepare_route(route, indoor_inputs)
    try:
        result = attribute_route(prepared, package, catalog, provider)
    except Exception:
        result = attribute_route(
            PreparedRoute("error", (), None, ("calculation_error",)),
            package,
            catalog,
            provider,
        )
    return result, fingerprint, route
