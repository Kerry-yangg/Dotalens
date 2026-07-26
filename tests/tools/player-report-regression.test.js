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

import {
  compareGolden,
  projectGoldenReport,
  validatePlayerReportBundle,
} from "../../tools/player-report-regression.mjs";
import {
  atomicReportFixture,
  bundleFixture,
  goldenFixture,
} from "./player-report-fixtures.mjs";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TOOL = resolve(PROJECT_ROOT, "tools", "player-report-regression.mjs");

test("atomic fixtures clone Task 6 component values without cross-test contamination", () => {
  const first = atomicReportFixture();
  const second = atomicReportFixture();

  assert.deepEqual(first.score_card.dimensions[0].base_components, [
    {
      key: "lane_model_score",
      label: "对线模型结果",
      available: true,
      normalized_score: 80,
      local_weight: 75,
      effective_local_weight: 75,
      weighted_contribution: 60,
      confidence: 90,
      comparison: {},
      raw_metrics: {},
      evidence_refs: ["laning.slot.0"],
    },
    {
      key: "core_lane_opportunity_conversion",
      label: "核心对线资源转化",
      available: true,
      normalized_score: 40,
      local_weight: 25,
      effective_local_weight: 25,
      weighted_contribution: 10,
      confidence: 90,
      comparison: {},
      raw_metrics: {},
      evidence_refs: ["players.slot.0.lane_opportunity_summary"],
    },
  ]);
  first.score_card.dimensions[0].base_components[0].normalized_score = 1;
  assert.equal(
    second.score_card.dimensions[0].base_components[0].normalized_score,
    80,
  );
});

test("validatePlayerReportBundle checks all ten slots", () => {
  const result = validatePlayerReportBundle(
    bundleFixture({ slots: 10, atomic: true }),
    { requireAtomic: true },
  );

  assert.equal(result.schema, "player-report-regression-validation/1.0");
  assert.equal(result.playerReports, 10);
  assert.equal(result.validReports, 10);
  assert.deepEqual(result.positionCounts, {
    "1": 2,
    "2": 2,
    "3": 2,
    "4": 2,
    "5": 2,
  });
  assert.equal(result.aggregateFallbackCount, 0);
  assert.equal(result.duplicateAppliedKeyCount, 0);
  assert.equal(result.maxRootNegativeOverall, 0);
  assert.deepEqual(result.errors, []);
});

test("current bundle rejects aggregate fallback with an exact slot path", () => {
  const players = bundleFixture({ slots: 10, atomic: true });
  players.by_slot["3"].report.score_card.dimensions[0]
    .base_components[0].key = "existing_dimension_model";

  const result = validatePlayerReportBundle(players, { requireAtomic: true });

  assert.equal(result.aggregateFallbackCount, 1);
  assert.ok(result.errors.includes(
    "slot 3: lane_execution.base_components[0]:aggregate_component_in_current_report",
  ));
});

test("legacy bundles remain valid unless atomic reports are required", () => {
  const players = bundleFixture({ slots: 10, atomic: false });
  players.by_slot["0"].report.score_card.dimensions[0]
    .base_components[0].key = "existing_dimension_model";

  const legacy = validatePlayerReportBundle(players, { requireAtomic: false });
  const current = validatePlayerReportBundle(players, { requireAtomic: true });

  assert.equal(legacy.valid, true);
  assert.equal(legacy.aggregateFallbackCount, 1);
  assert.ok(current.errors.includes("slot 0: missing_atomic_component_model"));
  assert.ok(current.errors.includes(
    "slot 0: lane_execution.base_components[0]:aggregate_component_in_current_report",
  ));
});

test("atomic validation enforces base formula and effective weight tolerances", () => {
  const players = bundleFixture();
  const dimension = players.by_slot["2"].report.score_card.dimensions[0];
  dimension.base_components[0].weighted_contribution = 60.06;
  dimension.base_components[0].effective_local_weight = 74.98;

  const result = validatePlayerReportBundle(players, { requireAtomic: true });

  assert.ok(result.errors.includes(
    "slot 2: lane_execution.base_components[0]:base_component_contribution_mismatch",
  ));
  assert.ok(result.errors.includes(
    "slot 2: lane_execution:base_component_weight_sum_mismatch",
  ));
  assert.ok(result.errors.includes(
    "slot 2: lane_execution:base_component_score_mismatch",
  ));
});

