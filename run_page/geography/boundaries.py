"""Validate immutable, offline boundary packages before they can be selected."""

import argparse
import hashlib
import json
import math
import re
from dataclasses import dataclass
from pathlib import Path

from pyproj import CRS, Transformer
from shapely import STRtree, transform
from shapely.errors import GEOSException
from shapely.geometry import MultiPolygon, Polygon, shape
from shapely.ops import unary_union

from .catalog import LEVELS, load_catalog

ACCEPTANCE_VERSION = "boundary-acceptance-v1"
SEMANTICS = {"country": "country", "province": "province", "city": "prefecture"}


class BoundaryError(ValueError):
    """Only safe, stable codes reach acceptance reports."""


def _require(condition, code):
    if not condition:
        raise BoundaryError(code)


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def _file(root, name, digest):
    _require(isinstance(name, str) and name, "invalid_file_reference")
    path = (root / name).resolve()
    _require(path.is_relative_to(root) and path.is_file(), "invalid_file_reference")
    _require(sha256(path) == digest, "hash_mismatch")
    return path


def _polygon(value):
    try:
        geometry = shape(value)
    except (ValueError, TypeError, KeyError, AttributeError, GEOSException):
        raise BoundaryError("invalid_geometry") from None
    _require(
        isinstance(geometry, (Polygon, MultiPolygon))
        and not geometry.is_empty
        and geometry.is_valid,
        "invalid_geometry",
    )
    polygons = geometry.geoms if isinstance(geometry, MultiPolygon) else [geometry]
    for polygon in polygons:
        for ring in [polygon.exterior, *polygon.interiors]:
            previous = None
            for coordinate in ring.coords:
                _require(len(coordinate) == 2, "noncanonical_coordinates")
                lon, lat = coordinate
                _require(
                    math.isfinite(lon)
                    and math.isfinite(lat)
                    and -180 <= lon <= 180
                    and -90 <= lat <= 90,
                    "invalid_coordinate",
                )
                # Producers must split dateline polygons into canonical windows.
                _require(
                    previous is None or abs(lon - previous) <= 180,
                    "unsplit_antimeridian",
                )
                previous = lon
    return geometry


def _local_projection(geometry):
    center = geometry.representative_point()
    target = CRS.from_proj4(
        f"+proj=laea +lat_0={center.y} +lon_0={center.x} +datum=WGS84 +units=m"
    )
    transformer = Transformer.from_crs("EPSG:4326", target, always_xy=True)
    return lambda value: transform(value, transformer.transform, interleaved=False)


@dataclass(frozen=True)
class BoundaryLayer:
    ids: tuple
    geometries: tuple
    tree: STRtree

    def candidates(self, geometry):
        return sorted(
            (
                (self.ids[int(i)], self.geometries[int(i)])
                for i in self.tree.query(geometry)
            ),
            key=lambda pair: pair[0],
        )


@dataclass(frozen=True)
class BoundaryPackage:
    version: str
    catalog_version: str
    manifest_hash: str
    synthetic: bool
    layers: dict
    report: dict

    def layer_status(self, level):
        return "available" if level in self.layers else "boundary_unavailable"


