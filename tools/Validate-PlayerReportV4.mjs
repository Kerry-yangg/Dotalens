import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";

const matchId = String(process.argv[2] || "8894766243");
const projectRoot = resolve(process.argv[3] || process.cwd());
const analysisDirectory = resolve(
  projectRoot,
  "tools",
  "runtime",
  "dota-lens-data",
  "analyses",
  matchId,
);
const summary = JSON.parse(readFileSync(resolve(analysisDirectory, "summary.json"), "utf8"));
const moduleBase = String(summary?.analysis_storage?.module_base || "");
if (!moduleBase) throw new Error(`Analysis ${matchId} has no split module base`);
const players = JSON.parse(gunzipSync(readFileSync(
  resolve(analysisDirectory, moduleBase, "players.json.gz"),
)));

const expectedDimensions = [
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
const tolerance = 0.05;
const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const close = (left, right) => (
  Number.isFinite(Number(left))
  && Number.isFinite(Number(right))
  && Math.abs(Number(left) - Number(right)) <= tolerance
);
const clamp = (value) => Math.max(0, Math.min(100, Number(value)));

const errors = [];
const reports = [];
const bySlot = players?.by_slot && typeof players.by_slot === "object"
  ? players.by_slot
  : {};

if (players.schema !== "player-report/4.0") {
  errors.push(`players.schema=${players.schema || "missing"}`);
}

for (const [slot, player] of Object.entries(bySlot).sort(
  ([left], [right]) => Number(left) - Number(right),
)) {
  const report = player?.report;
  const slotErrors = [];
  if (!report) {
    slotErrors.push("missing_report");
    errors.push(`slot ${slot}: missing_report`);
    continue;
  }
  if (report.model !== "player-report/4.0") slotErrors.push(`model=${report.model}`);
  const scoreCard = report.score_card || {};
  const dimensions = Array.isArray(scoreCard.dimensions)
    ? scoreCard.dimensions
    : Array.isArray(report.dimensions) ? report.dimensions : [];
  const keys = dimensions.map((dimension) => String(dimension?.key || ""));
  if (JSON.stringify(keys) !== JSON.stringify(expectedDimensions)) {
    slotErrors.push(`dimension_order=${keys.join(",")}`);
  }

  let weight = 0;
  let baseWeighted = 0;
  let finalWeighted = 0;
  const appliedDedupeKeys = new Set();
  const duplicateAppliedKeys = new Set();
  const dimensionWeights = new Map();
  for (const dimension of dimensions) {
    if (dimension?.available === false || dimension?.base_score == null) {
      if (dimension?.score != null || dimension?.final_score != null) {
        slotErrors.push(`${dimension.key}:missing_dimension_has_score`);
      }
      continue;
    }
    const components = Array.isArray(dimension.scoring_components)
      ? dimension.scoring_components
      : [];
    const modifier = round2(components.reduce(
      (sum, component) => sum + Number(component?.applied_delta || 0),
      0,
    ));
    const recomputedFinal = round2(clamp(Number(dimension.base_score) + modifier));
    if (!close(modifier, dimension.behavior_modifier)) {
      slotErrors.push(`${dimension.key}:modifier_mismatch`);
    }
    if (!close(recomputedFinal, dimension.final_score)) {
      slotErrors.push(`${dimension.key}:final_mismatch`);
    }
    for (const component of components) {
      const path = String(component?.score_path || "");
      const applied = Number(component?.applied_delta || 0);
      if ((path === "embedded" || path === "context_only") && Math.abs(applied) > tolerance) {
        slotErrors.push(`${dimension.key}:${path}_applied_${applied}`);
      }
      const dedupeKey = String(component?.dedupe_key || "");
      if (Math.abs(applied) <= tolerance || !dedupeKey) continue;
      if (appliedDedupeKeys.has(dedupeKey)) duplicateAppliedKeys.add(dedupeKey);
      else appliedDedupeKeys.add(dedupeKey);
    }
    const effectiveWeight = Number(dimension.effective_weight || 0);
    dimensionWeights.set(String(dimension?.key || ""), effectiveWeight);
    weight += effectiveWeight;
    baseWeighted += Number(dimension.base_score) * effectiveWeight;
    finalWeighted += recomputedFinal * effectiveWeight;
  }
  if (duplicateAppliedKeys.size) {
    slotErrors.push(`duplicate_applied_keys=${[...duplicateAppliedKeys].join(",")}`);
  }
  const recomputedBase = weight > 0 ? round2(baseWeighted / weight) : null;
  const recomputedFinal = weight > 0 ? round2(finalWeighted / weight) : null;
  const recomputedModifier = recomputedBase == null || recomputedFinal == null
    ? null
    : round2(recomputedFinal - recomputedBase);
  if (!close(recomputedBase, scoreCard.base_score)) slotErrors.push("overall_base_mismatch");
  if (!close(recomputedFinal, scoreCard.final_score)) slotErrors.push("overall_final_mismatch");
  if (!close(recomputedModifier, scoreCard.behavior_modifier)) {
    slotErrors.push("overall_modifier_mismatch");
  }

  const roots = Array.isArray(report.root_causes) ? report.root_causes : [];
  const rootImpacts = roots.flatMap((root) => (
    Array.isArray(root?.scoring_impacts) ? root.scoring_impacts : []
  ));
  const pathCounts = { embedded: 0, modifier: 0, context_only: 0 };
  for (const impact of rootImpacts) {
    if (Object.prototype.hasOwnProperty.call(pathCounts, impact?.score_path)) {
      pathCounts[impact.score_path] += 1;
    }
  }
  const rootPenalties = roots.map((root) => {
    const impacts = Array.isArray(root?.scoring_impacts) ? root.scoring_impacts : [];
    const recomputed = round2(impacts.reduce((sum, impact) => {
      const applied = Number(impact?.applied_delta || 0);
      if (applied >= 0) return sum;
      const effectiveWeight = Number(dimensionWeights.get(String(impact?.dimension || "")) || 0);
      return sum + (-applied * effectiveWeight / 100);
    }, 0));
    const stored = Number(root?.scoring_summary?.applied_negative_overall || 0);
    if (!close(recomputed, stored)) {
      slotErrors.push(`root_penalty_summary_mismatch=${stored}/${recomputed}`);
    }
    return recomputed;
  });
  const maxRootPenalty = Math.max(0, ...rootPenalties);
  if (maxRootPenalty > 6 + tolerance) {
    slotErrors.push(`root_penalty_recomputed=${maxRootPenalty}`);
  }
  if (scoreCard?.audit?.model !== "player-report-score-audit/1.0") {
    slotErrors.push("missing_score_audit");
  }
  if (scoreCard?.audit?.recomputation_valid !== true) {
    slotErrors.push("server_recomputation_invalid");
  }

  for (const error of slotErrors) errors.push(`slot ${slot}: ${error}`);
  reports.push({
    slot: Number(slot),
    position: Number(report.position || 0),
    base_score: Number(scoreCard.base_score),
    behavior_modifier: Number(scoreCard.behavior_modifier),
    final_score: Number(scoreCard.final_score),
    available_dimensions: dimensions.filter((dimension) => dimension?.available !== false
      && dimension?.base_score != null).length,
    path_counts: pathCounts,
    applied_modifiers: rootImpacts.filter(
      (impact) => Math.abs(Number(impact?.applied_delta || 0)) > tolerance,
    ).length,
    duplicate_suppressed: rootImpacts.filter(
      (impact) => impact?.dedupe_status === "suppressed_duplicate",
    ).length,
    max_root_negative_overall: round2(maxRootPenalty),
    valid: slotErrors.length === 0,
    errors: slotErrors,
  });
}

if (reports.length !== 10) errors.push(`player_report_count=${reports.length}`);
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
