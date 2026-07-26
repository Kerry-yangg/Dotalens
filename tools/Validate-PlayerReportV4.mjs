import { resolve } from "node:path";
import {
  loadPlayerReportAnalysis,
  validatePlayerReportBundle,
} from "./player-report-regression.mjs";

const matchId = String(process.argv[2] || "8894766243");
const projectRoot = resolve(process.argv[3] || process.cwd());
const { players } = loadPlayerReportAnalysis(matchId, projectRoot);
const validation = validatePlayerReportBundle(players, {
  requireAtomic: true,
  requireServerAudit: true,
});
const { errors, reports } = validation;
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
  duplicate_applied_key_count: errors.filter(
    (error) => error.includes("duplicate_applied_keys"),
  ).length,
  max_root_negative_overall: Math.max(
    0,
    ...reports.map((report) => report.max_root_negative_overall),
  ),
  valid: errors.length === 0,
  errors,
  reports,
};

console.log(JSON.stringify(result, null, 2));
if (!result.valid) process.exitCode = 1;
