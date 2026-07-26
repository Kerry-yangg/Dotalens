import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const VALIDATOR = resolve(PROJECT_ROOT, "tools", "Validate-PlayerReportV4.mjs");
const DIMENSIONS = [
  "lane_execution",
  "farm_efficiency",
  "resource_decision",
  "map_tempo",
  "combat_output",
  "combat_duty",
  "survival_risk",
  "objective_conversion",
  "vision_team",
  "observable_execution",
];

function dimensionRows(modifier = 0) {
  return DIMENSIONS.map((key, index) => ({
    key,
    available: true,
    effective_weight: index === 0 ? 100 : 0,
    base_score: index === 0 ? 80 : 60,
    behavior_modifier: index === 0 ? modifier : 0,
    final_score: index === 0 ? 80 + modifier : 60,
    scoring_components: index === 0 && modifier
      ? [{
          dimension: key,
          score_path: "modifier",
          applied_delta: modifier,
          dedupe_key: `${key}|effect:one`,
          dedupe_status: "applied_unique",
        }]
      : [],
  }));
}

function report(slot, tamperRootSummary = false) {
  const modifier = tamperRootSummary ? -7 : 0;
  const dimensions = dimensionRows(modifier);
  const impact = dimensions[0].scoring_components[0];
  return {
    report: {
      model: "player-report/4.0",
      position: (slot % 5) + 1,
      score_card: {
        model: "player-report/4.0",
        base_score: 80,
        behavior_modifier: modifier,
        final_score: 80 + modifier,
        dimensions,
        audit: {
          model: "player-report-score-audit/1.0",
          recomputation_valid: true,
        },
      },
      root_causes: tamperRootSummary
        ? [{
            id: "root-one",
            scoring_impacts: [impact],
            scoring_summary: {
              applied_negative_overall: 1,
            },
          }]
        : [],
    },
  };
}

test("player report v4 validator independently enforces the per-root overall cap", () => {
  const root = mkdtempSync(resolve(tmpdir(), "dota-lens-v4-validator-"));
  try {
    const matchId = "1234567890";
    const analysisDirectory = resolve(
      root,
      "tools",
      "runtime",
      "dota-lens-data",
      "analyses",
      matchId,
    );
    const moduleBase = "modules/test-module";
    mkdirSync(resolve(analysisDirectory, moduleBase), { recursive: true });
    writeFileSync(
      resolve(analysisDirectory, "summary.json"),
      JSON.stringify({ analysis_storage: { module_base: moduleBase } }),
    );
    const bySlot = Object.fromEntries(
      Array.from({ length: 10 }, (_, slot) => [slot, report(slot, slot === 0)]),
    );
    writeFileSync(
      resolve(analysisDirectory, moduleBase, "players.json.gz"),
      gzipSync(JSON.stringify({ schema: "player-report/4.0", by_slot: bySlot })),
    );

    const run = spawnSync(process.execPath, [VALIDATOR, matchId, root], {
      encoding: "utf8",
    });
    const result = JSON.parse(run.stdout);

    assert.equal(run.status, 1);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes("root_penalty_recomputed=7")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
