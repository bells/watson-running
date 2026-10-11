"""Stable region identities and conservative, parent-scoped provider parsing."""

import ast
import json
import re
from pathlib import Path

LEVELS = ("country", "province", "city")


def _text(value):
    return (
        value.strip()
        if isinstance(value, str) and value.strip() not in ("None", "null")
        else ""
    )


class Catalog:
    def __init__(self, document):
        self.version = document["version"]
        if not isinstance(self.version, str) or not self.version:
            raise ValueError("invalid_catalog_version")
        self.regions = {}
        self.aliases = {}
        identities = set()
        for region in document["regions"]:
            region_id = region["id"]
            if region_id in self.regions or region["level"] not in LEVELS:
                raise ValueError("invalid_region_identity")
            identity = (region["codeNamespace"], region["level"], region["code"])
            if identity in identities:
                raise ValueError("duplicate_region_code")
            identities.add(identity)
            if not all(
                isinstance(region[key], str) and region[key].strip()
                for key in ("id", "name", "countryCode", "codeNamespace", "code")
            ) or not re.fullmatch(r"[A-Z]{3}", region["countryCode"]):
                raise ValueError("invalid_region_identity")
            if not re.fullmatch(r"[A-Za-z0-9:_-]{1,128}", region_id):
                raise ValueError("invalid_region_identity")
            if region["codeNamespace"] == "ISO3166-1-alpha3" and (
                region["level"] != "country"
                or region_id != f"country:{region['countryCode']}"
                or region["code"] != region["countryCode"]
            ):
                raise ValueError("invalid_region_code")
            if region["codeNamespace"].startswith("CN-adcode") and (
                region["countryCode"] != "CHN"
                or not re.fullmatch(r"\d{6}", region["code"])
                or region_id != f"CHN:{region['level']}:{region['code']}"
            ):
                raise ValueError("invalid_region_code")
            self.regions[region_id] = region
            aliases = region.get("aliases", [])
            if not isinstance(aliases, list) or not all(
                isinstance(alias, str) and alias.strip() for alias in aliases
            ):
                raise ValueError("invalid_region_alias")
            for name in [region["name"], *aliases]:
                self.aliases.setdefault((region["level"], name), set()).add(region_id)
        for region in self.regions.values():
            if region["level"] == "country":
                if region["parentId"] is not None:
                    raise ValueError("invalid_country_parent")
            else:
                parent = self.regions.get(region["parentId"])
                expected = LEVELS[LEVELS.index(region["level"]) - 1]
                if (
                    not parent
                    or parent["level"] != expected
                    or parent["countryCode"] != region["countryCode"]
                ):
                    raise ValueError("invalid_region_parent")

    def candidates(self, level, name, parent_id=None):
        return sorted(
            region_id
            for region_id in self.aliases.get((level, name), ())
            if parent_id is None or self.regions[region_id]["parentId"] == parent_id
        )

    def resolve(self, level, name, parent_id=None):
        candidates = self.candidates(level, name, parent_id)
        return candidates[0] if len(candidates) == 1 else None


def load_catalog(path=None):
    path = Path(path) if path else Path(__file__).with_name("region_catalog.json")
    return Catalog(json.loads(path.read_text(encoding="utf-8")))


def _fields(value, catalog):
    raw = _text(value)
    if len(raw) > 4096:
        return ("", "", "")
    if raw.startswith("{"):
        try:
            try:
                fields = json.loads(raw)
            except json.JSONDecodeError:
                fields = ast.literal_eval(raw)
            if not isinstance(fields, dict):
                return ("", "", "")
            return (
                _text(fields.get("country")),
                _text(fields.get("province")) or _text(fields.get("state")),
                _text(fields.get("city")) or _text(fields.get("town")),
            )
        except (ValueError, SyntaxError, RecursionError):
            return ("", "", "")
    if re.fullmatch(r"[^:]+:[^:]*", raw):
        city, province = map(_text, raw.split(":"))
        return ("", province, city)
    tokens = [_text(part) for part in re.split("[,，]", raw) if _text(part)]

    def token(level):
        matches = [part for part in tokens if catalog.candidates(level, part)]
        return matches[0] if len(matches) == 1 else ""

    country = token("country")
    # An explicit unknown trailing country must not become an inferred China.
    if not country and len(tokens) > 1:
        last = tokens[-1]
        if not any(catalog.candidates(level, last) for level in LEVELS[1:]):
            country = last
    return (country, token("province"), token("city"))


def parse_provider_location(value, catalog=None):
    catalog = catalog or load_catalog()
    country, province, city = _fields(value, catalog)
    result = dict(countryId=None, provinceId=None, cityId=None, source=None)
    country_id = catalog.resolve("country", country) if country else None
    if country and not country_id:
        return result
    province_id = (
        catalog.resolve("province", province, country_id) if province else None
    )
    city_id = catalog.resolve("city", city, province_id) if city else None
    if province and not province_id:
        city_id = None
    if city_id:
        parent_id = catalog.regions[city_id]["parentId"]
        ancestor_id = catalog.regions[parent_id]["parentId"]
        if country_id and ancestor_id != country_id:
            city_id = None
        else:
            province_id = parent_id
            country_id = ancestor_id
    if province_id and not country_id:
        country_id = catalog.regions[province_id]["parentId"]
    return dict(
        countryId=country_id,
        provinceId=province_id,
        cityId=city_id,
        source=("provider" if country else "catalog_inferred") if country_id else None,
    )
