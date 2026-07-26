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
  PLAYER_REPORT_ROLE_WEIGHTS,
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
const round4 = (value) => Math.round(value * 10000) / 10000;

function makeDimensionUnavailable(report, index, status = "missing") {
  const dimensions = report.score_card.dimensions;
  const dimension = dimensions[index];
  dimension.available = false;
  dimension.effective_weight = 0;
  dimension.base_score = null;
  dimension.behavior_modifier = null;
  dimension.final_score = null;
  dimension.score = null;
  dimension.status = status;
  delete dimension.modifier_cap;
  for (const component of dimension.base_components) {
    component.available = false;
    component.normalized_score = null;
    component.effective_local_weight = 0;
    component.weighted_contribution = null;
    component.confidence = 0;
    component.missing_reason = `fixture_${status}`;
  }
  const availableWeight = dimensions.reduce(
    (sum, row) => sum + (row.available ? row.weight : 0),
    0,
  );
  for (const row of dimensions) {
    row.effective_weight = row.available
      ? round4(row.weight * 100 / availableWeight)
      : 0;
  }
  report.dimension_coverage = dimensions.filter((row) => row.available).length;
  return dimension;
}

test("exports the canonical Java role dimension-weight templates", () => {
  assert.deepEqual(PLAYER_REPORT_ROLE_WEIGHTS, {
    "1": [15, 20, 15, 5, 15, 8, 10, 7, 2, 3],
    "2": [17, 12, 8, 15, 14, 10, 8, 7, 3, 6],
    "3": [15, 8, 7, 15, 8, 20, 10, 8, 5, 4],
    "4": [12, 3, 5, 20, 5, 20, 7, 5, 16, 7],
    "5": [15, 2, 4, 15, 3, 18, 7, 5, 23, 8],
  });
});

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

test("complete validation requires exact slot keys zero through nine", () => {
  const players = bundleFixture();
  const replacement = players.by_slot["9"];
  delete players.by_slot["9"];
  replacement.report.slot = 10;
  players.by_slot["10"] = replacement;

  const result = validatePlayerReportBundle(players, { requireAtomic: true });

  assert.ok(result.errors.includes("missing_slot=9"));
  assert.ok(result.errors.includes("extra_slot=10"));
  assert.ok(result.errors.includes("invalid_slot_key=10"));
});

test("complete validation rejects nonnumeric slot map keys", () => {
  const players = bundleFixture();
  const replacement = players.by_slot["9"];
  delete players.by_slot["9"];
  players.by_slot.invalid = replacement;

  const result = validatePlayerReportBundle(players, { requireAtomic: true });

  assert.ok(result.errors.includes("missing_slot=9"));
  assert.ok(result.errors.includes("extra_slot=invalid"));
  assert.ok(result.errors.includes("invalid_slot_key=invalid"));
});

test("report slot identity must be a bound finite in-range integer", () => {
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -1, 10, 1.5, "2"]) {
    const players = bundleFixture();
    players.by_slot["2"].report.slot = value;

    const result = validatePlayerReportBundle(players, { requireAtomic: true });

    assert.ok(
      result.errors.some((error) =>
        error.startsWith("slot 2: report_slot_invalid=")),
      `report.slot=${String(value)}`,
    );
  }

  const players = bundleFixture();
  players.by_slot["3"].report.slot = 4;
  const result = validatePlayerReportBundle(players, { requireAtomic: true });
  assert.ok(result.errors.includes("slot 3: report_slot_mismatch=4/3"));
});

test("duplicate report slot identities cannot satisfy ten-player coverage", () => {
  const players = bundleFixture();
  players.by_slot["1"].report.slot = 0;

  const result = validatePlayerReportBundle(players, { requireAtomic: true });

  assert.ok(result.errors.includes("duplicate_report_slot=0:0,1"));
});

test("fixtures use canonical role templates and preserve a 70 overall score", () => {
  for (let position = 1; position <= 5; position += 1) {
    const report = atomicReportFixture({ position });
    assert.deepEqual(
      report.score_card.dimensions.map((dimension) => dimension.weight),
      PLAYER_REPORT_ROLE_WEIGHTS[String(position)],
    );
    assert.deepEqual(
      report.score_card.dimensions.map((dimension) => dimension.effective_weight),
      PLAYER_REPORT_ROLE_WEIGHTS[String(position)],
    );
    assert.equal(report.score_card.base_score, 70);
    assert.equal(report.score_card.final_score, 70);
  }
});