def load_package(directory, catalog=None, *, allow_synthetic=False):
    root = Path(directory).resolve()
    catalog = catalog or load_catalog()
    manifest_path = root / "manifest.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise BoundaryError("invalid_manifest") from None
    _require(isinstance(manifest, dict), "invalid_manifest")
    _require(
        manifest.get("schemaVersion") == 1
        and manifest.get("acceptanceVersion") == ACCEPTANCE_VERSION,
        "unsupported_manifest_version",
    )
    _require(manifest.get("catalogVersion") == catalog.version, "catalog_mismatch")
    _require(
        isinstance(manifest.get("packageVersion"), str)
        and re.fullmatch(r"[A-Za-z0-9._-]{1,128}", manifest["packageVersion"]),
        "missing_package_version",
    )
    synthetic = manifest.get("synthetic") is True
    _require(not synthetic or allow_synthetic, "synthetic_package_not_enabled")
    _require(isinstance(manifest.get("layers"), list), "invalid_manifest")
    layers = {}
    geometries = {}
    layer_reports = {}
    for entry in manifest["layers"]:
        _require(isinstance(entry, dict), "invalid_layer_manifest")
        level = entry.get("level")
        _require(level in LEVELS and level not in layers, "invalid_layer")
        _require(
            entry.get("administrativeSemantics") == SEMANTICS[level]
            and entry.get("sourceAdministrativeSemantics") == SEMANTICS[level],
            "wrong_administrative_level",
        )
        _require(
            entry.get("outputCrs") == "OGC:CRS84"
            and isinstance(entry.get("sourceCrs"), str),
            "unknown_crs",
        )
        try:
            source_crs = CRS.from_user_input(entry["sourceCrs"])
        except (ValueError, RuntimeError):
            raise BoundaryError("unknown_crs") from None
        _require(
            isinstance(entry.get("crsEvidence"), str)
            and entry["crsEvidence"].strip()
            and isinstance(entry.get("conversion"), str)
            and entry["conversion"].strip(),
            "missing_crs_evidence",
        )
        controls = entry.get("controlPoints")
        _require(isinstance(controls, list) and bool(controls), "missing_crs_controls")
        converter = Transformer.from_crs(source_crs, "EPSG:4326", always_xy=True)
        for control in controls:
            try:
                actual = converter.transform(*control["source"], errcheck=True)
                expected = control["wgs84"]
                _require(
                    len(actual) == len(expected) == 2
                    and all(math.isfinite(v) for v in (*actual, *expected))
                    and max(abs(a - b) for a, b in zip(actual, expected)) <= 1e-7,
                    "crs_control_mismatch",
                )
            except (ValueError, TypeError, KeyError, RuntimeError):
                raise BoundaryError("crs_control_mismatch") from None
        _require(
            all(
                isinstance(entry.get(key), str) and entry[key].strip()
                for key in ("sourceUrl", "sourceRevision", "acquiredAt", "attribution")
            ),
            "missing_provenance",
        )
        _require(
            entry["sourceRevision"].lower() not in ("main", "master", "head", "latest"),
            "unfixed_source_revision",
        )
        license_info = entry.get("upstreamDataLicense", {})
        _require(
            isinstance(license_info, dict)
            and license_info.get("id")
            and license_info.get("url"),
            "missing_data_license",
        )
        license_path = _file(root, license_info.get("file"), license_info.get("sha256"))
        _require(
            bool(license_path.read_text(encoding="utf-8").strip()), "empty_license"
        )
        path = _file(root, entry.get("file"), entry.get("sha256"))
        try:
            document = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            raise BoundaryError("invalid_geojson") from None
        _require(
            isinstance(document, dict)
            and document.get("type") == "FeatureCollection"
            and "crs" not in document
            and isinstance(document.get("features"), list),
            "invalid_geojson",
        )
        expected_ids = entry.get("regionIds")
        _require(
            isinstance(expected_ids, list)
            and expected_ids
            and len(expected_ids) == len(set(expected_ids)),
            "invalid_coverage_declaration",
        )
        current = {}
        for feature in document["features"]:
            _require(
                isinstance(feature, dict) and feature.get("type") == "Feature",
                "invalid_feature",
            )
            properties = feature.get("properties", {})
            _require(isinstance(properties, dict), "invalid_region_mapping")
            region_id = properties.get("region_id")
            region = catalog.regions.get(region_id)
            _require(
                region is not None
                and region["level"] == level
                and region_id not in current
                and properties.get("parent_id") == region["parentId"],
                "invalid_region_mapping",
            )
            _require(
                level == "country" or region["countryCode"] == "CHN",
                "out_of_scope_layer",
            )
            current[region_id] = _polygon(feature.get("geometry"))
        _require(set(current) == set(expected_ids), "coverage_mismatch")
        ids = tuple(sorted(current))
        shapes = tuple(current[region_id] for region_id in ids)
        layer = BoundaryLayer(ids, shapes, STRtree(shapes))
        overlaps = []
        for region_id, geometry in current.items():
            for other_id, other in layer.candidates(geometry):
                if region_id < other_id and geometry.intersection(other).area > 1e-12:
                    overlaps.append([region_id, other_id])
        overlaps.sort()
        _require(
            overlaps == sorted(entry.get("knownOverlaps", [])), "undeclared_overlap"
        )
        coverage = _polygon(entry.get("coverageGeometry"))
        union = unary_union(shapes)
        _require(coverage.covers(union), "coverage_outside_declaration")
        gap = coverage.difference(union)
        has_gap = not gap.is_empty and gap.area > 1e-12
        _require(not has_gap or bool(entry.get("knownGaps")), "undeclared_gap")
        _require(
            isinstance(entry.get("knownDisputes"), list), "missing_dispute_declaration"
        )
        layers[level] = layer
        geometries.update(current)
        layer_reports[level] = {
            "regionCount": len(ids),
            "regionIds": list(ids),
            "overlaps": overlaps,
            "hasGaps": has_gap,
            "knownDisputeCount": len(entry["knownDisputes"]),
            "parentToleranceRegions": [],
        }
    _require(bool(layers), "empty_package")
    for region_id, child in geometries.items():
        region = catalog.regions[region_id]
        if region["parentId"] is None:
            continue
        parent = geometries.get(region["parentId"])
        _require(parent is not None, "missing_parent_boundary")
        if not parent.covers(child):
            projection = _local_projection(child)
            _require(
                projection(parent).buffer(30).covers(projection(child)),
                "parent_conflict",
            )
            layer_reports[region["level"]]["parentToleranceRegions"].append(region_id)
    report = {
        "accepted": True,
        "acceptanceVersion": ACCEPTANCE_VERSION,
        "packageVersion": manifest["packageVersion"],
        "catalogVersion": catalog.version,
        "synthetic": synthetic,
        "layers": layer_reports,
        "unavailableLevels": [level for level in LEVELS if level not in layers],
    }
    return BoundaryPackage(
        manifest["packageVersion"],
        catalog.version,
        sha256(manifest_path),
        synthetic,
        layers,
        report,
    )


