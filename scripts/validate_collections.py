#!/usr/bin/env python3
"""
Validate collections.json before it reaches the addon.

Checks (all derived from the addon protocol research):
  - valid JSON, top-level {"collections": [...]}
  - every collection has type (movie|series), id, name, items
  - id is URL-safe and unique per (type, id)
  - every item is a valid IMDb id (^tt\\d+$)  — Stremio/Nuvio resolve by IMDb id
  - no duplicate items inside a collection
  - at most 100 items per collection (one catalog page worth)
  - warns on duplicate titles across collections (allowed, but often a mistake)
  - warns when a collection is empty

Exit code 1 on errors so CI fails the build.
"""

import json
import re
import sys

MAX_ITEMS = 100
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
IMDB_RE = re.compile(r"^tt\d{6,10}$")
TYPES = {"movie", "series"}

errors = []
warnings = []


def err(msg):
    errors.append(msg)


def warn(msg):
    warnings.append(msg)


def main(path="collections.json"):
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        err(f"{path} not found")
        return report()
    except json.JSONDecodeError as e:
        err(f"{path} is not valid JSON: {e}")
        return report()

    if not isinstance(data, dict) or "collections" not in data:
        err('top level must be an object with a "collections" array')
        return report()

    collections = data["collections"]
    if not isinstance(collections, list):
        err('"collections" must be an array')
        return report()
    if not collections:
        warn("no collections defined — the addon will have no rows")

    seen_keys = set()
    title_owner = {}

    for i, c in enumerate(collections):
        where = f"collections[{i}]"
        if not isinstance(c, dict):
            err(f"{where}: must be an object")
            continue

        ctype = c.get("type")
        cid = c.get("id")
        name = c.get("name")
        items = c.get("items")

        if ctype not in TYPES:
            err(f"{where}: type must be one of {sorted(TYPES)}, got {ctype!r}")
        if not isinstance(cid, str) or not ID_RE.match(cid or ""):
            err(f"{where}: id must be lowercase letters/digits/hyphens (max 64), got {cid!r}")
        else:
            key = (ctype, cid)
            if key in seen_keys:
                err(f"{where}: duplicate id {cid!r} for type {ctype!r}")
            seen_keys.add(key)

        if not isinstance(name, str) or not name.strip():
            err(f"{where}: name must be a non-empty string")
        else:
            title_owner.setdefault(name.strip().lower(), []).append(cid)

        if not isinstance(items, list):
            err(f"{where}: items must be an array")
            continue
        if not items:
            warn(f"{where} ({cid}): has no items")
        if len(items) > MAX_ITEMS:
            err(f"{where} ({cid}): {len(items)} items exceeds the {MAX_ITEMS}-item page limit")

        dupes = set()
        seen = set()
        for item in items:
            if not isinstance(item, str) or not IMDB_RE.match(item):
                err(f"{where} ({cid}): invalid IMDb id {item!r} (expected tt1234567)")
                continue
            if item in seen:
                dupes.add(item)
            seen.add(item)
        for d in sorted(dupes):
            warn(f"{where} ({cid}): duplicate item {d}")

    for title, ids in title_owner.items():
        if len(ids) > 1:
            warn(f"collection name {title!r} used by {len(ids)} collections: {ids}")

    return report()


def report():
    for w in warnings:
        print(f"WARN  {w}")
    for e in errors:
        print(f"ERROR {e}")
    print()
    if errors:
        print(f"FAILED — {len(errors)} error(s), {len(warnings)} warning(s)")
        return 1
    print(f"OK — {len(warnings)} warning(s), no errors")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "collections.json"))
