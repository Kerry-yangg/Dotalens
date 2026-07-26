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

import { bundleFixture } from "../tools/player-report-fixtures.mjs";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const VALIDATOR = resolve(PROJECT_ROOT, "tools", "Validate-PlayerReportV4.mjs");

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
    const players = bundleFixture({ serverAudit: true });
    players.by_slot["0"].report.root_causes = [{
      id: "root-one",
      scoring_impacts: [{
        dimension: "lane_execution",
        score_path: "modifier",
        applied_delta: -700 / 15,
        dedupe_key: "lane_execution|effect:one",
        dedupe_status: "applied_unique",
      }],
      scoring_summary: {
        applied_negative_overall: 1,
      },
    }];
    writeFileSync(
      resolve(analysisDirectory, moduleBase, "players.json.gz"),
      gzipSync(JSON.stringify(players)),
    );

    const run = spawnSync(process.execPath, [VALIDATOR, matchId, root], {
      encoding: "utf8",
    });
    const result = JSON.parse(run.stdout);

    assert.equal(run.status, 1);
    assert.equal(result.schema, "dota-lens-player-report-v4-regression/1.0");
    assert.equal(result.match_id, Number(matchId));
    assert.equal(result.player_module_schema, "player-report/4.0");
    assert.equal(result.player_reports, 10);
    assert.ok(Array.isArray(result.behavior_modifier_range));
    assert.equal(typeof result.duplicate_applied_key_count, "number");
    assert.equal(typeof result.max_root_negative_overall, "number");
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes("root_penalty_recomputed=7")));
    assert.equal(result.reports.length, 10);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