test("dimension raw and effective weights must match the canonical role template", () => {
  const cases = [
    ["weight", 999, "weight_mismatch=999/15"],
    ["weight", Number.POSITIVE_INFINITY, "weight_invalid=Infinity"],
    ["weight", -1, "weight_invalid=-1"],
    ["effective_weight", 999, "effective_weight_mismatch=999/15"],
    [
      "effective_weight",
      Number.POSITIVE_INFINITY,
      "effective_weight_invalid=Infinity",
    ],
  ];
  for (const [field, value, diagnostic] of cases) {
    const players = bundleFixture();
    players.by_slot["0"].report.score_card.dimensions[0][field] = value;

    const result = validatePlayerReportBundle(players, { requireAtomic: true });

    assert.ok(
      result.errors.includes(`slot 0: lane_execution:${diagnostic}`),
      `${field}=${String(value)}`,
    );
  }
});

test("available effective weights renormalize canonical weights to one hundred", () => {
  const players = bundleFixture();
  const report = players.by_slot["0"].report;
  makeDimensionUnavailable(report, 1, "suppressed");

  const valid = validatePlayerReportBundle(players, { requireAtomic: true });
  assert.equal(valid.valid, true);
  assert.equal(
    round4(report.score_card.dimensions
      .filter((dimension) => dimension.available)
      .reduce((sum, dimension) => sum + dimension.effective_weight, 0)),
    100,
  );

  report.score_card.dimensions[0].effective_weight =
    report.score_card.dimensions[0].weight;
  const stale = validatePlayerReportBundle(players, { requireAtomic: true });
  assert.ok(stale.errors.some((error) =>
    error.includes("lane_execution:effective_weight_mismatch=")));
  assert.ok(stale.errors.some((error) =>
    error.includes("effective_weight_sum_mismatch=")));
});

test("unavailable dimensions require zero effective weight", () => {
  for (const value of [1, 999, Number.POSITIVE_INFINITY]) {
    const players = bundleFixture();
    const dimension = makeDimensionUnavailable(
      players.by_slot["0"].report,
      0,
    );
    dimension.effective_weight = value;

    const result = validatePlayerReportBundle(players, { requireAtomic: true });

    assert.ok(result.errors.some((error) =>
      error.startsWith(
        "slot 0: lane_execution:unavailable_effective_weight_must_be_zero=",
      )));
  }
});

test("missing and suppressed dimensions preserve nonnumeric component evidence", () => {
  for (const status of ["missing", "suppressed"]) {
    const players = bundleFixture();
    const dimension = makeDimensionUnavailable(
      players.by_slot["0"].report,
      0,
      status,
    );

    const result = validatePlayerReportBundle(players, { requireAtomic: true });

    assert.equal(result.valid, true, status);
    assert.ok(dimension.base_components.every((component) =>
      component.available === false
      && component.normalized_score === null
      && component.effective_local_weight === 0
      && component.weighted_contribution === null
      && component.missing_reason === `fixture_${status}`));
  }
});

test("unavailable dimensions reject missing, zero, stale, and non-finite scores", () => {
  const cases = [
    ["base_score", "delete"],
    ["base_score", 0],
    ["behavior_modifier", -1],
    ["final_score", 0],
    ["score", 70],
    ["score", Number.POSITIVE_INFINITY],
  ];
  for (const [field, value] of cases) {
    const players = bundleFixture();
    const dimension = makeDimensionUnavailable(
      players.by_slot["0"].report,
      0,
    );
    if (value === "delete") delete dimension[field];
    else dimension[field] = value;

    const result = validatePlayerReportBundle(players, { requireAtomic: true });

    assert.ok(
      result.errors.some((error) =>
        error.startsWith(
          `slot 0: lane_execution:unavailable_${field}_must_be_null=`,
        )),
      `${field}=${String(value)}`,
    );
  }
});

test("available dimensions require finite scores and an available atomic calculation", () => {
  for (const field of [
    "base_score",
    "behavior_modifier",
    "final_score",
    "score",
  ]) {
    for (const value of [null, Number.POSITIVE_INFINITY]) {
      const players = bundleFixture();
      players.by_slot["0"].report.score_card.dimensions[0][field] = value;

      const result = validatePlayerReportBundle(players, { requireAtomic: true });

      assert.ok(
        result.errors.some((error) =>
          error.startsWith(
            `slot 0: lane_execution:available_${field}_invalid=`,
          )),
        `${field}=${String(value)}`,
      );
    }
  }

  const players = bundleFixture();
  const components = players.by_slot["0"].report.score_card.dimensions[0]
    .base_components;
  for (const component of components) {
    component.available = false;
    component.normalized_score = null;
    component.effective_local_weight = 0;
    component.weighted_contribution = null;
    component.confidence = 0;
  }
  const result = validatePlayerReportBundle(players, { requireAtomic: true });
  assert.ok(result.errors.includes(
    "slot 0: lane_execution:available_atomic_calculation_missing",
  ));
});

