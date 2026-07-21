from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from analyze_jsonl import analyze


class AnalyzeJsonlTest(unittest.TestCase):
    def test_reports_schema_clock_and_interval_continuity(self) -> None:
        events = [
            {
                "type": "interval",
                "time": 0,
                "demo_tick": 100,
                "raw_game_time_ms": 10000,
                "game_time_ms": 0,
                "event_seq": 1,
                "slot": 0,
                "hero_id": 1,
                "x": 90.0,
                "y": 100.0,
                "hero_inventory": [],
                "hero_abilities": [],
            },
            {
                "type": "interval",
                "time": 1,
                "demo_tick": 130,
                "raw_game_time_ms": 11000,
                "game_time_ms": 1000,
                "event_seq": 2,
                "slot": 0,
                "hero_id": 1,
                "x": 91.0,
                "y": 100.0,
                "hero_inventory": [
                    {"id": "item_blink", "slot": 0, "cooldown": 0.0}
                ],
                "hero_abilities": [
                    {
                        "id": "axe_berserkers_call",
                        "ability_level": 1,
                        "cooldown": 0.0,
                    }
                ],
            },
            {
                "type": "actions",
                "time": 1,
                "demo_tick": 131,
                "raw_game_time_ms": 11020,
                "game_time_ms": 1020,
                "event_seq": 3,
                "order_type": 1,
                "target_ehandle": None,
            },
            {
                "type": "schema_probe",
                "time": 1,
                "demo_tick": 132,
                "raw_game_time_ms": 11030,
                "game_time_ms": 1030,
                "event_seq": 4,
                "unit": "CDOTA_Unit_Hero_Axe",
                "schema_category": "hero",
                "fields": {"m_iHealth": 700, "m_flMana": 300.0},
            },
            {
                "type": "obs",
                "time": 1,
                "demo_tick": 133,
                "raw_game_time_ms": 11040,
                "game_time_ms": 1040,
                "event_seq": 5,
                "owner_slot": 3,
                "day_vision_range": 1600,
            },
            {
                "type": "obs_left",
                "time": 2,
                "demo_tick": 134,
                "raw_game_time_ms": 12040,
                "game_time_ms": 2040,
                "event_seq": 6,
                "owner_slot": 3,
                "ward_lifetime_ms": 1000,
                "ward_end_reason": "killed",
            },
            {
                "type": "epilogue",
                "time": 2,
                "demo_tick": 135,
                "raw_game_time_ms": 12050,
                "game_time_ms": 2050,
                "event_seq": 7,
            },
        ]

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sample.jsonl"
            rendered = "\n".join(json.dumps(event) for event in events)
            path.write_text(rendered + "\nnot-json\n", encoding="utf-8")
            summary = analyze(path)

        self.assertEqual(summary["valid_json_objects"], 7)
        self.assertEqual(summary["invalid_lines"], 1)
        self.assertTrue(summary["complete"])
        self.assertTrue(summary["clock"]["event_sequence"]["strictly_contiguous"])
        self.assertTrue(summary["interval"]["slots"]["0"]["continuous_game_timeline"])
        action_schema = summary["event_schemas"]["actions"]
        self.assertEqual(action_schema["fields"]["order_type"]["non_null_ratio"], 1.0)
        self.assertEqual(action_schema["fields"]["target_ehandle"]["non_null_ratio"], 0.0)
        self.assertEqual(summary["decision_state"]["inventory"]["items"], 1)
        self.assertEqual(summary["decision_state"]["abilities"]["states"], 1)
        self.assertIn("CDOTA_Unit_Hero_Axe", summary["schema_probe"]["classes"])
        self.assertEqual(summary["wards"]["observer"]["placed"], 1)
        self.assertEqual(summary["wards"]["observer"]["lifetime_ms"]["coverage"], 1.0)


if __name__ == "__main__":
    unittest.main()
