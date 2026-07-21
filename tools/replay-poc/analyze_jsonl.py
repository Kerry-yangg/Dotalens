#!/usr/bin/env python3
"""Stream and validate raw JSONL emitted by the OpenDota replay parser."""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


CORE_INTERVAL_FIELDS = (
    "time",
    "demo_tick",
    "raw_game_time_ms",
    "game_time_ms",
    "event_seq",
    "slot",
    "hero_id",
    "x",
    "y",
    "z",
    "gold",
    "networth",
    "xp",
    "lh",
    "denies",
    "level",
    "life_state",
    "hp",
    "max_hp",
    "mana",
    "max_mana",
    "move_speed",
    "visible_by_team",
    "hero_inventory",
    "hero_abilities",
)

CLOCK_FIELDS = ("demo_tick", "raw_game_time_ms", "game_time_ms", "event_seq")

WARD_EVENTS = {
    "obs": ("observer", False),
    "obs_left": ("observer", True),
    "sen": ("sentry", False),
    "sen_left": ("sentry", True),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate raw newline-delimited JSON from the OpenDota parser."
    )
    parser.add_argument("jsonl", type=Path, help="Path to the raw parser JSONL file")
    parser.add_argument("--output", type=Path, help="Optional summary JSON output path")
    parser.add_argument(
        "--quiet", action="store_true", help="Write the summary without printing it"
    )
    return parser.parse_args()


def normalize_second(value: Any) -> int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if isinstance(value, float) and not value.is_integer():
        return None
    return int(value)


def missing_seconds(times: set[int]) -> tuple[int, list[dict[str, int]]]:
    ordered = sorted(times)
    missing = 0
    gaps: list[dict[str, int]] = []
    for previous, current in zip(ordered, ordered[1:]):
        gap = current - previous - 1
        if gap <= 0:
            continue
        missing += gap
        if len(gaps) < 20:
            gaps.append({"after": previous, "before": current, "missing": gap})
    return missing, gaps