test("unavailable dimensions reject an available atomic calculation", () => {
  const players = bundleFixture();
  const dimension = makeDimensionUnavailable(players.by_slot["0"].report, 0);
  const component = dimension.base_components[0];
  component.available = true;
  component.normalized_score = 80;
  component.effective_local_weight = 100;
  component.weighted_contribution = 80;
  component.confidence = 90;

  const result = validatePlayerReportBundle(players, { requireAtomic: true });

  assert.ok(result.errors.includes(
    "slot 0: lane_execution:unavailable_atomic_calculation_present",
  ));
});

test("current reports require score_card.final_score and only check overall_score as alias", () => {
  const missing = bundleFixture();
  delete missing.by_slot["0"].report.score_card.final_score;
  const missingResult = validatePlayerReportBundle(
    missing,
    { requireAtomic: true },
  );
  assert.ok(missingResult.errors.includes(
    "slot 0: score_card.final_score=missing",
  ));

  const mismatch = bundleFixture();
  mismatch.by_slot["0"].report.score_card.overall_score = 71;
  const mismatchResult = validatePlayerReportBundle(
    mismatch,
    { requireAtomic: true },
  );
  assert.ok(mismatchResult.errors.includes(
    "slot 0: score_card.overall_score_mismatch=71/70",
  ));
});

test("legacy non-atomic validation may retain overall_score fallback", () => {
  const players = bundleFixture({ atomic: false });
  for (const player of Object.values(players.by_slot)) {
    delete player.report.score_card.final_score;
  }

  const result = validatePlayerReportBundle(players, { requireAtomic: false });

  assert.equal(result.valid, true);
  assert.ok(result.reports.every((report) => report.final_score === 70));
});