test("unavailable atomic rows reject numeric zero score data", () => {
  const players = bundleFixture();
  const component = players.by_slot["4"].report.score_card.dimensions[0]
    .base_components[0];
  component.available = false;
  component.normalized_score = 0;
  component.effective_local_weight = 0;
  component.weighted_contribution = 0;

  const result = validatePlayerReportBundle(players, { requireAtomic: true });

  assert.ok(result.errors.includes(
    "slot 4: lane_execution.base_components[0]:base_component_malformed",
  ));
});

test("scoring paths reject applied embedded, context-only, and unknown rows", () => {
  const players = bundleFixture();
  players.by_slot["1"].report.score_card.dimensions[0].scoring_components = [
    {
      score_path: "embedded",
      applied_delta: -1,
      dedupe_key: "embedded-one",
    },
    {
      score_path: "context_only",
      applied_delta: -2,
      dedupe_key: "context-one",
    },
    {
      score_path: "mystery",
      applied_delta: 0,
      dedupe_key: "unknown-one",
    },
  ];

  const result = validatePlayerReportBundle(players, { requireAtomic: true });

  assert.ok(result.errors.includes(
    "slot 1: lane_execution:embedded_applied_-1",
  ));
  assert.ok(result.errors.includes(
    "slot 1: lane_execution:context_only_applied_-2",
  ));
  assert.ok(result.errors.includes(
    "slot 1: lane_execution:unknown_score_path=mystery",
  ));
});

test("duplicate applied keys and per-root negative caps are independently counted", () => {
  const players = bundleFixture();
  const report = players.by_slot["6"].report;
  const impact = {
    dimension: "lane_execution",
    score_path: "modifier",
    applied_delta: -70,
    dedupe_key: "effect:duplicate",
    dedupe_status: "applied_unique",
  };
  report.root_causes = [{
    id: "root:over-cap",
    scoring_impacts: [impact, { ...impact }],
    scoring_summary: { applied_negative_overall: 14 },
  }];

  const result = validatePlayerReportBundle(players, { requireAtomic: true });

  assert.equal(result.duplicateAppliedKeyCount, 1);
  assert.equal(result.maxRootNegativeOverall, 14);
  assert.ok(result.errors.includes(
    "slot 6: duplicate_applied_keys=effect:duplicate",
  ));
  assert.ok(result.errors.includes("slot 6: root_penalty_recomputed=14"));
});

test("per-root negative overall values above six fail without tolerance", () => {
  const players = bundleFixture();
  players.by_slot["6"].report.root_causes = [{
    id: "root:just-over-cap",
    scoring_impacts: [{
      dimension: "lane_execution",
      score_path: "modifier",
      applied_delta: -60.1,
      dedupe_key: "effect:just-over-cap",
      dedupe_status: "applied_unique",
    }],
    scoring_summary: { applied_negative_overall: 6.01 },
  }];

  const result = validatePlayerReportBundle(players, { requireAtomic: true });

  assert.ok(result.errors.includes("slot 6: root_penalty_recomputed=6.01"));
});

test("position counts and role templates must describe two complete teams", () => {
  const players = bundleFixture();
  players.by_slot["9"].report.position = 4;
  delete players.by_slot["8"].report.role_code;

  const result = validatePlayerReportBundle(players, { requireAtomic: true });

  assert.deepEqual(result.positionCounts, {
    "1": 2,
    "2": 2,
    "3": 2,
    "4": 3,
    "5": 1,
  });
  assert.ok(result.errors.includes(
    "slot 9: role_template_mismatch=position_5/position_4",
  ));
  assert.ok(result.errors.includes(
    "slot 8: role_template_mismatch=missing/position_4",
  ));
  assert.ok(result.errors.includes("position_count_4=3"));
  assert.ok(result.errors.includes("position_count_5=1"));
});