def activate_package(directory, catalog=None, *, allow_synthetic=False):
    _require(
        not Path(directory)
        .resolve()
        .is_relative_to(Path(__file__).resolve().parents[2]),
        "repository_package_not_private",
    )
    package = load_package(directory, catalog, allow_synthetic=allow_synthetic)
    marker = Path(directory) / "accepted.json"
    marker.write_text(
        json.dumps(
            {"manifestSha256": package.manifest_hash, **package.report},
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return package


def load_active_package(directory, catalog=None, *, allow_synthetic=False):
    try:
        marker = json.loads(
            (Path(directory) / "accepted.json").read_text(encoding="utf-8")
        )
    except (OSError, ValueError):
        raise BoundaryError("package_not_accepted") from None
    package = load_package(directory, catalog, allow_synthetic=allow_synthetic)
    _require(
        marker == {"manifestSha256": package.manifest_hash, **package.report},
        "acceptance_changed",
    )
    return package


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory")
    parser.add_argument("--catalog")
    parser.add_argument("--activate", action="store_true")
    parser.add_argument("--allow-synthetic", action="store_true")
    args = parser.parse_args(argv)
    try:
        action = activate_package if args.activate else load_package
        package = action(
            args.directory,
            load_catalog(args.catalog),
            allow_synthetic=args.allow_synthetic,
        )
        print(json.dumps(package.report, ensure_ascii=False, sort_keys=True))
        return 0
    except BoundaryError as error:
        print(json.dumps({"accepted": False, "reason": str(error)}))
        return 1
    except (
        OSError,
        ValueError,
        TypeError,
        KeyError,
        AttributeError,
        RuntimeError,
        GEOSException,
    ):
        # Full exceptions may contain file paths or geometry; never print them.
        print(json.dumps({"accepted": False, "reason": "boundary_package_rejected"}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