test("server audit validation accepts every current producer declaration", () => {
  const result = validatePlayerReportBundle(
    bundleFixture({ serverAudit: true }),
    { requireAtomic: true, requireServerAudit: true },
  );

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("server audit validation reports absent field-specific markers", () => {
  const players = bundleFixture({ serverAudit: true });
  const report = players.by_slot["0"].report;
  delete report.score_card.audit.formula_version;
  delete report.score_card.audit.score_path_counts.modifier;
  delete report.score_card.audit.limits.root_negative_overall;
  delete report.score_card.audit.overall_cap.negative_limit;
  delete report.score_card.dimensions[0].modifier_cap.negative_limit;
  delete report.root_causes[0].scoring_summary.root_cap;

  const result = validatePlayerReportBundle(players, {
    requireAtomic: true,
    requireServerAudit: true,
  });

  for (const diagnostic of [
    "audit.formula_version=missing",
    "audit.score_path_counts.modifier=missing",
    "audit.limits.root_negative_overall=missing",
    "audit.overall_cap.negative_limit=missing",
    "lane_execution.modifier_cap.negative_limit=missing",
    "root_causes.root:combat_timing.scoring_summary.root_cap=missing",
  ]) {
    assert.ok(
      result.errors.includes(`slot 0: ${diagnostic}`),
      diagnostic,
    );
  }
});

test("server audit validation rejects every conflicting declaration family", () => {
  const players = bundleFixture({ serverAudit: true });
  const report = players.by_slot["0"].report;
  const audit = report.score_card.audit;
  Object.assign(audit, {
    formula_version: "player-report/3.0",
    dimension_formula: "wrong",
    overall_formula: "wrong",
    weight_denominator: 99,
    recomputed_base_score: 71,
    recomputed_final_score: 71,
    recomputed_behavior_modifier: 1,
    recomputation_tolerance: 0.1,
    recomputation_valid: false,
    base_component_model: "existing_dimension_model",
    atomic_dimension_count: 9,
    aggregate_fallback_count: 1,
    duplicate_suppressed_count: 1,
  });
  audit.score_path_counts.embedded = 1;
  audit.limits.root_negative_overall = 7;
  audit.limits.dimension_negative = -14;
  audit.limits.dimension_positive = 9;
  audit.limits.overall_negative = -11;
  audit.limits.overall_positive = 7;
  audit.overall_cap.after_cap = 1;
  audit.overall_cap.negative_limit = -11;
  report.score_card.dimensions[0].modifier_cap.negative_limit = -14;
  report.root_causes[0].scoring_summary.root_cap = 7;

  const result = validatePlayerReportBundle(players, {
    requireAtomic: true,
    requireServerAudit: true,
  });

  for (const diagnostic of [
    "audit.formula_version_mismatch",
    "audit.dimension_formula_mismatch",
    "audit.overall_formula_mismatch",
    "audit.weight_denominator_mismatch",
    "audit.recomputed_base_score_mismatch",
    "audit.recomputed_final_score_mismatch",
    "audit.recomputed_behavior_modifier_mismatch",
    "audit.recomputation_tolerance_mismatch",
    "audit.recomputation_valid_mismatch",
    "audit.base_component_model_mismatch",
    "audit.atomic_dimension_count_mismatch",
    "audit.aggregate_fallback_count_mismatch",
    "audit.score_path_counts.embedded_mismatch",
    "audit.duplicate_suppressed_count_mismatch",
    "audit.limits.root_negative_overall_mismatch",
    "audit.limits.dimension_negative_mismatch",
    "audit.limits.dimension_positive_mismatch",
    "audit.limits.overall_negative_mismatch",
    "audit.limits.overall_positive_mismatch",
    "audit.overall_cap.after_cap_mismatch",
    "audit.overall_cap.negative_limit_mismatch",
    "lane_execution.modifier_cap.negative_limit_mismatch",
    "root_causes.root:combat_timing.scoring_summary.root_cap_mismatch",
  ]) {
    assert.ok(
      result.errors.some((error) =>
        error.startsWith(`slot 0: ${diagnostic}`)),
      diagnostic,
    );
  }
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
    applied_delta: -700 / 17,
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
      applied_delta: -601 / 17,
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

test("Golden jump targets compare canonical full payloads without order drift", () => {
  const first = {
    id: "jump:fight-1",
    module: "combat",
    entity_type: "fight",
    entity_id: "fight-1",
    player_slot: 0,
    time: 123.5,
    range_start: 118,
    range_end: 130,
    map_focus: {
      coordinate_valid: true,
      x: 0.25,
      y: 0.75,
      region: "radiant_jungle",
      coordinate_space: "normalized",
      coordinate_source: "replay",
      coordinate_version: "1",
      location_confidence: 90,
    },
  };
  const second = {
    id: "jump:ward-2",
    module: "vision",
    entity_type: "ward",
    entity_id: "ward-2",
    player_slot: 0,
    time: 240,
    range_start: 238,
    range_end: 245,
  };
  const orderedReport = atomicReportFixture();
  orderedReport.jump_targets = [first, second];
  const reversedReport = atomicReportFixture();
  reversedReport.jump_targets = [second, first];
  const ordered = projectGoldenReport({
    matchId: "fixture",
    slot: 0,
    report: orderedReport,
  });
  const reversed = projectGoldenReport({
    matchId: "fixture",
    slot: 0,
    report: reversedReport,
  });

  assert.deepEqual(reversed.jump_targets, ordered.jump_targets);
  assert.deepEqual(compareGolden(ordered, reversed), {
    schema: "player-report-golden-diff/1.0",
    valid: true,
    hardFailures: [],
    approvalRequired: [],
    changes: [],
  });

  const removed = structuredClone(ordered);
  removed.jump_targets.pop();
  const removedDiff = compareGolden(ordered, removed);
  assert.ok(removedDiff.hardFailures.some((item) =>
    item.reason === "jump_target_missing"));

  const changed = structuredClone(ordered);
  changed.jump_targets[0].range_end += 1;
  changed.jump_targets[0].map_focus.region = "river";
  const changedDiff = compareGolden(ordered, changed);
  assert.ok(changedDiff.hardFailures.some((item) =>
    item.reason === "jump_target_payload_changed"));

  const added = structuredClone(ordered);
  added.jump_targets.push({
    id: "jump:rune-3",
    module: "map",
    entity_type: "rune",
    entity_id: "rune-3",
    player_slot: 0,
    time: 360,
    range_start: 359,
    range_end: 362,
  });
  const addedDiff = compareGolden(ordered, added);
  assert.deepEqual(addedDiff.hardFailures, []);
  assert.ok(addedDiff.approvalRequired.some((item) =>
    item.reason === "jump_target_added"));

  const reordered = structuredClone(ordered);
  reordered.jump_targets.reverse();
  assert.equal(compareGolden(ordered, reordered).valid, true);
});

test("Golden jump-target duplicate identities are hard failures", () => {
  const report = atomicReportFixture();
  report.jump_targets = [
    {
      id: "jump:fight-1",
      module: "combat",
      entity_type: "fight",
      entity_id: "fight-1",
      player_slot: 0,
      time: 120,
    },
    {
      id: "jump:fight-1",
      module: "combat",
      entity_type: "fight",
      entity_id: "fight-2",
      player_slot: 0,
      time: 130,
    },
  ];
  assert.throws(
    () => projectGoldenReport({ matchId: "fixture", slot: 0, report }),
    /duplicate_jump_target_identity=jump:fight-1/,
  );

  const expected = goldenFixture();
  expected.jump_targets = [report.jump_targets[0]];
  const actual = structuredClone(expected);
  actual.jump_targets.push(structuredClone(actual.jump_targets[0]));
  const diff = compareGolden(expected, actual);
  assert.ok(diff.hardFailures.some((item) =>
    item.reason === "duplicate_jump_target_identity"));
  assert.deepEqual(diff.approvalRequired, []);
});

test("Golden projection retains stable weights and score aliases for integrity", () => {
  const projected = projectGoldenReport({
    matchId: "fixture",
    slot: 0,
    report: atomicReportFixture(),
  });

  assert.equal(projected.dimensions[0].weight, 15);
  assert.equal(projected.dimensions[0].effective_weight, 15);
  assert.equal(projected.dimensions[0].score, 70);
});

test("Golden integrity hard-fails absent and non-finite required numbers", () => {
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

  const cases = [
    ["score_card.final_score", (actual) => {
      delete actual.score_card.final_score;
    }],
    ["dimensions.lane_execution.weight", (actual) => {
      actual.dimensions[0].weight = Number.POSITIVE_INFINITY;
    }],
    [
      "dimensions.lane_execution.base_components.lane_model_score"
        + ".weighted_contribution",
      (actual) => {
        actual.dimensions[0].base_components[0].weighted_contribution =
          Number.NaN;
      },
    ],
    [
      "dimensions.lane_execution.scoring_components.effect:one.applied_delta",
      (actual) => {
        delete actual.dimensions[0].scoring_components[0].applied_delta;
      },
    ],
  ];
  for (const [path, mutate] of cases) {
    const actual = structuredClone(expected);
    mutate(actual);
    const diff = compareGolden(expected, actual);
    assert.ok(
      diff.hardFailures.some((item) =>
        item.path === path
        && item.reason === "required_number_missing_or_nonfinite"),
      path,
    );
    assert.deepEqual(diff.approvalRequired, [], path);
  }
});

test("Golden integrity recomputes modifiers, dimension scores, and weighted overall", () => {
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

  const staleModifier = structuredClone(expected);
  staleModifier.dimensions[0].scoring_components[0].applied_delta = -4;
  const modifierDiff = compareGolden(expected, staleModifier);
  assert.ok(modifierDiff.hardFailures.some((item) =>
    item.path === "dimensions.lane_execution.behavior_modifier"
    && item.reason === "modifier_formula_error"));

  const staleWeight = structuredClone(expected);
  staleWeight.dimensions[0].effective_weight = 14;
  const weightDiff = compareGolden(expected, staleWeight);
  assert.ok(weightDiff.hardFailures.some((item) =>
    item.path === "dimensions.effective_weight_sum"
    && item.reason === "effective_weight_sum_mismatch"));

  const staleOverall = structuredClone(expected);
  staleOverall.score_card.base_score = 74;
  staleOverall.score_card.final_score = 74;
  const overallDiff = compareGolden(expected, staleOverall);
  assert.ok(overallDiff.hardFailures.some((item) =>
    item.path === "score_card.base_score"
    && item.reason === "weighted_overall_mismatch"));
  assert.ok(overallDiff.hardFailures.some((item) =>
    item.path === "score_card.final_score"
    && item.reason === "weighted_overall_mismatch"));

  const overflow = structuredClone(expected);
  overflow.dimensions[0].base_score = Number.MAX_VALUE;
  overflow.dimensions[0].final_score = Number.MAX_VALUE;
  overflow.dimensions[0].score = Number.MAX_VALUE;
  const overflowDiff = compareGolden(expected, overflow);
  assert.ok(overflowDiff.hardFailures.some((item) =>
    item.reason === "formula_overflow" || item.reason === "formula_error"));
  assert.deepEqual(overflowDiff.approvalRequired, []);
});

test("hard Golden corruption never also enters approval drift", () => {
  const expected = projectGoldenReport({
    matchId: "fixture",
    slot: 0,
    report: atomicReportFixture(),
  });

  const corruptOverall = structuredClone(expected);
  corruptOverall.score_card.final_score = 74;
  const overallDiff = compareGolden(expected, corruptOverall);
  assert.ok(overallDiff.hardFailures.some((item) =>
    item.path === "score_card.final_score"));
  assert.ok(!overallDiff.approvalRequired.some((item) =>
    item.path === "score_card.final_score"));

  const corruptDimension = structuredClone(expected);
  corruptDimension.dimensions[0].final_score = 74;
  corruptDimension.dimensions[0].score = 74;
  const dimensionDiff = compareGolden(expected, corruptDimension);
  assert.ok(dimensionDiff.hardFailures.some((item) =>
    item.path === "dimensions.lane_execution.final_score"));
  assert.ok(!dimensionDiff.approvalRequired.some((item) =>
    item.path === "dimensions.lane_execution.final_score"));

  const corruptAtomic = structuredClone(expected);
  corruptAtomic.dimensions[0].base_components[0].normalized_score = 86;
  const atomicDiff = compareGolden(expected, corruptAtomic);
  assert.ok(atomicDiff.hardFailures.some((item) =>
    item.path.startsWith(
      "dimensions.lane_execution.base_components.lane_model_score",
    )));
  assert.ok(!atomicDiff.approvalRequired.some((item) =>
    item.path
      === "dimensions.lane_execution.base_components.lane_model_score"
        + ".normalized_score"));
});

test("valid score and atomic drift remains approval-only above thresholds", () => {
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

  assert.deepEqual(diff.hardFailures, []);
  assert.ok(diff.approvalRequired.length > 0);
});

test("score and component drift exactly at thresholds remains valid", () => {
  const expectedReport = atomicReportFixture();
  const actualReport = atomicReportFixture();
  for (const report of [expectedReport, actualReport]) {
    const components = report.score_card.dimensions[0].base_components;
    Object.assign(components[0], {
      normalized_score: 80,
      local_weight: 50,
      effective_local_weight: 50,
      weighted_contribution: 40,
    });
    Object.assign(components[1], {
      normalized_score: 60,
      local_weight: 50,
      effective_local_weight: 50,
      weighted_contribution: 30,
    });
  }
  Object.assign(
    actualReport.score_card.dimensions[0].base_components[0],
    { normalized_score: 85, weighted_contribution: 42.5 },
  );
  Object.assign(
    actualReport.score_card.dimensions[0].base_components[1],
    { normalized_score: 55, weighted_contribution: 27.5 },
  );
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

  assert.equal(diff.valid, true);
  assert.deepEqual(diff.hardFailures, []);
  assert.deepEqual(diff.approvalRequired, []);
});

test("coherent sub-threshold applied-delta drift is recorded without approval", () => {
  const expectedReport = atomicReportFixture();
  const actualReport = atomicReportFixture();
  const scoringComponent = {
    key: "effect:one",
    dimension: "lane_execution",
    score_path: "modifier",
    applied_delta: 0,
    dedupe_key: "effect:one",
    dedupe_status: "applied_unique",
  };
  expectedReport.score_card.dimensions[0].scoring_components = [
    structuredClone(scoringComponent),
  ];
  actualReport.score_card.dimensions[0].scoring_components = [{
    ...scoringComponent,
    applied_delta: -2,
  }];
  Object.assign(actualReport.score_card.dimensions[0], {
    behavior_modifier: -2,
    final_score: 68,
    score: 68,
  });
  Object.assign(actualReport.score_card, {
    behavior_modifier: -0.3,
    final_score: 69.7,
    overall_score: 69.7,
  });
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

  assert.ok(diff.changes.some((item) =>
    item.path
      === "dimensions.lane_execution.scoring_components.effect:one.applied_delta"
    && item.expected === 0
    && item.actual === -2));
  assert.deepEqual(diff.hardFailures, []);
  assert.deepEqual(diff.approvalRequired, []);
  assert.equal(diff.valid, true);
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
    const players = bundleFixture({ serverAudit: true });
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