test("golden projection includes stable audit fields and excludes prose", () => {
  const report = atomicReportFixture();
  report.summary_text = "A complete natural-language paragraph.";
  report.score_card.dimensions[0].base_components[0].label = "unstable prose";
  report.jump_targets = [{
    id: "jump:fight-1",
    module: "combat",
    entity_type: "fight",
    entity_id: "fight-1",
    player_slot: 0,
    time: 123.5,
    range_start: 118,
    range_end: 130,
    label: "unstable jump prose",
  }];

  const projected = projectGoldenReport({
    matchId: "8894766243",
    slot: 0,
    report,
  });
  const serialized = JSON.stringify(projected);

  assert.equal(projected.schema, "player-report-golden/1.0");
  assert.equal("summary_text" in projected, false);
  assert.equal("label" in projected.dimensions[0].base_components[0], false);
  assert.equal("label" in projected.jump_targets[0], false);
  assert.equal(serialized.includes("natural-language"), false);
  assert.equal(serialized.includes("unstable prose"), false);
  assert.equal(projected.semantic.main_issue_id, "issue:combat_timing");
});

test("golden projection derives available dimension coverage from rows", () => {
  const report = atomicReportFixture();
  report.dimension_coverage = 10;
  const suppressed = report.score_card.dimensions.at(-1);
  suppressed.available = false;
  suppressed.base_score = null;
  suppressed.behavior_modifier = null;
  suppressed.final_score = null;
  suppressed.score = null;

  const projected = projectGoldenReport({
    matchId: "fixture",
    slot: 0,
    report,
  });

  assert.equal(projected.dimension_coverage, 9);
});

test("score and atomic component drift over policy thresholds need approval", () => {
  const expectedReport = atomicReportFixture();
  const actualReport = atomicReportFixture();
  for (const dimension of actualReport.score_card.dimensions) {
    dimension.base_components[0].normalized_score = 86;
    dimension.base_components[0].weighted_contribution = 64.5;
    dimension.base_score = 74.5;
    dimension.final_score = 74.5;
    dimension.score = 74.5;
  }
  actualReport.score_card.base_score = 74.5;
  actualReport.score_card.final_score = 74.5;
  actualReport.score_card.overall_score = 74.5;
  const expected = projectGoldenReport({
    matchId: "fixture",
    slot: 0,
    report: expectedReport,
  });
  const actual = projectGoldenReport({
    matchId: "fixture",
    slot: 0,
    report: actualReport,
  });

  const diff = compareGolden(expected, actual, {
    scoreTolerance: 3,
    componentTolerance: 5,
  });

  assert.equal(diff.valid, false);
  assert.ok(diff.approvalRequired.some((item) =>
    item.path === "score_card.final_score"));
  assert.ok(diff.approvalRequired.some((item) =>
    item.path === "dimensions.lane_execution.final_score"));
  assert.ok(diff.approvalRequired.some((item) =>
    item.path
      === "dimensions.lane_execution.base_components.lane_model_score.normalized_score"));
  assert.deepEqual(diff.hardFailures, []);
});

test("semantic, coverage, and confidence-boundary drift need approval", () => {
  const expected = goldenFixture();
  const actual = structuredClone(expected);
  expected.role_confidence = 74;
  actual.role_confidence = 75;
  actual.dimension_coverage = 2;
  actual.semantic.main_issue_id = "issue:resource_conversion";

  const diff = compareGolden(expected, actual);

  assert.ok(diff.approvalRequired.some((item) =>
    item.path === "role_confidence"));
  assert.ok(diff.approvalRequired.some((item) =>
    item.path === "dimension_coverage"));
  assert.ok(diff.approvalRequired.some((item) =>
    item.path === "semantic.main_issue_id"));
});

