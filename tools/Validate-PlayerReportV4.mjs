import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  compareGolden,
  loadPlayerReportAnalysis,
  projectGoldenReport,
  validatePlayerReportBundle,
} from "./player-report-regression.mjs";

const matchId = String(process.argv[2] || "8894766243");
const projectRoot = resolve(process.argv[3] || process.cwd());
const goldenPath = String(process.argv[4] || "");
const goldenSlot = Number(process.argv[5]);
const { players } = loadPlayerReportAnalysis(matchId, projectRoot);
const validation = validatePlayerReportBundle(players, {
  requireAtomic: true,
  requireServerAudit: true,
});
const errors = [...validation.errors];
const { reports } = validation;
let goldenTotal = 0;
let goldenPassed = 0;
let goldenDiff = null;
if (goldenPath) {
  goldenTotal = 1;
  try {
    if (!Number.isInteger(goldenSlot) || goldenSlot < 0 || goldenSlot > 9) {
      throw new Error(`Invalid Golden slot ${process.argv[5]}`);
    }
    const expected = JSON.parse(readFileSync(resolve(goldenPath), "utf8"));
    const report = players?.by_slot?.[String(goldenSlot)]?.report;
    if (!report) throw new Error(`Missing player report slot ${goldenSlot}`);
    const actual = projectGoldenReport({
      matchId,
      slot: goldenSlot,
      report,
    });
    goldenDiff = compareGolden(expected, actual);
    if (goldenDiff.valid) {
      goldenPassed = 1;
    } else {
      const failures = [
        ...goldenDiff.hardFailures,
        ...goldenDiff.approvalRequired,
      ].map((failure) => `${failure.reason}@${failure.path}`);
      errors.push(`Golden validation failed: ${failures.join(", ")}`);
    }
  } catch (error) {
    errors.push(`Golden validation failed: ${error.message}`);
  }
}
const behaviorModifiers = reports.map((report) => report.behavior_modifier)
  .filter(Number.isFinite);
const result = {
  schema: "dota-lens-player-report-v4-regression/1.0",
  match_id: Number(matchId),
  player_module_schema: players.schema || null,
  player_reports: reports.length,
  valid_reports: reports.filter((report) => report.valid).length,
  behavior_modifier_range: behaviorModifiers.length
    ? [Math.min(...behaviorModifiers), Math.max(...behaviorModifiers)]
    : [],
  aggregate_fallback_count: validation.aggregateFallbackCount,
  duplicate_applied_key_count: validation.duplicateAppliedKeyCount,
  max_root_negative_overall: validation.maxRootNegativeOverall,
  golden_total: goldenTotal,
  golden_passed: goldenPassed,
  golden_diff: goldenDiff,
  valid: errors.length === 0,
  errors,
  reports,
};

console.log(JSON.stringify(result, null, 2));
if (!result.valid) process.exitCode = 1;