def analyze(path: Path) -> dict[str, Any]:
    event_counts: Counter[str] = Counter()
    first_event_keys: dict[str, list[str]] = {}
    event_field_counts: dict[str, Counter[str]] = defaultdict(Counter)
    event_non_null_counts: dict[str, Counter[str]] = defaultdict(Counter)
    clock_field_counts: Counter[str] = Counter()
    unit_event_counts: dict[str, Counter[str]] = defaultdict(Counter)
    schema_probe_classes: dict[str, dict[str, Any]] = {}
    schema_probe_category_classes: Counter[str] = Counter()
    schema_probe_category_fields: dict[str, Counter[str]] = defaultdict(Counter)
    inventory_field_counts: Counter[str] = Counter()
    inventory_non_null_counts: Counter[str] = Counter()
    ability_field_counts: Counter[str] = Counter()
    ability_non_null_counts: Counter[str] = Counter()
    ward_placements: Counter[str] = Counter()
    ward_ends: Counter[str] = Counter()
    ward_owners: dict[str, Counter[str]] = defaultdict(Counter)
    ward_end_reasons: dict[str, Counter[str]] = defaultdict(Counter)
    ward_lifetimes: dict[str, list[int]] = defaultdict(list)
    interval_field_counts: Counter[str] = Counter()
    game_interval_field_counts: Counter[str] = Counter()
    slot_records: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"records": 0, "times": set(), "duplicates": 0}
    )
    invalid_samples: list[dict[str, Any]] = []
    total_lines = 0
    valid_lines = 0
    interval_records = 0
    game_interval_records = 0
    first_event_sequence: int | None = None
    previous_event_sequence: int | None = None
    last_event_sequence: int | None = None
    event_sequence_records = 0
    duplicate_event_sequences = 0
    regressed_event_sequences = 0
    skipped_event_sequences = 0
    inventory_snapshots = 0
    non_empty_inventory_snapshots = 0
    inventory_items = 0
    ability_snapshots = 0
    non_empty_ability_snapshots = 0
    ability_states = 0

    with path.open("r", encoding="utf-8") as stream:
        for line_number, line in enumerate(stream, start=1):
            total_lines += 1
            try:
                event = json.loads(line)
            except (json.JSONDecodeError, UnicodeDecodeError) as error:
                if len(invalid_samples) < 10:
                    invalid_samples.append(
                        {"line": line_number, "error": str(error), "preview": line[:160]}
                    )
                continue

            if not isinstance(event, dict):
                if len(invalid_samples) < 10:
                    invalid_samples.append(
                        {"line": line_number, "error": "JSON value is not an object"}
                    )
                continue

            valid_lines += 1
            event_type = str(event.get("type", "<missing>"))
            event_counts[event_type] += 1
            first_event_keys.setdefault(event_type, sorted(event.keys()))
            event_field_counts[event_type].update(event.keys())
            event_non_null_counts[event_type].update(
                key for key, value in event.items() if value is not None
            )
            clock_field_counts.update(
                field for field in CLOCK_FIELDS if event.get(field) is not None
            )
            unit_kind = event.get("unit_kind")
            if isinstance(unit_kind, str):
                unit_event_counts[event_type][unit_kind] += 1

            ward_event = WARD_EVENTS.get(event_type)
            if ward_event:
                ward_kind, is_end = ward_event
                if is_end:
                    ward_ends[ward_kind] += 1
                    reason = event.get("ward_end_reason")
                    if isinstance(reason, str):
                        ward_end_reasons[ward_kind][reason] += 1
                    lifetime = normalize_second(event.get("ward_lifetime_ms"))
                    if lifetime is not None and lifetime >= 0:
                        ward_lifetimes[ward_kind].append(lifetime)
                else:
                    ward_placements[ward_kind] += 1
                    owner = event.get("owner_slot", event.get("slot"))
                    if owner is not None:
                        ward_owners[ward_kind][str(owner)] += 1

            if event_type == "schema_probe":
                unit = event.get("unit")
                category = event.get("schema_category")
                fields = event.get("fields")
                if isinstance(unit, str) and isinstance(category, str):
                    field_names = sorted(fields) if isinstance(fields, dict) else []
                    schema_probe_classes[unit] = {
                        "category": category,
                        "fields": field_names,
                    }
                    schema_probe_category_classes[category] += 1
                    schema_probe_category_fields[category].update(field_names)

            event_sequence = normalize_second(event.get("event_seq"))
            if event_sequence is not None:
                event_sequence_records += 1
                if first_event_sequence is None:
                    first_event_sequence = event_sequence
                if previous_event_sequence is not None:
                    if event_sequence == previous_event_sequence:
                        duplicate_event_sequences += 1
                    elif event_sequence < previous_event_sequence:
                        regressed_event_sequences += 1
                    elif event_sequence > previous_event_sequence + 1:
                        skipped_event_sequences += event_sequence - previous_event_sequence - 1
                previous_event_sequence = event_sequence
                last_event_sequence = event_sequence

            if event_type != "interval":
                continue

            interval_records += 1
            interval_field_counts.update(event.keys())
            inventory = event.get("hero_inventory")
            if isinstance(inventory, list):
                inventory_snapshots += 1
                if inventory:
                    non_empty_inventory_snapshots += 1
                for item in inventory:
                    if not isinstance(item, dict):
                        continue
                    inventory_items += 1
                    inventory_field_counts.update(item.keys())
                    inventory_non_null_counts.update(
                        key for key, value in item.items() if value is not None
                    )

            abilities = event.get("hero_abilities")
            if isinstance(abilities, list):
                ability_snapshots += 1
                if abilities:
                    non_empty_ability_snapshots += 1
                for ability in abilities:
                    if not isinstance(ability, dict):
                        continue
                    ability_states += 1
                    ability_field_counts.update(ability.keys())
                    ability_non_null_counts.update(
                        key for key, value in ability.items() if value is not None
                    )
            second = normalize_second(event.get("time"))
            slot = event.get("slot")
            if second is not None and second >= 0:
                game_interval_records += 1
                game_interval_field_counts.update(event.keys())
            if second is None or slot is None:
                continue

            slot_name = str(slot)
            state = slot_records[slot_name]
            state["records"] += 1
            if second in state["times"]:
                state["duplicates"] += 1
            state["times"].add(second)

    slots: dict[str, Any] = {}
    for slot, state in sorted(slot_records.items(), key=lambda item: int(item[0])):
        all_times: set[int] = state["times"]
        game_times = {second for second in all_times if second >= 0}
        all_missing, all_gaps = missing_seconds(all_times)
        game_missing, game_gaps = missing_seconds(game_times)
        slots[slot] = {
            "records": state["records"],
            "unique_seconds": len(all_times),
            "duplicate_seconds": state["duplicates"],
            "first_second": min(all_times) if all_times else None,
            "last_second": max(all_times) if all_times else None,
            "missing_seconds_full_range": all_missing,
            "first_20_full_range_gaps": all_gaps,
            "game_seconds": len(game_times),
            "first_game_second": min(game_times) if game_times else None,
            "last_game_second": max(game_times) if game_times else None,
            "missing_game_seconds": game_missing,
            "first_20_game_gaps": game_gaps,
            "continuous_game_timeline": bool(game_times)
            and game_missing == 0
            and state["duplicates"] == 0,
        }

    field_coverage = {
        field: {
            "records": interval_field_counts[field],
            "ratio": round(interval_field_counts[field] / interval_records, 6)
            if interval_records
            else 0,
        }
        for field in CORE_INTERVAL_FIELDS
    }
    game_field_coverage = {
        field: {
            "records": game_interval_field_counts[field],
            "ratio": round(game_interval_field_counts[field] / game_interval_records, 6)
            if game_interval_records
            else 0,
        }
        for field in CORE_INTERVAL_FIELDS
    }

    event_schemas: dict[str, Any] = {}
    for event_type in sorted(event_counts):
        records = event_counts[event_type]
        all_fields = sorted(event_field_counts[event_type])
        event_schemas[event_type] = {
            "records": records,
            "fields": {
                field: {
                    "present": event_field_counts[event_type][field],
                    "non_null": event_non_null_counts[event_type][field],
                    "present_ratio": round(
                        event_field_counts[event_type][field] / records, 6
                    ),
                    "non_null_ratio": round(
                        event_non_null_counts[event_type][field] / records, 6
                    ),
                }
                for field in all_fields
            },
        }

    clock_coverage = {
        field: {
            "records": clock_field_counts[field],
            "ratio": round(clock_field_counts[field] / valid_lines, 6)
            if valid_lines
            else 0,
        }
        for field in CLOCK_FIELDS
    }

    def nested_coverage(
        records: int, field_counts: Counter[str], non_null_counts: Counter[str]
    ) -> dict[str, Any]:
        return {
            field: {
                "present": field_counts[field],
                "non_null": non_null_counts[field],
                "present_ratio": round(field_counts[field] / records, 6)
                if records
                else 0,
                "non_null_ratio": round(non_null_counts[field] / records, 6)
                if records
                else 0,
            }
            for field in sorted(field_counts)
        }

    schema_probe_categories: dict[str, Any] = {}
    for category in sorted(schema_probe_category_classes):
        classes = schema_probe_category_classes[category]
        schema_probe_categories[category] = {
            "classes": classes,
            "fields": {
                field: {
                    "classes": count,
                    "ratio": round(count / classes, 6) if classes else 0,
                }
                for field, count in sorted(
                    schema_probe_category_fields[category].items()
                )
            },
        }

    ward_summary: dict[str, Any] = {}
    for kind in ("observer", "sentry"):
        lifetimes = sorted(ward_lifetimes[kind])
        lifetime_count = len(lifetimes)
        ended = ward_ends[kind]
        ward_summary[kind] = {
            "placed": ward_placements[kind],
            "ended": ended,
            "owners": dict(
                sorted(ward_owners[kind].items(), key=lambda item: int(item[0]))
            ),
            "end_reasons": dict(ward_end_reasons[kind].most_common()),
            "lifetime_ms": {
                "records": lifetime_count,
                "coverage": round(lifetime_count / ended, 6) if ended else 0,
                "minimum": lifetimes[0] if lifetimes else None,
                "median": lifetimes[(lifetime_count - 1) // 2]
                if lifetimes
                else None,
                "average": round(sum(lifetimes) / lifetime_count, 3)
                if lifetimes
                else None,
                "maximum": lifetimes[-1] if lifetimes else None,
            },
        }

    return {
        "source": str(path.resolve()),
        "file_bytes": path.stat().st_size,
        "total_lines": total_lines,
        "valid_json_objects": valid_lines,
        "invalid_lines": total_lines - valid_lines,
        "complete": event_counts["epilogue"] == 1,
        "epilogue_count": event_counts["epilogue"],
        "invalid_samples": invalid_samples,
        "event_counts": dict(event_counts.most_common()),
        "first_event_keys": dict(sorted(first_event_keys.items())),
        "event_schemas": event_schemas,
        "clock": {
            "field_coverage": clock_coverage,
            "event_sequence": {
                "records": event_sequence_records,
                "first": first_event_sequence,
                "last": last_event_sequence,
                "duplicates": duplicate_event_sequences,
                "regressions": regressed_event_sequences,
                "skipped": skipped_event_sequences,
                "strictly_contiguous": event_sequence_records == valid_lines
                and duplicate_event_sequences == 0
                and regressed_event_sequences == 0
                and skipped_event_sequences == 0,
            },
        },
        "unit_events": {
            event_type: dict(counts.most_common())
            for event_type, counts in sorted(unit_event_counts.items())
        },
        "wards": ward_summary,
        "schema_probe": {
            "records": event_counts["schema_probe"],
            "categories": schema_probe_categories,
            "classes": dict(sorted(schema_probe_classes.items())),
        },
        "decision_state": {
            "inventory": {
                "snapshots": inventory_snapshots,
                "non_empty_snapshots": non_empty_inventory_snapshots,
                "items": inventory_items,
                "field_coverage": nested_coverage(
                    inventory_items,
                    inventory_field_counts,
                    inventory_non_null_counts,
                ),
            },
            "abilities": {
                "snapshots": ability_snapshots,
                "non_empty_snapshots": non_empty_ability_snapshots,
                "states": ability_states,
                "field_coverage": nested_coverage(
                    ability_states,
                    ability_field_counts,
                    ability_non_null_counts,
                ),
            },
        },
        "interval": {
            "records": interval_records,
            "game_records": game_interval_records,
            "slot_count": len(slots),
            "field_coverage": field_coverage,
            "game_field_coverage": game_field_coverage,
            "slots": slots,
        },
    }


def main() -> None:
    args = parse_args()
    path = args.jsonl.resolve(strict=True)
    summary = analyze(path)
    rendered = json.dumps(summary, ensure_ascii=False, indent=2)
    if not args.quiet:
        print(rendered)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered + "\n", encoding="utf-8")
    if summary["invalid_lines"] or not summary["complete"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