test("protocol keys and missing jump targets are hard Golden failures", () => {
  const expected = goldenFixture();
  expected.dimensions = [{
    key: "lane_execution",
    available: true,
    final_score: 70,
    base_components: [{ key: "lane_model_score", normalized_score: 70 }],
  }];
  expected.jump_targets = [{
    id: "jump:fight-1",
    module: "combat",
    entity_type: "fight",
    entity_id: "fight-1",
    time: 120,
  }];
  const actual = structuredClone(expected);
  actual.dimensions[0].key = "lane_changed";
  actual.jump_targets = [];

  const diff = compareGolden(expected, actual);

  assert.equal(diff.valid, false);
  assert.ok(diff.hardFailures.some((item) =>
    item.path === "dimensions.keys"));
  assert.ok(diff.hardFailures.some((item) =>
    item.path === "jump_targets.jump:fight-1"));
});

test("scoring component identity changes are hard Golden failures", () => {
  const expected = projectGoldenReport({
    matchId: "fixture",
    slot: 0,
    report: atomicReportFixture(),
  });
  expected.dimensions[0].scoring_components = [{
    key: "effect:one",
    dimension: "lane_execution",
    score_path: "modifier",
    applied_delta: 0,
    dedupe_key: "effect:one",
    dedupe_status: "applied_unique",
  }];
  const actual = structuredClone(expected);
  actual.dimensions[0].scoring_components[0].key = "effect:renamed";

  const diff = compareGolden(expected, actual);

  assert.ok(diff.hardFailures.some((item) =>
    item.path === "dimensions.lane_execution.scoring_components.keys"));
});

test("Golden integrity corruption is a hard failure, never approval drift", () => {
  const expected = projectGoldenReport({
    matchId: "fixture",
    slot: 0,
    report: atomicReportFixture(),
  });
  const actual = structuredClone(expected);
  const dimension = actual.dimensions[0];
  dimension.final_score = 71;
  dimension.base_components[0].effective_local_weight = 74;
  dimension.scoring_components = [
    {
      key: "first",
      dimension: "lane_execution",
      score_path: "modifier",
      applied_delta: -1,
      dedupe_key: "effect:duplicate",
      dedupe_status: "applied_unique",
    },
    {
      key: "second",
      dimension: "lane_execution",
      score_path: "modifier",
      applied_delta: -1,
      dedupe_key: "effect:duplicate",
      dedupe_status: "applied_unique",
    },
  ];

  const diff = compareGolden(expected, actual);

  assert.equal(diff.valid, false);
  assert.ok(diff.hardFailures.some((item) =>
    item.reason === "formula_error"));
  assert.ok(diff.hardFailures.some((item) =>
    item.reason === "base_component_weight_sum_mismatch"));
  assert.ok(diff.hardFailures.some((item) =>
    item.reason === "duplicate_applied_dedupe_key"));
  assert.ok(!diff.approvalRequired.some((item) =>
    item.path === "dimensions.lane_execution.final_score"));
});

test("drift at policy thresholds remains valid without approval", () => {
  const expected = goldenFixture({ finalScore: 70 });
  const actual = goldenFixture({ finalScore: 73 });

  const diff = compareGolden(expected, actual, {
    scoreTolerance: 3,
    componentTolerance: 5,
  });

  assert.equal(diff.valid, true);
  assert.deepEqual(diff.hardFailures, []);
  assert.deepEqual(diff.approvalRequired, []);
});

test("validate-analysis CLI reads a split analysis without network access", () => {
  const root = mkdtempSync(resolve(tmpdir(), "dota-lens-regression-"));
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
    const players = bundleFixture();
    for (const player of Object.values(players.by_slot)) {
      player.report.score_card.audit.model = "player-report-score-audit/1.0";
      player.report.score_card.audit.recomputation_valid = true;
    }
    writeFileSync(
      resolve(analysisDirectory, moduleBase, "players.json.gz"),
      gzipSync(JSON.stringify(players)),
    );

    const run = spawnSync(
      process.execPath,
      [TOOL, "validate-analysis", matchId, root],
      { encoding: "utf8" },
    );
    const result = JSON.parse(run.stdout);

    assert.equal(run.status, 0);
    assert.equal(result.schema, "player-report-regression-validation/1.0");
    assert.equal(result.playerReports, 10);
    assert.equal(result.valid, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
