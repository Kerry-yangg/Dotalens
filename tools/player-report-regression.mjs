import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
} from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";

const REPORT_MODEL = "player-report/4.0";
const ATOMIC_MODEL = "player-report-base-components/1.0";
const EVENT_CANDIDATE_MODEL = "player-report-event-candidates/1.1";
const VALIDATION_SCHEMA = "player-report-regression-validation/1.0";
const GOLDEN_SCHEMA = "player-report-golden/1.0";
const SCORE_TOLERANCE = 0.05;
const LOCAL_WEIGHT_SUM_TOLERANCE = 0.01;
const ROOT_NEGATIVE_OVERALL_CAP = 6;
const DIMENSION_NEGATIVE_CAP = -15;
const DIMENSION_POSITIVE_CAP = 10;
const OVERALL_NEGATIVE_CAP = -12;
const OVERALL_POSITIVE_CAP = 8;
const APPLIED_EPSILON = 0.0001;
const SCORE_PATHS = new Set(["embedded", "modifier", "context_only"]);
const AUDIT_MODEL = "player-report-score-audit/1.0";
const DIMENSION_FORMULA = "clamp(base_score + sum(applied_delta), 0, 100)";
const OVERALL_FORMULA =
  "sum(dimension_score * effective_weight) / sum(effective_weight)";
const PROPOSAL_PROVENANCE_SCHEMA = "player-report-golden-proposal-provenance/1.0";
const DEFAULT_FILE_SYSTEM = {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
};

export const PLAYER_REPORT_DIMENSIONS = Object.freeze([
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
]);

export const PLAYER_REPORT_ROLE_WEIGHTS = Object.freeze({
  "1": Object.freeze([15, 20, 15, 5, 15, 8, 10, 7, 2, 3]),
  "2": Object.freeze([17, 12, 8, 15, 14, 10, 8, 7, 3, 6]),
  "3": Object.freeze([15, 8, 7, 15, 8, 20, 10, 8, 5, 4]),
  "4": Object.freeze([12, 3, 5, 20, 5, 20, 7, 5, 16, 7]),
  "5": Object.freeze([15, 2, 4, 15, 3, 18, 7, 5, 23, 8]),
});

const isRecord = (value) => (
  value != null && typeof value === "object" && !Array.isArray(value)
);
const finiteJsonNumber = (value) => (
  typeof value === "number" && Number.isFinite(value) ? value : null
);
const finiteNumber = (value) => {
  if (value == null
      || typeof value === "boolean"
      || typeof value === "object"
      || (typeof value === "string" && value.trim() === "")) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const round2 = (value) => (
  Math.round((Number(value) + Number.EPSILON) * 100) / 100
);
const round4 = (value) => Math.round(Number(value) * 10000) / 10000;
const clampScore = (value) => Math.max(0, Math.min(100, Number(value)));
const close = (left, right, tolerance = SCORE_TOLERANCE) => {
  const leftNumber = finiteNumber(left);
  const rightNumber = finiteNumber(right);
  return leftNumber != null
    && rightNumber != null
    && Math.abs(leftNumber - rightNumber) <= tolerance;
};
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function recomputeBaseComponents(components) {
  const sourceComponents = Array.isArray(components) ? components : [];
  const rows = sourceComponents.map((component, index) => {
    const source = isRecord(component) ? component : null;
    const key = source == null ? "" : String(source.key ?? "").trim();
    const available = source?.available === true;
    const localWeight = finiteJsonNumber(source?.local_weight);
    const normalizedScore = source?.normalized_score === null
      ? null
      : finiteJsonNumber(source?.normalized_score);
    const confidence = finiteJsonNumber(source?.confidence);
    const storedEffectiveWeight = finiteJsonNumber(source?.effective_local_weight);
    const storedContribution = source?.weighted_contribution === null
      ? null
      : finiteJsonNumber(source?.weighted_contribution);
    const malformed = source == null
      || !key
      || typeof source.available !== "boolean"
      || localWeight == null
      || localWeight <= 0
      || confidence == null
      || confidence < 0
      || confidence > 100
      || storedEffectiveWeight == null
      || storedEffectiveWeight < 0
      || storedEffectiveWeight > 100
      || (available && (
        normalizedScore == null
        || normalizedScore < 0
        || normalizedScore > 100
      ))
      || (available && (
        storedContribution == null
        || storedContribution < 0
        || storedContribution > 100
      ))
      || (!available && (
        source.normalized_score !== null
        || storedEffectiveWeight !== 0
        || source.weighted_contribution !== null
      ));
    return {
      index,
      key,
      available,
      localWeight,
      normalizedScore,
      storedEffectiveWeight,
      storedContribution,
      malformed,
      recomputedEffectiveWeight: malformed ? null : 0,
      recomputedContribution: null,
      issues: malformed ? ["base_component_malformed"] : [],
    };
  });

  const keyCounts = new Map();
  for (const row of rows) {
    if (row.key) keyCounts.set(row.key, (keyCounts.get(row.key) || 0) + 1);
  }
  for (const row of rows) {
    if (row.key && keyCounts.get(row.key) > 1) {
      row.issues.push("base_component_duplicate_key");
    }
  }

  const availableRows = rows.filter((row) => row.available && !row.malformed);
  const maximumWeight = availableRows.reduce(
    (maximum, row) => Math.max(maximum, row.localWeight),
    0,
  );
  const scaledDenominator = maximumWeight > 0
    ? availableRows.reduce((sum, row) => sum + row.localWeight / maximumWeight, 0)
    : 0;
  const canRecompute = scaledDenominator > 0 && Number.isFinite(scaledDenominator);
  let recomputedScore = null;
  if (canRecompute) {
    let exactScore = 0;
    let roundedWeightTotal = 0;
    let roundedContributionTotal = 0;
    for (const row of availableRows) {
      const effectiveWeight = row.localWeight / maximumWeight * 100 / scaledDenominator;
      const contribution = clampScore(row.normalizedScore) * effectiveWeight / 100;
      row.recomputedEffectiveWeight = round4(effectiveWeight);
      row.recomputedContribution = round4(contribution);
      roundedWeightTotal += row.recomputedEffectiveWeight;
      roundedContributionTotal += row.recomputedContribution;
      exactScore += contribution;
    }
    const last = availableRows.at(-1);
    last.recomputedEffectiveWeight = round4(
      last.recomputedEffectiveWeight + 100 - roundedWeightTotal,
    );
    last.recomputedContribution = round4(
      last.recomputedContribution + round4(exactScore) - roundedContributionTotal,
    );
    recomputedScore = round2(clampScore(exactScore));
  }

  const storedScore = availableRows.length && availableRows.every(
    (row) => row.storedContribution != null,
  )
    ? round2(availableRows.reduce((sum, row) => sum + row.storedContribution, 0))
    : null;
  const weightSum = availableRows.length && availableRows.every(
    (row) => row.storedEffectiveWeight != null,
  )
    ? round4(availableRows.reduce((sum, row) => sum + row.storedEffectiveWeight, 0))
    : null;

  for (const row of rows) {
    if (!row.malformed
        && row.storedEffectiveWeight != null
        && Math.abs(row.storedEffectiveWeight - row.recomputedEffectiveWeight)
          > SCORE_TOLERANCE) {
      row.issues.push("base_component_weight_mismatch");
    }
    if (row.available
        && !row.malformed
        && row.storedContribution != null
        && Math.abs(row.storedContribution - row.recomputedContribution)
          > SCORE_TOLERANCE) {
      row.issues.push("base_component_contribution_mismatch");
    }
  }

  const issues = [];
  if (!Array.isArray(components) || !rows.length || rows.some((row) => row.malformed)) {
    issues.push("base_component_malformed");
  }
  for (const issue of [
    "base_component_duplicate_key",
    "base_component_weight_mismatch",
    "base_component_contribution_mismatch",
  ]) {
    if (rows.some((row) => row.issues.includes(issue))) issues.push(issue);
  }
  if (canRecompute
      && (storedScore == null
        || Math.abs(storedScore - recomputedScore) > SCORE_TOLERANCE)) {
    issues.push("base_component_score_mismatch");
  }
  if (canRecompute
      && (weightSum == null
        || Math.abs(weightSum - 100) > LOCAL_WEIGHT_SUM_TOLERANCE)) {
    issues.push("base_component_weight_sum_mismatch");
  }

  return {
    rows,
    availableRows,
    storedScore,
    recomputedScore,
    weightSum,
    issues,
    valid: issues.length === 0,
  };
}

function appliedDuplicateKeys(components) {
  const appliedKeys = new Set();
  const duplicateKeys = new Set();
  for (const component of components) {
    const applied = finiteNumber(component?.applied_delta);
    const dedupeKey = String(component?.dedupe_key || "");
    if (applied == null || Math.abs(applied) <= APPLIED_EPSILON || !dedupeKey) {
      continue;
    }
    if (appliedKeys.has(dedupeKey)) duplicateKeys.add(dedupeKey);
    else appliedKeys.add(dedupeKey);
  }
  return duplicateKeys;
}

function appendPathDiagnostics(components, prefix, slotErrors) {
  for (const component of components) {
    const path = String(component?.score_path || "");
    const applied = finiteNumber(component?.applied_delta);
    if (!SCORE_PATHS.has(path)) {
      slotErrors.push(`${prefix}:unknown_score_path=${path || "missing"}`);
      continue;
    }
    if (applied == null) {
      slotErrors.push(`${prefix}:malformed_applied_delta`);
      continue;
    }
    if ((path === "embedded" || path === "context_only")
        && Math.abs(applied) > APPLIED_EPSILON) {
      slotErrors.push(`${prefix}:${path}_applied_${applied}`);
    }
  }
}

function atomicDiagnostics(baseComponents, dimensionKey, slotErrors) {
  const audit = recomputeBaseComponents(baseComponents);
  for (const row of audit.rows) {
    for (const issue of row.issues) {
      slotErrors.push(
        `${dimensionKey}.base_components[${row.index}]:${issue}`,
      );
    }
    if (row.key === "existing_dimension_model") {
      slotErrors.push(
        `${dimensionKey}.base_components[${row.index}]`
          + ":aggregate_component_in_current_report",
      );
    }
  }
  for (const issue of audit.issues) {
    if ([
      "base_component_malformed",
      "base_component_duplicate_key",
      "base_component_weight_mismatch",
      "base_component_contribution_mismatch",
    ].includes(issue)) {
      continue;
    }
    slotErrors.push(`${dimensionKey}:${issue}`);
  }
  return audit;
}

function displayValue(value) {
  if (value === undefined) return "missing";
  if (typeof value === "number" && Number.isNaN(value)) return "NaN";
  return String(value);
}

function expectedEffectiveWeights(dimensions, roleWeights) {
  const availableIndexes = [];
  let availableWeight = 0;
  for (let index = 0; index < dimensions.length; index += 1) {
    if (dimensions[index]?.available !== true) continue;
    availableIndexes.push(index);
    availableWeight += roleWeights?.[index] ?? 0;
  }
  const result = new Array(dimensions.length).fill(0);
  if (!(availableWeight > 0)) return result;
  let roundedTotal = 0;
  for (const index of availableIndexes) {
    result[index] = round4(roleWeights[index] * 100 / availableWeight);
    roundedTotal += result[index];
  }
  const lastIndex = availableIndexes.at(-1);
  result[lastIndex] = round4(result[lastIndex] + 100 - roundedTotal);
  return result;
}

function modifierTotal(components, field = "applied_delta") {
  return round2((Array.isArray(components) ? components : []).reduce(
    (sum, component) => {
      if (component?.score_path !== "modifier") return sum;
      const applied = finiteJsonNumber(component?.[field]);
      return sum + (applied ?? 0);
    },
    0,
  ));
}

function compareAuditDeclaration(
  slotErrors,
  object,
  key,
  expected,
  path,
  tolerance = 0,
) {
  if (!isRecord(object) || !own(object, key)) {
    slotErrors.push(`${path}=missing`);
    return;
  }
  const actual = object[key];
  let matches;
  if (typeof expected === "number") {
    matches = finiteJsonNumber(actual) != null
      && Math.abs(actual - expected) <= tolerance;
  } else {
    matches = actual === expected;
  }
  if (!matches) {
    slotErrors.push(
      `${path}_mismatch=${displayValue(actual)}/${displayValue(expected)}`,
    );
  }
}

function dimensionCapExpectation(components) {
  const rows = (Array.isArray(components) ? components : []).filter(
    (component) => component?.score_path === "modifier",
  );
  const before = rows.reduce(
    (sum, row) => sum + (finiteJsonNumber(row?.root_capped_delta) ?? 0),
    0,
  );
  const negative = rows.reduce(
    (sum, row) => sum + Math.min(0, finiteJsonNumber(row?.root_capped_delta) ?? 0),
    0,
  );
  const positive = rows.reduce(
    (sum, row) => sum + Math.max(0, finiteJsonNumber(row?.root_capped_delta) ?? 0),
    0,
  );
  let negativeFactor = 1;
  let positiveFactor = 1;
  if (before < DIMENSION_NEGATIVE_CAP && negative < 0) {
    negativeFactor = Math.max(
      0,
      Math.min(1, (DIMENSION_NEGATIVE_CAP - positive) / negative),
    );
  } else if (before > DIMENSION_POSITIVE_CAP && positive > 0) {
    positiveFactor = Math.max(
      0,
      Math.min(1, (DIMENSION_POSITIVE_CAP - negative) / positive),
    );
  }
  const after = rows.reduce((sum, row) => {
    const value = finiteJsonNumber(row?.root_capped_delta) ?? 0;
    return sum + value * (value < 0 ? negativeFactor : value > 0
      ? positiveFactor : 1);
  }, 0);
  return {
    before_dimension_cap: round2(before),
    after_dimension_cap: round2(after),
    negative_limit: DIMENSION_NEGATIVE_CAP,
    positive_limit: DIMENSION_POSITIVE_CAP,
    negative_factor: round4(negativeFactor),
    positive_factor: round4(positiveFactor),
    applied: negativeFactor < 0.99995 || positiveFactor < 0.99995,
  };
}

function overallAdjustment(dimensions, negativeFactor, positiveFactor) {
  let weighted = 0;
  let weight = 0;
  for (const dimension of dimensions) {
    if (dimension?.available !== true) continue;
    const base = finiteJsonNumber(dimension?.base_score);
    const effectiveWeight = finiteJsonNumber(dimension?.effective_weight);
    if (base == null || effectiveWeight == null) continue;
    const components = Array.isArray(dimension?.scoring_components)
      ? dimension.scoring_components
      : [];
    const modifier = components.reduce((sum, component) => {
      if (component?.score_path !== "modifier") return sum;
      const value = finiteJsonNumber(component?.dimension_capped_delta) ?? 0;
      return sum + value * (value < 0 ? negativeFactor : value > 0
        ? positiveFactor : 1);
    }, 0);
    weighted += (clampScore(base + modifier) - base) * effectiveWeight;
    weight += effectiveWeight;
  }
  return weight > 0 ? weighted / weight : 0;
}

function findOverallFactor(dimensions, negative, target) {
  let low = 0;
  let high = 1;
  for (let index = 0; index < 64; index += 1) {
    const middle = (low + high) / 2;
    const adjustment = negative
      ? overallAdjustment(dimensions, middle, 1)
      : overallAdjustment(dimensions, 1, middle);
    if (negative ? adjustment < target : adjustment > target) high = middle;
    else low = middle;
  }
  return (low + high) / 2;
}

function auditServerDeclarations({
  scoreCard,
  dimensions,
  roots,
  baseAudits,
  aggregateDimensionCount,
  recomputedBase,
  recomputedFinal,
  recomputedModifier,
  effectiveWeightSum,
  slotErrors,
}) {
  const audit = isRecord(scoreCard.audit) ? scoreCard.audit : {};
  if (audit.model !== AUDIT_MODEL) slotErrors.push("missing_score_audit");
  if (audit.recomputation_valid !== true) {
    slotErrors.push("server_recomputation_invalid");
  }

  const rootImpacts = roots.flatMap((root) => (
    Array.isArray(root?.scoring_impacts) ? root.scoring_impacts : []
  ));
  const pathCounts = { embedded: 0, modifier: 0, context_only: 0 };
  for (const impact of rootImpacts) {
    if (own(pathCounts, impact?.score_path)) pathCounts[impact.score_path] += 1;
  }
  const duplicateSuppressedCount = rootImpacts.filter(
    (impact) => impact?.dedupe_status === "suppressed_duplicate",
  ).length;
  const atomicDimensionCount = dimensions.filter(
    (dimension) => Array.isArray(dimension?.base_components)
      && dimension.base_components.length > 0,
  ).length;
  const recomputationValid = baseAudits.every((entry) => entry.audit?.valid === true);

  for (const [key, expected] of Object.entries({
    model: AUDIT_MODEL,
    formula_version: REPORT_MODEL,
    dimension_formula: DIMENSION_FORMULA,
    overall_formula: OVERALL_FORMULA,
    weight_denominator: round4(effectiveWeightSum),
    recomputed_base_score: recomputedBase,
    recomputed_final_score: recomputedFinal,
    recomputed_behavior_modifier: recomputedModifier,
    recomputation_tolerance: SCORE_TOLERANCE,
    recomputation_valid: recomputationValid,
    base_component_model: ATOMIC_MODEL,
    atomic_dimension_count: atomicDimensionCount,
    aggregate_fallback_count: aggregateDimensionCount,
    duplicate_suppressed_count: duplicateSuppressedCount,
  })) {
    const tolerance = [
      "recomputed_base_score",
      "recomputed_final_score",
      "recomputed_behavior_modifier",
    ].includes(key) ? SCORE_TOLERANCE : key === "weight_denominator"
      ? LOCAL_WEIGHT_SUM_TOLERANCE : 0;
    compareAuditDeclaration(
      slotErrors,
      audit,
      key,
      expected,
      `audit.${key}`,
      tolerance,
    );
  }
  for (const path of Object.keys(pathCounts)) {
    compareAuditDeclaration(
      slotErrors,
      audit.score_path_counts,
      path,
      pathCounts[path],
      `audit.score_path_counts.${path}`,
    );
  }
  const limits = {
    root_negative_overall: ROOT_NEGATIVE_OVERALL_CAP,
    dimension_negative: DIMENSION_NEGATIVE_CAP,
    dimension_positive: DIMENSION_POSITIVE_CAP,
    overall_negative: OVERALL_NEGATIVE_CAP,
    overall_positive: OVERALL_POSITIVE_CAP,
  };
  for (const [key, expected] of Object.entries(limits)) {
    compareAuditDeclaration(
      slotErrors,
      audit.limits,
      key,
      expected,
      `audit.limits.${key}`,
    );
  }

  const beforeOverallCap = overallAdjustment(dimensions, 1, 1);
  const negativeFactor = beforeOverallCap < OVERALL_NEGATIVE_CAP
    ? findOverallFactor(dimensions, true, OVERALL_NEGATIVE_CAP)
    : 1;
  const positiveFactor = beforeOverallCap > OVERALL_POSITIVE_CAP
    ? findOverallFactor(dimensions, false, OVERALL_POSITIVE_CAP)
    : 1;
  const overallCap = {
    before_cap: round2(beforeOverallCap),
    after_cap: recomputedModifier,
    negative_limit: OVERALL_NEGATIVE_CAP,
    positive_limit: OVERALL_POSITIVE_CAP,
    negative_factor: round4(negativeFactor),
    positive_factor: round4(positiveFactor),
    applied: negativeFactor < 0.99995 || positiveFactor < 0.99995,
  };
  for (const [key, expected] of Object.entries(overallCap)) {
    compareAuditDeclaration(
      slotErrors,
      audit.overall_cap,
      key,
      expected,
      `audit.overall_cap.${key}`,
      typeof expected === "number" ? SCORE_TOLERANCE : 0,
    );
  }

  for (const dimension of dimensions) {
    if (dimension?.available !== true) continue;
    const key = String(dimension?.key || "");
    const expectedCap = dimensionCapExpectation(dimension?.scoring_components);
    for (const [field, expected] of Object.entries(expectedCap)) {
      compareAuditDeclaration(
        slotErrors,
        dimension?.modifier_cap,
        field,
        expected,
        `${key}.modifier_cap.${field}`,
        typeof expected === "number" ? SCORE_TOLERANCE : 0,
      );
    }
  }

  const dimensionWeights = new Map(dimensions.map((dimension) => [
    String(dimension?.key || ""),
    finiteJsonNumber(dimension?.effective_weight) ?? 0,
  ]));
  for (const root of roots) {
    const id = String(root?.id || "missing");
    const impacts = Array.isArray(root?.scoring_impacts)
      ? root.scoring_impacts
      : [];
    const candidateNegative = impacts.reduce((sum, impact) => {
      const value = impact?.dedupe_status === "applied_unique"
        ? finiteJsonNumber(impact?.candidate_delta) ?? 0
        : 0;
      if (value >= 0) return sum;
      return sum + -value * (
        dimensionWeights.get(String(impact?.dimension || "")) ?? 0
      ) / 100;
    }, 0);
    const rootFactor = candidateNegative > ROOT_NEGATIVE_OVERALL_CAP
      ? ROOT_NEGATIVE_OVERALL_CAP / candidateNegative
      : 1;
    const appliedNegative = impacts.reduce((sum, impact) => {
      const value = finiteJsonNumber(impact?.applied_delta) ?? 0;
      if (value >= 0) return sum;
      return sum + -value * (
        dimensionWeights.get(String(impact?.dimension || "")) ?? 0
      ) / 100;
    }, 0);
    const appliedTotal = impacts.reduce(
      (sum, impact) => sum + (finiteJsonNumber(impact?.applied_delta) ?? 0),
      0,
    );
    const summary = {
      candidate_negative_overall: round2(candidateNegative),
      root_cap: ROOT_NEGATIVE_OVERALL_CAP,
      root_cap_factor: round4(rootFactor),
      root_cap_applied: rootFactor < 0.99995,
      duplicate_suppressed_count: impacts.filter(
        (impact) => impact?.dedupe_status === "suppressed_duplicate",
      ).length,
      applied_negative_overall: round2(appliedNegative),
      applied_modifier_total: round2(appliedTotal),
    };
    for (const [field, expected] of Object.entries(summary)) {
      compareAuditDeclaration(
        slotErrors,
        root?.scoring_summary,
        field,
        expected,
        `root_causes.${id}.scoring_summary.${field}`,
        typeof expected === "number" ? SCORE_TOLERANCE : 0,
      );
    }
  }
}

function appendEventCandidateDiagnostics(report, slotErrors, required) {
  const model = String(report?.event_candidate_model || "");
  if (!model) {
    if (required) slotErrors.push("missing_event_candidate_model");
    return;
  }
  if (model !== EVENT_CANDIDATE_MODEL) {
    slotErrors.push(`event_candidate_model=${model}`);
    return;
  }
  const candidates = Array.isArray(report?.event_candidates)
    ? report.event_candidates : null;
  const importantEvents = Array.isArray(report?.important_events)
    ? report.important_events : null;
  const stories = Array.isArray(report?.story_nodes) ? report.story_nodes : null;
  if (!candidates) slotErrors.push("event_candidates_missing");
  if (!importantEvents) slotErrors.push("important_events_missing");
  if (!stories) slotErrors.push("event_story_nodes_missing");
  if (!candidates || !importantEvents || !stories) return;

  const candidateIds = new Set();
  const selectedDedupeKeys = new Set();
  let selectedCount = 0;
  for (const candidate of candidates) {
    const id = String(candidate?.id || "");
    if (!id) slotErrors.push("event_candidate_id_missing");
    else if (candidateIds.has(id)) slotErrors.push(`event_candidate_id_duplicate=${id}`);
    else candidateIds.add(id);
    if (candidate?.selected !== true) continue;
    selectedCount += 1;
    const dedupeKey = String(candidate?.dedupe_key || "");
    if (!dedupeKey) slotErrors.push(`event_candidate_dedupe_missing=${id}`);
    else if (selectedDedupeKeys.has(dedupeKey)) {
      slotErrors.push(`event_candidate_selected_duplicate=${dedupeKey}`);
    } else selectedDedupeKeys.add(dedupeKey);
  }

  const momentIds = new Set();
  const momentDedupeKeys = new Set();
  for (const event of importantEvents) {
    const id = String(event?.id || "");
    const dedupeKey = String(event?.dedupe_key || "");
    if (!id) slotErrors.push("important_event_id_missing");
    else if (momentIds.has(id)) slotErrors.push(`important_event_id_duplicate=${id}`);
    else momentIds.add(id);
    if (!dedupeKey) slotErrors.push(`important_event_dedupe_missing=${id}`);
    else if (momentDedupeKeys.has(dedupeKey)) {
      slotErrors.push(`important_event_dedupe_duplicate=${dedupeKey}`);
    } else momentDedupeKeys.add(dedupeKey);

    const importance = finiteJsonNumber(event?.importance_score);
    if (importance == null || importance < 60 || importance > 100) {
      slotErrors.push(
        `important_event_score_invalid=${id}:${displayValue(event?.importance_score)}`,
      );
    }
    const relatedTypes = uniqueSortedStrings(event?.related_event_types);
    if (!relatedTypes.length) slotErrors.push(`important_event_types_missing=${id}`);
    const sourceIds = uniqueSortedStrings(event?.source_candidate_ids);
    if (!sourceIds.length) slotErrors.push(`important_event_sources_missing=${id}`);
    for (const sourceId of sourceIds) {
      if (!candidateIds.has(sourceId)) {
        slotErrors.push(`important_event_source_unknown=${id}:${sourceId}`);
      }
    }

    const jump = event?.jump_target;
    const entityType = String(jump?.entity_type || "");
    const entityId = String(jump?.entity_id || "");
    const start = finiteJsonNumber(jump?.range_start);
    const end = finiteJsonNumber(jump?.range_end);
    const focus = jump?.map_focus;
    const region = String(focus?.region || "");
    const x = finiteJsonNumber(focus?.x);
    const y = finiteJsonNumber(focus?.y);
    const coordinates = focus?.coordinate_valid === true
      && x != null && y != null && x >= 0 && x <= 100 && y >= 0 && y <= 100;
    const located = coordinates || Boolean(
      region && !["unknown", "未定位"].includes(region),
    );
    if (!entityType || !entityId) slotErrors.push(`important_event_entity_missing=${id}`);
    if (start == null || end == null || end <= start) {
      slotErrors.push(`important_event_range_invalid=${id}`);
    }
    if (!located) slotErrors.push(`important_event_location_missing=${id}`);
  }
  if (selectedCount !== importantEvents.length) {
    slotErrors.push(
      `important_event_selection_count=${selectedCount}/${importantEvents.length}`,
    );
  }
  if (stories.length !== importantEvents.length) {
    slotErrors.push(
      `important_event_story_count=${stories.length}/${importantEvents.length}`,
    );
  }
  for (const dedupeKey of momentDedupeKeys) {
    if (!selectedDedupeKeys.has(dedupeKey)) {
      slotErrors.push(`important_event_without_selected_candidate=${dedupeKey}`);
    }
  }
}

export function validatePlayerReportBundle(players, options = {}) {
  const requireAtomic = options.requireAtomic === true;
  const requireServerAudit = options.requireServerAudit === true;
  const requireEventPool = options.requireEventPool === true;
  const errors = [];
  const reports = [];
  const positionCounts = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  let aggregateFallbackCount = 0;
  let duplicateAppliedKeyCount = 0;
  const bySlot = isRecord(players?.by_slot) ? players.by_slot : {};
  const expectedSlots = new Set(Array.from({ length: 10 }, (_, index) =>
    String(index)));
  const actualSlots = Object.keys(bySlot);
  for (const slot of expectedSlots) {
    if (!own(bySlot, slot)) errors.push(`missing_slot=${slot}`);
  }
  for (const slot of actualSlots) {
    if (!expectedSlots.has(slot)) {
      errors.push(`extra_slot=${slot}`);
      errors.push(`invalid_slot_key=${slot}`);
    }
  }
  const reportSlotKeys = new Map();

  if (players?.schema !== REPORT_MODEL) {
    errors.push(`players.schema=${players?.schema || "missing"}`);
  }
  if (requireAtomic && players?.base_component_model !== ATOMIC_MODEL) {
    errors.push(
      `players.base_component_model=${players?.base_component_model || "missing"}`,
    );
  }

  for (const [slot, player] of Object.entries(bySlot).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0)) {
    const report = player?.report;
    const slotErrors = [];
    if (!isRecord(report)) {
      errors.push(`slot ${slot}: missing_report`);
      continue;
    }

    const scoreCard = isRecord(report.score_card) ? report.score_card : {};
    const atomicModel = (
      report.base_component_model
      ?? scoreCard.base_component_model
      ?? players?.base_component_model
    ) === ATOMIC_MODEL;
    if (report.model !== REPORT_MODEL) slotErrors.push(`model=${report.model}`);
    if (scoreCard.model && scoreCard.model !== REPORT_MODEL) {
      slotErrors.push(`score_card.model=${scoreCard.model}`);
    }
    if (requireAtomic && !atomicModel) slotErrors.push("missing_atomic_component_model");
    appendEventCandidateDiagnostics(report, slotErrors, requireEventPool);

    const slotNumber = Number(slot);
    const reportSlot = report.slot;
    const reportSlotValid = typeof reportSlot === "number"
      && Number.isFinite(reportSlot)
      && Number.isInteger(reportSlot)
      && reportSlot >= 0
      && reportSlot <= 9;
    if (!reportSlotValid) {
      slotErrors.push(`report_slot_invalid=${displayValue(reportSlot)}`);
    } else {
      const keys = reportSlotKeys.get(reportSlot) ?? [];
      keys.push(slot);
      reportSlotKeys.set(reportSlot, keys);
      if (expectedSlots.has(slot) && reportSlot !== slotNumber) {
        slotErrors.push(`report_slot_mismatch=${reportSlot}/${slot}`);
      }
    }

    const positionValue = report.position;
    const position = typeof positionValue === "number"
      && Number.isFinite(positionValue)
      && Number.isInteger(positionValue)
      ? positionValue
      : 0;
    const roleWeights = PLAYER_REPORT_ROLE_WEIGHTS[String(position)];
    if (own(positionCounts, String(position))) positionCounts[String(position)] += 1;
    else slotErrors.push(`position=${position || "missing"}`);
    const expectedRoleCode = position ? `position_${position}` : "";
    const roleCode = String(report.role_code || "");
    if (expectedRoleCode
        && (atomicModel || requireAtomic)
        && roleCode !== expectedRoleCode) {
      slotErrors.push(
        `role_template_mismatch=${roleCode || "missing"}/${expectedRoleCode}`,
      );
    } else if (roleCode && expectedRoleCode && roleCode !== expectedRoleCode) {
      slotErrors.push(`role_template_mismatch=${roleCode}/${expectedRoleCode}`);
    }

    const dimensions = Array.isArray(scoreCard.dimensions)
      ? scoreCard.dimensions
      : Array.isArray(report.dimensions) ? report.dimensions : [];
    const keys = dimensions.map((dimension) => String(dimension?.key || ""));
    if (JSON.stringify(keys) !== JSON.stringify(PLAYER_REPORT_DIMENSIONS)) {
      slotErrors.push(`dimension_order=${keys.join(",")}`);
    }

    const expectedWeights = expectedEffectiveWeights(dimensions, roleWeights ?? []);
    let weight = 0;
    let baseWeighted = 0;
    let finalWeighted = 0;
    const dimensionWeights = new Map();
    const dimensionComponents = [];
    const baseAudits = [];
    let aggregateDimensionCount = 0;
    for (let index = 0; index < dimensions.length; index += 1) {
      const dimension = dimensions[index];
      const dimensionKey = String(dimension?.key || "");
      const baseComponents = Array.isArray(dimension?.base_components)
        ? dimension.base_components
        : [];
      const aggregateCount = baseComponents.filter(
        (component) => String(component?.key || "") === "existing_dimension_model",
      ).length;
      aggregateFallbackCount += aggregateCount;
      if (aggregateCount) aggregateDimensionCount += 1;
      const baseAudit = (atomicModel || requireAtomic)
        ? atomicDiagnostics(baseComponents, dimensionKey, slotErrors)
        : null;
      if (baseAudit) baseAudits.push({ key: dimensionKey, audit: baseAudit });

      const components = Array.isArray(dimension?.scoring_components)
        ? dimension.scoring_components
        : [];
      dimensionComponents.push(...components);
      appendPathDiagnostics(components, dimensionKey, slotErrors);

      const strictCurrent = atomicModel || requireAtomic;
      const expectedRawWeight = roleWeights?.[index];
      const rawWeight = finiteJsonNumber(dimension?.weight);
      if (strictCurrent && (rawWeight == null || rawWeight < 0)) {
        slotErrors.push(
          `${dimensionKey}:weight_invalid=${displayValue(dimension?.weight)}`,
        );
      } else if (strictCurrent && expectedRawWeight != null
          && Math.abs(rawWeight - expectedRawWeight) > LOCAL_WEIGHT_SUM_TOLERANCE) {
        slotErrors.push(
          `${dimensionKey}:weight_mismatch=${rawWeight}/${expectedRawWeight}`,
        );
      }

      const available = strictCurrent
        ? dimension?.available === true
        : dimension?.available !== false && dimension?.base_score != null;
      const effectiveWeight = finiteJsonNumber(dimension?.effective_weight);
      if (!available) {
        if (strictCurrent) {
          if (effectiveWeight !== 0) {
            slotErrors.push(
              `${dimensionKey}:unavailable_effective_weight_must_be_zero=`
                + displayValue(dimension?.effective_weight),
            );
          }
          for (const field of [
            "base_score",
            "behavior_modifier",
            "final_score",
            "score",
          ]) {
            if (!own(dimension, field) || dimension[field] !== null) {
              slotErrors.push(
                `${dimensionKey}:unavailable_${field}_must_be_null=`
                  + displayValue(dimension?.[field]),
              );
            }
          }
          if ((baseAudit?.availableRows?.length ?? 0) > 0) {
            slotErrors.push(`${dimensionKey}:unavailable_atomic_calculation_present`);
          }
        } else if (dimension?.score != null || dimension?.final_score != null) {
          slotErrors.push(`${dimensionKey}:missing_dimension_has_score`);
        }
        dimensionWeights.set(dimensionKey, 0);
        continue;
      }

      if (strictCurrent) {
        for (const field of [
          "base_score",
          "behavior_modifier",
          "final_score",
          "score",
        ]) {
          if (finiteJsonNumber(dimension?.[field]) == null) {
            slotErrors.push(
              `${dimensionKey}:available_${field}_invalid=`
                + displayValue(dimension?.[field]),
            );
          }
        }
        if (!(baseAudit?.availableRows?.length > 0)) {
          slotErrors.push(`${dimensionKey}:available_atomic_calculation_missing`);
        }
      }
      const modifier = modifierTotal(components);
      const dimensionBase = finiteJsonNumber(dimension?.base_score);
      const recomputedDimensionFinal = dimensionBase == null
        ? null
        : round2(clampScore(dimensionBase + modifier));
      if (!close(modifier, dimension.behavior_modifier)) {
        slotErrors.push(`${dimensionKey}:modifier_mismatch`);
      }
      if (!close(recomputedDimensionFinal, dimension.final_score)) {
        slotErrors.push(`${dimensionKey}:final_mismatch`);
      }
      if (dimension?.score != null && !close(dimension.score, dimension.final_score)) {
        slotErrors.push(`${dimensionKey}:score_alias_mismatch`);
      }
      if ((atomicModel || requireAtomic) && !close(
        dimension.base_score,
        baseAudit?.recomputedScore,
        SCORE_TOLERANCE,
      )) {
        const diagnostic = `${dimensionKey}:base_component_score_mismatch`;
        if (!slotErrors.includes(diagnostic)) slotErrors.push(diagnostic);
      }

      if (strictCurrent && (effectiveWeight == null || effectiveWeight <= 0)) {
        slotErrors.push(
          `${dimensionKey}:effective_weight_invalid=`
            + displayValue(dimension?.effective_weight),
        );
      } else if (strictCurrent
          && Math.abs(effectiveWeight - expectedWeights[index])
            > LOCAL_WEIGHT_SUM_TOLERANCE) {
        slotErrors.push(
          `${dimensionKey}:effective_weight_mismatch=`
            + `${effectiveWeight}/${expectedWeights[index]}`,
        );
      }
      const usableWeight = effectiveWeight ?? 0;
      dimensionWeights.set(dimensionKey, usableWeight);
      weight += usableWeight;
      if (dimensionBase != null) baseWeighted += dimensionBase * usableWeight;
      if (recomputedDimensionFinal != null) {
        finalWeighted += recomputedDimensionFinal * usableWeight;
      }
    }
    if ((atomicModel || requireAtomic)
        && Math.abs(weight - 100) > LOCAL_WEIGHT_SUM_TOLERANCE) {
      slotErrors.push(`effective_weight_sum_mismatch=${round4(weight)}/100`);
    }

    const roots = Array.isArray(report.root_causes) ? report.root_causes : [];
    const rootImpacts = roots.flatMap((root) => (
      Array.isArray(root?.scoring_impacts) ? root.scoring_impacts : []
    ));
    for (const root of roots) {
      appendPathDiagnostics(
        Array.isArray(root?.scoring_impacts) ? root.scoring_impacts : [],
        `root_causes.${String(root?.id || "missing")}`,
        slotErrors,
      );
    }
    const duplicateKeys = new Set([
      ...appliedDuplicateKeys(dimensionComponents),
      ...appliedDuplicateKeys(rootImpacts),
    ]);
    if (duplicateKeys.size) {
      duplicateAppliedKeyCount += duplicateKeys.size;
      slotErrors.push(`duplicate_applied_keys=${[...duplicateKeys].sort().join(",")}`);
    }

    const recomputedBase = weight > 0 ? round2(baseWeighted / weight) : null;
    const recomputedFinal = weight > 0 ? round2(finalWeighted / weight) : null;
    const recomputedModifier = recomputedBase == null || recomputedFinal == null
      ? null
      : round2(recomputedFinal - recomputedBase);
    if (!close(recomputedBase, scoreCard.base_score)) {
      slotErrors.push("overall_base_mismatch");
    }
    const currentReport = atomicModel || requireAtomic;
    let storedFinal;
    if (currentReport) {
      if (finiteJsonNumber(scoreCard.final_score) == null) {
        slotErrors.push(
          `score_card.final_score=${own(scoreCard, "final_score")
            ? displayValue(scoreCard.final_score) : "missing"}`,
        );
      }
      storedFinal = finiteJsonNumber(scoreCard.final_score);
      if (own(scoreCard, "overall_score")
          && (finiteJsonNumber(scoreCard.overall_score) == null
            || !close(scoreCard.overall_score, scoreCard.final_score))) {
        slotErrors.push(
          `score_card.overall_score_mismatch=`
            + `${displayValue(scoreCard.overall_score)}/`
            + `${displayValue(scoreCard.final_score)}`,
        );
      }
    } else {
      storedFinal = finiteNumber(scoreCard.final_score ?? scoreCard.overall_score);
    }
    if (!close(recomputedFinal, storedFinal)) {
      slotErrors.push("overall_final_mismatch");
    }
    if (!close(recomputedModifier, scoreCard.behavior_modifier)) {
      slotErrors.push("overall_modifier_mismatch");
    }

    const pathCounts = { embedded: 0, modifier: 0, context_only: 0 };
    for (const impact of rootImpacts) {
      if (own(pathCounts, impact?.score_path)) pathCounts[impact.score_path] += 1;
    }
    const rootPenalties = roots.map((root) => {
      const impacts = Array.isArray(root?.scoring_impacts) ? root.scoring_impacts : [];
      const recomputed = round2(impacts.reduce((sum, impact) => {
        const applied = finiteNumber(impact?.applied_delta) ?? 0;
        if (applied >= 0) return sum;
        const effectiveWeight = dimensionWeights.get(
          String(impact?.dimension || ""),
        ) ?? 0;
        return sum + (-applied * effectiveWeight / 100);
      }, 0));
      const stored = finiteNumber(
        root?.scoring_summary?.applied_negative_overall,
      ) ?? 0;
      if (!close(recomputed, stored)) {
        slotErrors.push(`root_penalty_summary_mismatch=${stored}/${recomputed}`);
      }
      return recomputed;
    });
    const maxRootPenalty = Math.max(0, ...rootPenalties);
    if (maxRootPenalty > ROOT_NEGATIVE_OVERALL_CAP) {
      slotErrors.push(`root_penalty_recomputed=${maxRootPenalty}`);
    }

    if (requireServerAudit) {
      auditServerDeclarations({
        scoreCard,
        dimensions,
        roots,
        baseAudits,
        aggregateDimensionCount,
        recomputedBase,
        recomputedFinal,
        recomputedModifier,
        effectiveWeightSum: weight,
        slotErrors,
      });
    }

    for (const error of slotErrors) errors.push(`slot ${slot}: ${error}`);
    reports.push({
      slot: Number(slot),
      position,
      base_score: Number(scoreCard.base_score),
      behavior_modifier: Number(scoreCard.behavior_modifier),
      final_score: Number(storedFinal),
      available_dimensions: dimensions.filter(
        (dimension) => dimension?.available !== false
          && dimension?.base_score != null,
      ).length,
      path_counts: pathCounts,
      applied_modifiers: rootImpacts.filter(
        (impact) => Math.abs(finiteNumber(impact?.applied_delta) ?? 0)
          > SCORE_TOLERANCE,
      ).length,
      duplicate_suppressed: rootImpacts.filter(
        (impact) => impact?.dedupe_status === "suppressed_duplicate",
      ).length,
      max_root_negative_overall: round2(maxRootPenalty),
      valid: slotErrors.length === 0,
      errors: slotErrors,
    });
  }

  for (const [reportSlot, keys] of reportSlotKeys) {
    if (keys.length > 1) {
      errors.push(`duplicate_report_slot=${reportSlot}:${keys.join(",")}`);
    }
  }
  if (reports.length !== 10) errors.push(`player_report_count=${reports.length}`);
  for (const [position, count] of Object.entries(positionCounts)) {
    if (count !== 2) errors.push(`position_count_${position}=${count}`);
  }

  return {
    schema: VALIDATION_SCHEMA,
    playerReports: reports.length,
    validReports: reports.filter((report) => report.valid).length,
    positionCounts,
    aggregateFallbackCount,
    duplicateAppliedKeyCount,
    maxRootNegativeOverall: Math.max(
      0,
      ...reports.map((report) => report.max_root_negative_overall),
    ),
    reports,
    errors,
    valid: errors.length === 0,
  };
}

function projectNumber(value) {
  return finiteJsonNumber(value);
}

function projectBaseComponent(component) {
  return {
    key: String(component?.key || ""),
    available: component?.available === true,
    normalized_score: projectNumber(component?.normalized_score),
    local_weight: projectNumber(component?.local_weight),
    effective_local_weight: projectNumber(component?.effective_local_weight),
    weighted_contribution: projectNumber(component?.weighted_contribution),
    confidence: projectNumber(component?.confidence),
  };
}

function projectScoringComponent(component) {
  return {
    key: String(component?.key || ""),
    dimension: String(component?.dimension || ""),
    score_path: String(component?.score_path || ""),
    applied_delta: projectNumber(component?.applied_delta),
    dedupe_key: String(component?.dedupe_key || ""),
    dedupe_status: String(component?.dedupe_status || ""),
  };
}

function projectDimension(dimension) {
  return {
    key: String(dimension?.key || ""),
    available: dimension?.available !== false,
    weight: projectNumber(dimension?.weight),
    effective_weight: projectNumber(dimension?.effective_weight),
    base_score: projectNumber(dimension?.base_score),
    behavior_modifier: projectNumber(dimension?.behavior_modifier),
    final_score: projectNumber(dimension?.final_score),
    score: projectNumber(dimension?.score),
    base_components: Array.isArray(dimension?.base_components)
      ? dimension.base_components.map(projectBaseComponent)
      : [],
    scoring_components: Array.isArray(dimension?.scoring_components)
      ? dimension.scoring_components.map(projectScoringComponent)
      : [],
  };
}

function collectJumpTargetSources(report) {
  const targets = [];
  const seen = new WeakSet();
  const visit = (value, key = "") => {
    if (value == null || typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);
    if ((key === "jump_target" || key === "jumpTarget") && isRecord(value)) {
      targets.push(value);
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    for (const [childKey, child] of Object.entries(value)) visit(child, childKey);
  };
  if (Array.isArray(report?.jump_targets)) targets.push(...report.jump_targets);
  visit(report);
  return targets;
}

function projectMapFocus(value) {
  if (!isRecord(value)) return null;
  return {
    coordinate_valid: value.coordinate_valid === true || value.coordinateValid === true,
    x: projectNumber(value.x),
    y: projectNumber(value.y),
    region: String(value.region || ""),
    coordinate_space: String(value.coordinate_space ?? value.coordinateSpace ?? ""),
    coordinate_source: String(value.coordinate_source ?? value.coordinateSource ?? ""),
    coordinate_version: String(value.coordinate_version ?? value.coordinateVersion ?? ""),
    location_confidence: projectNumber(
      value.location_confidence ?? value.locationConfidence,
    ),
  };
}

function projectJumpTarget(target) {
  const projected = {
    id: String(target?.id || ""),
    module: String(target?.module || ""),
    entity_type: String(target?.entity_type ?? target?.entityType ?? ""),
    entity_id: String(target?.entity_id ?? target?.entityId ?? ""),
    player_slot: projectNumber(target?.player_slot ?? target?.playerSlot),
    time: projectNumber(target?.time),
    range_start: projectNumber(target?.range_start ?? target?.rangeStart),
    range_end: projectNumber(target?.range_end ?? target?.rangeEnd),
  };
  const mapFocus = projectMapFocus(target?.map_focus ?? target?.mapFocus);
  if (mapFocus) projected.map_focus = mapFocus;
  return projected;
}

function jumpTargetIdentity(target) {
  return String(target?.id || [
    target?.module,
    target?.entity_type,
    target?.entity_id,
    target?.player_slot,
    target?.time,
  ].join("|"));
}

function uniqueSortedStrings(value) {
  return [...new Set(
    (Array.isArray(value) ? value : [])
      .map((item) => String(item || ""))
      .filter(Boolean),
  )].sort();
}

function projectSemantic(report) {
  const semantic = isRecord(report?.semantic) ? report.semantic : {};
  const brief = isRecord(report?.brief) ? report.brief : {};
  const semanticStrengths = uniqueSortedStrings(semantic.strength_ids);
  return {
    strength_ids: semanticStrengths.length > 0
      ? semanticStrengths
      : uniqueSortedStrings(brief.strengths),
    main_issue_id: String(
      semantic.main_issue_id
      || (Array.isArray(brief.priorities) ? brief.priorities[0] : "")
      || "",
    ),
    training_target_id: String(
      semantic.training_target_id
      || (Array.isArray(brief.training_plan) ? brief.training_plan[0] : "")
      || "",
    ),
  };
}

function projectMainStrengthId(report, semantic) {
  const sourceSemantic = isRecord(report?.semantic) ? report.semantic : {};
  const brief = isRecord(report?.brief) ? report.brief : {};
  return String(
    sourceSemantic.main_strength_id
    || (Array.isArray(sourceSemantic.strength_ids)
      ? sourceSemantic.strength_ids[0] : "")
    || (Array.isArray(brief.strengths) ? brief.strengths[0] : "")
    || semantic.strength_ids[0]
    || "",
  );
}

function projectEventCandidateSummary(report) {
  const candidates = Array.isArray(report?.event_candidates)
    ? report.event_candidates : [];
  const typeCounts = {};
  let selected = 0;
  for (const candidate of candidates) {
    const type = String(candidate?.event_type || "unknown");
    typeCounts[type] = (typeCounts[type] || 0) + 1;
    if (candidate?.selected === true) selected += 1;
  }
  return {
    total: candidates.length,
    selected,
    type_counts: Object.fromEntries(
      Object.entries(typeCounts).sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0),
    ),
  };
}

function projectImportantEvent(event) {
  const jump = projectJumpTarget(event?.jump_target ?? event?.jumpTarget);
  return {
    id: String(event?.id || ""),
    dedupe_key: String(event?.dedupe_key ?? event?.dedupeKey ?? ""),
    kind: String(event?.kind || ""),
    importance_score: projectNumber(
      event?.importance_score ?? event?.importanceScore,
    ),
    time_start: projectNumber(event?.time_start ?? event?.timeStart),
    time_end: projectNumber(event?.time_end ?? event?.timeEnd),
    related_event_types: uniqueSortedStrings(
      event?.related_event_types ?? event?.relatedEventTypes,
    ),
    source_candidate_ids: uniqueSortedStrings(
      event?.source_candidate_ids ?? event?.sourceCandidateIds,
    ),
    jump_target_identity: jumpTargetIdentity(jump),
  };
}

export function projectGoldenReport({ matchId, slot, report }) {
  const scoreCard = isRecord(report?.score_card) ? report.score_card : {};
  const dimensions = Array.isArray(scoreCard.dimensions)
    ? scoreCard.dimensions
    : Array.isArray(report?.dimensions) ? report.dimensions : [];
  const rootCauseIds = uniqueSortedStrings(
    (Array.isArray(report?.root_causes) ? report.root_causes : [])
      .map((root) => root?.id),
  );
  const jumpTargetsByIdentity = new Map();
  for (const source of collectJumpTargetSources(report)) {
    const projected = projectJumpTarget(source);
    const identity = jumpTargetIdentity(projected);
    if (jumpTargetsByIdentity.has(identity)) {
      if (!arrayEqual(jumpTargetsByIdentity.get(identity), projected)) {
        throw new Error(`duplicate_jump_target_identity=${identity}`);
      }
      continue;
    }
    jumpTargetsByIdentity.set(identity, projected);
  }
  const jumpTargets = [...jumpTargetsByIdentity.entries()]
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([, target]) => target);
  const semantic = projectSemantic(report);
  const importantEvents = (Array.isArray(report?.important_events)
    ? report.important_events : [])
    .map(projectImportantEvent)
    .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);

  return {
    schema: GOLDEN_SCHEMA,
    match_id: String(matchId),
    slot: Number(slot),
    position: Number(report?.position || 0),
    role_confidence: projectNumber(report?.role_confidence),
    dimension_coverage: dimensions.filter(
      (dimension) => dimension?.available !== false
        && dimension?.base_score != null,
    ).length,
    score_card: {
      base_score: projectNumber(scoreCard.base_score),
      behavior_modifier: projectNumber(scoreCard.behavior_modifier),
      final_score: projectNumber(scoreCard.final_score ?? scoreCard.overall_score),
    },
    dimensions: dimensions.map(projectDimension),
    semantic: {
      strength_ids: semantic.strength_ids,
      main_issue_id: semantic.main_issue_id,
      training_target_id: semantic.training_target_id,
      root_cause_ids: rootCauseIds,
    },
    event_candidate_model: String(report?.event_candidate_model || ""),
    event_candidate_summary: projectEventCandidateSummary(report),
    important_events: importantEvents,
    jump_targets: jumpTargets,
  };
}

function diffItem(path, expected, actual, reason) {
  return { path, expected, actual, reason };
}

function arrayEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function recordChange(changes, path, expected, actual) {
  if (!arrayEqual(expected, actual)) {
    changes.push({ path, expected, actual });
    return true;
  }
  return false;
}

function indexByKey(rows) {
  return new Map(
    (Array.isArray(rows) ? rows : []).map((row) => [String(row?.key || ""), row]),
  );
}

function pushUniqueDiff(items, item) {
  if (!items.some((candidate) =>
    candidate.path === item.path && candidate.reason === item.reason)) {
    items.push(item);
  }
}

function requireGoldenNumber(hardFailures, object, key, path) {
  const value = object?.[key];
  if (!isRecord(object) || !own(object, key) || finiteJsonNumber(value) == null) {
    pushUniqueDiff(hardFailures, diffItem(
      path,
      "finite number",
      own(object ?? {}, key) ? value : undefined,
      "required_number_missing_or_nonfinite",
    ));
    return null;
  }
  return value;
}

function appendGoldenIntegrityFailures(actual, hardFailures) {
  const scoreCard = isRecord(actual?.score_card) ? actual.score_card : {};
  const base = requireGoldenNumber(
    hardFailures,
    scoreCard,
    "base_score",
    "score_card.base_score",
  );
  const modifier = requireGoldenNumber(
    hardFailures,
    scoreCard,
    "behavior_modifier",
    "score_card.behavior_modifier",
  );
  const finalScore = requireGoldenNumber(
    hardFailures,
    scoreCard,
    "final_score",
    "score_card.final_score",
  );
  if (base != null && modifier != null && finalScore != null) {
    const formulaFinal = round2(base + modifier);
    if (!Number.isFinite(formulaFinal)) {
      pushUniqueDiff(hardFailures, diffItem(
        "score_card.final_score",
        "finite base + modifier",
        formulaFinal,
        "formula_overflow",
      ));
    } else if (Math.abs(formulaFinal - finalScore) > SCORE_TOLERANCE) {
      pushUniqueDiff(hardFailures, diffItem(
        "score_card.final_score",
        formulaFinal,
        finalScore,
        "formula_error",
      ));
    }
  }

  const dimensions = Array.isArray(actual?.dimensions) ? actual.dimensions : [];
  const roleWeights = PLAYER_REPORT_ROLE_WEIGHTS[String(actual?.position)];
  const expectedWeights = expectedEffectiveWeights(dimensions, roleWeights ?? []);
  const allScoringComponents = [];
  let effectiveWeightSum = 0;
  let baseWeighted = 0;
  let finalWeighted = 0;
  let weightedFormulaValid = dimensions.length > 0;

  for (let index = 0; index < dimensions.length; index += 1) {
    const dimension = dimensions[index];
    const key = String(dimension?.key || "");
    const prefix = `dimensions.${key}`;
    const rawWeight = requireGoldenNumber(
      hardFailures,
      dimension,
      "weight",
      `${prefix}.weight`,
    );
    const effectiveWeight = requireGoldenNumber(
      hardFailures,
      dimension,
      "effective_weight",
      `${prefix}.effective_weight`,
    );
    if (rawWeight != null && (
      rawWeight < 0 || roleWeights?.[index] == null
      || Math.abs(rawWeight - roleWeights[index]) > LOCAL_WEIGHT_SUM_TOLERANCE
    )) {
      pushUniqueDiff(hardFailures, diffItem(
        `${prefix}.weight`,
        roleWeights?.[index] ?? "canonical role weight",
        rawWeight,
        "role_template_weight_mismatch",
      ));
    }

    const available = dimension?.available === true;
    if (!available) {
      if (effectiveWeight !== 0) {
        pushUniqueDiff(hardFailures, diffItem(
          `${prefix}.effective_weight`,
          0,
          effectiveWeight,
          "unavailable_effective_weight_mismatch",
        ));
      }
      for (const field of [
        "base_score",
        "behavior_modifier",
        "final_score",
        "score",
      ]) {
        if (!own(dimension ?? {}, field) || dimension[field] !== null) {
          pushUniqueDiff(hardFailures, diffItem(
            `${prefix}.${field}`,
            null,
            dimension?.[field],
            "unavailable_score_must_be_null",
          ));
        }
      }
    } else {
      const dimensionBase = requireGoldenNumber(
        hardFailures,
        dimension,
        "base_score",
        `${prefix}.base_score`,
      );
      const dimensionModifier = requireGoldenNumber(
        hardFailures,
        dimension,
        "behavior_modifier",
        `${prefix}.behavior_modifier`,
      );
      const dimensionFinal = requireGoldenNumber(
        hardFailures,
        dimension,
        "final_score",
        `${prefix}.final_score`,
      );
      const scoreAlias = requireGoldenNumber(
        hardFailures,
        dimension,
        "score",
        `${prefix}.score`,
      );
      if (effectiveWeight != null) {
        effectiveWeightSum += effectiveWeight;
        if (Math.abs(effectiveWeight - expectedWeights[index])
            > LOCAL_WEIGHT_SUM_TOLERANCE) {
          pushUniqueDiff(hardFailures, diffItem(
            `${prefix}.effective_weight`,
            expectedWeights[index],
            effectiveWeight,
            "effective_weight_template_mismatch",
          ));
        }
      } else {
        weightedFormulaValid = false;
      }

      const scoringComponents = Array.isArray(dimension?.scoring_components)
        ? dimension.scoring_components
        : [];
      let recomputedModifier = 0;
      for (const component of scoringComponents) {
        const componentKey = String(component?.key || "");
        const componentPrefix =
          `${prefix}.scoring_components.${componentKey}`;
        const applied = requireGoldenNumber(
          hardFailures,
          component,
          "applied_delta",
          `${componentPrefix}.applied_delta`,
        );
        const path = String(component?.score_path || "");
        if (!SCORE_PATHS.has(path)) {
          pushUniqueDiff(hardFailures, diffItem(
            `${componentPrefix}.score_path`,
            [...SCORE_PATHS],
            path,
            "unknown_score_path",
          ));
        } else if (applied != null
            && path !== "modifier"
            && Math.abs(applied) > APPLIED_EPSILON) {
          pushUniqueDiff(hardFailures, diffItem(
            `${componentPrefix}.applied_delta`,
            0,
            applied,
            "non_modifier_applied_delta",
          ));
        }
        if (path === "modifier" && applied != null) {
          recomputedModifier += applied;
        }
      }
      recomputedModifier = round2(recomputedModifier);
      if (dimensionModifier != null
          && Math.abs(dimensionModifier - recomputedModifier) > SCORE_TOLERANCE) {
        pushUniqueDiff(hardFailures, diffItem(
          `${prefix}.behavior_modifier`,
          recomputedModifier,
          dimensionModifier,
          "modifier_formula_error",
        ));
      }
      if (dimensionBase != null && dimensionModifier != null
          && dimensionFinal != null) {
        const recomputedFinal = round2(clampScore(
          dimensionBase + dimensionModifier,
        ));
        if (!Number.isFinite(recomputedFinal)) {
          pushUniqueDiff(hardFailures, diffItem(
            `${prefix}.final_score`,
            "finite base + modifier",
            recomputedFinal,
            "formula_overflow",
          ));
        } else if (Math.abs(recomputedFinal - dimensionFinal)
            > SCORE_TOLERANCE) {
          pushUniqueDiff(hardFailures, diffItem(
            `${prefix}.final_score`,
            recomputedFinal,
            dimensionFinal,
            "formula_error",
          ));
        }
      }
      if (scoreAlias != null && dimensionFinal != null
          && Math.abs(scoreAlias - dimensionFinal) > SCORE_TOLERANCE) {
        pushUniqueDiff(hardFailures, diffItem(
          `${prefix}.score`,
          dimensionFinal,
          scoreAlias,
          "score_alias_mismatch",
        ));
      }

      if (dimensionBase == null || dimensionFinal == null
          || effectiveWeight == null) {
        weightedFormulaValid = false;
      } else {
        baseWeighted += dimensionBase * effectiveWeight;
        finalWeighted += dimensionFinal * effectiveWeight;
        if (!Number.isFinite(baseWeighted) || !Number.isFinite(finalWeighted)) {
          weightedFormulaValid = false;
          pushUniqueDiff(hardFailures, diffItem(
            prefix,
            "finite weighted scores",
            { baseWeighted, finalWeighted },
            "formula_overflow",
          ));
        }
      }
    }

    const baseComponents = Array.isArray(dimension?.base_components)
      ? dimension.base_components
      : [];
    for (const component of baseComponents) {
      const componentKey = String(component?.key || "");
      const componentPrefix = `${prefix}.base_components.${componentKey}`;
      const localWeight = requireGoldenNumber(
        hardFailures,
        component,
        "local_weight",
        `${componentPrefix}.local_weight`,
      );
      const effectiveLocalWeight = requireGoldenNumber(
        hardFailures,
        component,
        "effective_local_weight",
        `${componentPrefix}.effective_local_weight`,
      );
      const confidence = requireGoldenNumber(
        hardFailures,
        component,
        "confidence",
        `${componentPrefix}.confidence`,
      );
      if (localWeight != null && localWeight <= 0) {
        pushUniqueDiff(hardFailures, diffItem(
          `${componentPrefix}.local_weight`,
          "positive finite number",
          localWeight,
          "component_number_out_of_range",
        ));
      }
      if (effectiveLocalWeight != null
          && (effectiveLocalWeight < 0 || effectiveLocalWeight > 100)) {
        pushUniqueDiff(hardFailures, diffItem(
          `${componentPrefix}.effective_local_weight`,
          "0..100",
          effectiveLocalWeight,
          "component_number_out_of_range",
        ));
      }
      if (confidence != null && (confidence < 0 || confidence > 100)) {
        pushUniqueDiff(hardFailures, diffItem(
          `${componentPrefix}.confidence`,
          "0..100",
          confidence,
          "component_number_out_of_range",
        ));
      }
      if (component?.available === true) {
        const normalized = requireGoldenNumber(
          hardFailures,
          component,
          "normalized_score",
          `${componentPrefix}.normalized_score`,
        );
        const contribution = requireGoldenNumber(
          hardFailures,
          component,
          "weighted_contribution",
          `${componentPrefix}.weighted_contribution`,
        );
        for (const [field, value] of [
          ["normalized_score", normalized],
          ["weighted_contribution", contribution],
        ]) {
          if (value != null && (value < 0 || value > 100)) {
            pushUniqueDiff(hardFailures, diffItem(
              `${componentPrefix}.${field}`,
              "0..100",
              value,
              "component_number_out_of_range",
            ));
          }
        }
      } else if (component?.normalized_score !== null
          || component?.weighted_contribution !== null
          || component?.effective_local_weight !== 0) {
        pushUniqueDiff(hardFailures, diffItem(
          componentPrefix,
          "nonnumeric unavailable component",
          component,
          "unavailable_component_has_numeric_contribution",
        ));
      }
    }

    if (baseComponents.length) {
      const componentAudit = recomputeBaseComponents(baseComponents);
      for (const row of componentAudit.rows) {
        const componentKey = row.key || String(row.index);
        const componentPrefix = `${prefix}.base_components.${componentKey}`;
        for (const issue of row.issues) {
          pushUniqueDiff(hardFailures, diffItem(
            componentPrefix,
            "valid atomic component",
            issue,
            issue,
          ));
        }
      }
      for (const issue of componentAudit.issues) {
        if ([
          "base_component_malformed",
          "base_component_duplicate_key",
          "base_component_weight_mismatch",
          "base_component_contribution_mismatch",
        ].includes(issue)) {
          continue;
        }
        const path = issue === "base_component_score_mismatch"
          ? `${prefix}.base_score`
          : `${prefix}.base_components`;
        pushUniqueDiff(hardFailures, diffItem(
          path,
          "valid atomic recomputation",
          issue,
          issue,
        ));
      }
      const dimensionBase = finiteJsonNumber(dimension?.base_score);
      if (dimension?.available === true
          && dimensionBase != null
          && componentAudit.recomputedScore != null
          && Math.abs(dimensionBase - componentAudit.recomputedScore)
            > SCORE_TOLERANCE) {
        pushUniqueDiff(hardFailures, diffItem(
          `${prefix}.base_score`,
          componentAudit.recomputedScore,
          dimensionBase,
          "base_component_score_mismatch",
        ));
      }
    }
    allScoringComponents.push(
      ...(Array.isArray(dimension?.scoring_components)
        ? dimension.scoring_components
        : []),
    );
  }

  for (const dedupeKey of appliedDuplicateKeys(allScoringComponents)) {
    pushUniqueDiff(hardFailures, diffItem(
      `scoring_components.${dedupeKey}`,
      "unique applied deduction",
      "duplicate",
      "duplicate_applied_dedupe_key",
    ));
  }

  if (dimensions.some((dimension) => dimension?.available === true)
      && Math.abs(effectiveWeightSum - 100) > LOCAL_WEIGHT_SUM_TOLERANCE) {
    pushUniqueDiff(hardFailures, diffItem(
      "dimensions.effective_weight_sum",
      100,
      round4(effectiveWeightSum),
      "effective_weight_sum_mismatch",
    ));
  }
  if (weightedFormulaValid && effectiveWeightSum > 0) {
    const recomputedBase = round2(baseWeighted / effectiveWeightSum);
    const recomputedFinal = round2(finalWeighted / effectiveWeightSum);
    const recomputedModifier = round2(recomputedFinal - recomputedBase);
    for (const [path, expectedValue, actualValue] of [
      ["score_card.base_score", recomputedBase, base],
      ["score_card.final_score", recomputedFinal, finalScore],
      ["score_card.behavior_modifier", recomputedModifier, modifier],
    ]) {
      if (actualValue != null
          && Math.abs(expectedValue - actualValue) > SCORE_TOLERANCE) {
        pushUniqueDiff(hardFailures, diffItem(
          path,
          expectedValue,
          actualValue,
          "weighted_overall_mismatch",
        ));
      }
    }
  }
}

function hardScope(path) {
  if (path === "dimensions.keys"
      || path.startsWith("scoring_components.")) {
    return "dimensions";
  }
  const component = path.match(
    /^(dimensions\.[^.]+\.base_components\.[^.]+)/,
  );
  if (component) return component[1];
  const scoring = path.match(
    /^(dimensions\.[^.]+\.scoring_components\.[^.]+)/,
  );
  if (scoring) return scoring[1];
  const dimension = path.match(/^(dimensions\.[^.]+)/);
  if (dimension) return dimension[1];
  if (path.startsWith("score_card.")) return "score_card";
  const jump = path.match(/^(jump_targets\.[^.]+)/);
  if (jump) return jump[1];
  return path;
}

function jumpTargetIndex(rows) {
  const map = new Map();
  const duplicates = new Set();
  for (const source of Array.isArray(rows) ? rows : []) {
    const target = projectJumpTarget(source);
    const identity = jumpTargetIdentity(target);
    if (map.has(identity)) duplicates.add(identity);
    else map.set(identity, target);
  }
  return { map, duplicates };
}

export function compareGolden(expected, actual, policy = {}) {
  const scoreTolerance = finiteJsonNumber(policy.scoreTolerance) ?? 3;
  const componentTolerance = finiteJsonNumber(policy.componentTolerance) ?? 5;
  const confidenceBoundary = finiteJsonNumber(policy.confidenceBoundary) ?? 75;
  const hardFailures = [];
  const pendingApprovals = [];
  const changes = [];

  const addHard = (path, expectedValue, actualValue, reason) => {
    pushUniqueDiff(hardFailures, diffItem(
      path,
      expectedValue,
      actualValue,
      reason,
    ));
  };
  const addApproval = (path, expectedValue, actualValue, reason) => {
    pendingApprovals.push(diffItem(
      path,
      expectedValue,
      actualValue,
      reason,
    ));
  };

  for (const path of ["schema", "match_id", "slot", "position"]) {
    if (recordChange(changes, path, expected?.[path], actual?.[path])) {
      addHard(
        path,
        expected?.[path],
        actual?.[path],
        "protocol_or_identity_changed",
      );
    }
  }
  if (actual?.schema !== GOLDEN_SCHEMA) {
    addHard(
      "schema",
      GOLDEN_SCHEMA,
      actual?.schema,
      "unsupported_golden_schema",
    );
  }

  const expectedDimensions = Array.isArray(expected?.dimensions)
    ? expected.dimensions
    : [];
  const actualDimensions = Array.isArray(actual?.dimensions) ? actual.dimensions : [];
  const expectedDimensionKeys = expectedDimensions.map((dimension) =>
    String(dimension?.key || ""));
  const actualDimensionKeys = actualDimensions.map((dimension) =>
    String(dimension?.key || ""));
  if (recordChange(
    changes,
    "dimensions.keys",
    expectedDimensionKeys,
    actualDimensionKeys,
  )) {
    addHard(
      "dimensions.keys",
      expectedDimensionKeys,
      actualDimensionKeys,
      "protocol_key_changed",
    );
  }

  const actualDimensionsByKey = indexByKey(actualDimensions);
  for (const expectedDimension of expectedDimensions) {
    const dimensionKey = String(expectedDimension?.key || "");
    const actualDimension = actualDimensionsByKey.get(dimensionKey);
    if (!actualDimension) continue;
    for (const field of [
      "available",
      "weight",
      "effective_weight",
      "base_score",
      "behavior_modifier",
      "score",
    ]) {
      recordChange(
        changes,
        `dimensions.${dimensionKey}.${field}`,
        expectedDimension?.[field],
        actualDimension?.[field],
      );
    }
    const expectedComponentKeys = (
      Array.isArray(expectedDimension?.base_components)
        ? expectedDimension.base_components
        : []
    ).map((component) => String(component?.key || ""));
    const actualComponentKeys = (
      Array.isArray(actualDimension?.base_components)
        ? actualDimension.base_components
        : []
    ).map((component) => String(component?.key || ""));
    const componentKeysPath = `dimensions.${dimensionKey}.base_components.keys`;
    if (recordChange(
      changes,
      componentKeysPath,
      expectedComponentKeys,
      actualComponentKeys,
    )) {
      addHard(
        componentKeysPath,
        expectedComponentKeys,
        actualComponentKeys,
        "protocol_key_changed",
      );
    }
    const scoringIdentity = (component) => [
      String(component?.key || ""),
      String(component?.dimension || ""),
      String(component?.score_path || ""),
      String(component?.dedupe_key || ""),
    ].join("|");
    const expectedScoringRows = Array.isArray(expectedDimension?.scoring_components)
      ? expectedDimension.scoring_components
      : [];
    const actualScoringRows = Array.isArray(actualDimension?.scoring_components)
      ? actualDimension.scoring_components
      : [];
    const expectedScoringKeys = expectedScoringRows.map(scoringIdentity);
    const actualScoringKeys = actualScoringRows.map(scoringIdentity);
    const scoringKeysPath = `dimensions.${dimensionKey}.scoring_components.keys`;
    if (recordChange(
      changes,
      scoringKeysPath,
      expectedScoringKeys,
      actualScoringKeys,
    )) {
      addHard(
        scoringKeysPath,
        expectedScoringKeys,
        actualScoringKeys,
        "protocol_key_changed",
      );
    }

    const expectedFinal = finiteJsonNumber(expectedDimension?.final_score);
    const actualFinal = finiteJsonNumber(actualDimension?.final_score);
    const finalPath = `dimensions.${dimensionKey}.final_score`;
    if (recordChange(
      changes,
      finalPath,
      expectedDimension?.final_score,
      actualDimension?.final_score,
    ) && expectedFinal != null && actualFinal != null
        && Math.abs(expectedFinal - actualFinal) > scoreTolerance) {
      addApproval(finalPath, expectedFinal, actualFinal, "score_drift");
    }

    const actualComponentsByKey = indexByKey(actualDimension?.base_components);
    for (const expectedComponent of (
      Array.isArray(expectedDimension?.base_components)
        ? expectedDimension.base_components
        : []
    )) {
      const componentKey = String(expectedComponent?.key || "");
      const actualComponent = actualComponentsByKey.get(componentKey);
      if (!actualComponent) continue;
      for (const field of [
        "available",
        "local_weight",
        "effective_local_weight",
        "weighted_contribution",
        "confidence",
      ]) {
        recordChange(
          changes,
          `dimensions.${dimensionKey}.base_components.${componentKey}.${field}`,
          expectedComponent?.[field],
          actualComponent?.[field],
        );
      }
      const expectedScore = finiteJsonNumber(expectedComponent?.normalized_score);
      const actualScore = finiteJsonNumber(actualComponent?.normalized_score);
      const path = `dimensions.${dimensionKey}`
        + `.base_components.${componentKey}.normalized_score`;
      if (recordChange(
        changes,
        path,
        expectedComponent?.normalized_score,
        actualComponent?.normalized_score,
      ) && expectedScore != null && actualScore != null
          && Math.abs(expectedScore - actualScore) > componentTolerance) {
        addApproval(
          path,
          expectedScore,
          actualScore,
          "atomic_component_score_drift",
        );
      }
    }

    const actualScoringByIdentity = new Map(
      actualScoringRows.map((row) => [scoringIdentity(row), row]),
    );
    for (const expectedRow of expectedScoringRows) {
      const identity = scoringIdentity(expectedRow);
      const actualRow = actualScoringByIdentity.get(identity);
      if (!actualRow) continue;
      const path = `dimensions.${dimensionKey}.scoring_components.`
        + `${String(expectedRow?.key || "")}.applied_delta`;
      recordChange(
        changes,
        `dimensions.${dimensionKey}.scoring_components.`
          + `${String(expectedRow?.key || "")}.dedupe_status`,
        expectedRow?.dedupe_status,
        actualRow?.dedupe_status,
      );
      recordChange(
        changes,
        path,
        expectedRow?.applied_delta,
        actualRow?.applied_delta,
      );
    }
  }

  const expectedFinal = finiteJsonNumber(expected?.score_card?.final_score);
  const actualFinal = finiteJsonNumber(actual?.score_card?.final_score);
  for (const field of ["base_score", "behavior_modifier"]) {
    recordChange(
      changes,
      `score_card.${field}`,
      expected?.score_card?.[field],
      actual?.score_card?.[field],
    );
  }
  if (recordChange(
    changes,
    "score_card.final_score",
    expected?.score_card?.final_score,
    actual?.score_card?.final_score,
  ) && expectedFinal != null && actualFinal != null
      && Math.abs(expectedFinal - actualFinal) > scoreTolerance) {
    addApproval(
      "score_card.final_score",
      expectedFinal,
      actualFinal,
      "score_drift",
    );
  }

  const expectedCoverage = finiteJsonNumber(expected?.dimension_coverage);
  const actualCoverage = finiteJsonNumber(actual?.dimension_coverage);
  if (recordChange(
    changes,
    "dimension_coverage",
    expectedCoverage,
    actualCoverage,
  )) {
    addApproval(
      "dimension_coverage",
      expectedCoverage,
      actualCoverage,
      "available_dimension_count_changed",
    );
  }

  const expectedConfidence = finiteJsonNumber(expected?.role_confidence);
  const actualConfidence = finiteJsonNumber(actual?.role_confidence);
  if (expectedConfidence != null && actualConfidence != null
      && recordChange(
        changes,
        "role_confidence",
        expectedConfidence,
        actualConfidence,
      )
      && (expectedConfidence >= confidenceBoundary)
        !== (actualConfidence >= confidenceBoundary)) {
    addApproval(
      "role_confidence",
      expectedConfidence,
      actualConfidence,
      "confidence_boundary_crossed",
    );
  }

  for (const semanticKey of [
    "strength_ids",
    "main_issue_id",
    "training_target_id",
    "root_cause_ids",
  ]) {
    const path = `semantic.${semanticKey}`;
    const expectedValue = expected?.semantic?.[semanticKey]
      ?? (semanticKey.endsWith("_ids") ? [] : "");
    const actualValue = actual?.semantic?.[semanticKey]
      ?? (semanticKey.endsWith("_ids") ? [] : "");
    if (recordChange(changes, path, expectedValue, actualValue)) {
      addApproval(
        path,
        expectedValue,
        actualValue,
        "primary_semantic_id_changed",
      );
    }
  }

  if (recordChange(
    changes,
    "event_candidate_model",
    expected?.event_candidate_model || "",
    actual?.event_candidate_model || "",
  )) {
    addHard(
      "event_candidate_model",
      expected?.event_candidate_model || "",
      actual?.event_candidate_model || "",
      "event_candidate_protocol_changed",
    );
  }
  if (recordChange(
    changes,
    "event_candidate_summary",
    expected?.event_candidate_summary || { total: 0, selected: 0, type_counts: {} },
    actual?.event_candidate_summary || { total: 0, selected: 0, type_counts: {} },
  )) {
    addApproval(
      "event_candidate_summary",
      expected?.event_candidate_summary || { total: 0, selected: 0, type_counts: {} },
      actual?.event_candidate_summary || { total: 0, selected: 0, type_counts: {} },
      "event_candidate_coverage_changed",
    );
  }
  const expectedEvents = indexByKey(
    (Array.isArray(expected?.important_events) ? expected.important_events : [])
      .map((event) => ({ ...event, key: String(event?.id || "") })),
  );
  const actualEvents = indexByKey(
    (Array.isArray(actual?.important_events) ? actual.important_events : [])
      .map((event) => ({ ...event, key: String(event?.id || "") })),
  );
  const expectedEventIds = [...expectedEvents.keys()].sort();
  const actualEventIds = [...actualEvents.keys()].sort();
  if (recordChange(
    changes,
    "important_events.ids",
    expectedEventIds,
    actualEventIds,
  )) {
    addApproval(
      "important_events.ids",
      expectedEventIds,
      actualEventIds,
      "important_event_selection_changed",
    );
  }
  for (const id of expectedEventIds) {
    if (!actualEvents.has(id)) continue;
    const expectedEvent = expectedEvents.get(id);
    const actualEvent = actualEvents.get(id);
    delete expectedEvent.key;
    delete actualEvent.key;
    const path = `important_events.${id}`;
    if (recordChange(changes, path, expectedEvent, actualEvent)) {
      addApproval(path, expectedEvent, actualEvent, "important_event_payload_changed");
    }
  }

  const expectedJump = jumpTargetIndex(expected?.jump_targets);
  const actualJump = jumpTargetIndex(actual?.jump_targets);
  for (const identity of expectedJump.duplicates) {
    addHard(
      `jump_targets.${identity}`,
      "unique identity",
      "duplicate",
      "duplicate_jump_target_identity",
    );
  }
  for (const identity of actualJump.duplicates) {
    addHard(
      `jump_targets.${identity}`,
      "unique identity",
      "duplicate",
      "duplicate_jump_target_identity",
    );
  }
  for (const [identity, target] of expectedJump.map) {
    const actualTarget = actualJump.map.get(identity);
    const path = `jump_targets.${identity}`;
    if (!actualTarget) {
      addHard(path, target, null, "jump_target_missing");
      changes.push({ path, expected: target, actual: null });
    } else if (recordChange(changes, path, target, actualTarget)) {
      addHard(path, target, actualTarget, "jump_target_payload_changed");
    }
  }
  for (const [identity, target] of actualJump.map) {
    if (expectedJump.map.has(identity)) continue;
    const path = `jump_targets.${identity}`;
    changes.push({ path, expected: null, actual: target });
    if (!actualJump.duplicates.has(identity)) {
      addApproval(path, null, target, "jump_target_added");
    }
  }

  appendGoldenIntegrityFailures(actual, hardFailures);
  const hardScopes = hardFailures.map((failure) => hardScope(failure.path));
  const approvalRequired = pendingApprovals.filter((approval) => {
    const scope = hardScope(approval.path);
    return !hardScopes.some((hard) =>
      scope === hard
      || scope.startsWith(`${hard}.`)
      || hard.startsWith(`${scope}.`));
  });

  return {
    schema: "player-report-golden-diff/1.0",
    valid: hardFailures.length === 0 && approvalRequired.length === 0,
    hardFailures,
    approvalRequired,
    changes,
  };
}

function resolveWithin(root, path, label) {
  const normalizedRoot = resolve(root);
  const target = resolve(normalizedRoot, path);
  const targetRelative = relative(normalizedRoot, target);
  if (targetRelative === ".."
      || targetRelative.startsWith(`..\\`)
      || targetRelative.startsWith("../")
      || isAbsolute(targetRelative)) {
    throw new Error(`${label} escapes its allowed directory`);
  }
  return target;
}

function realPathWithin(root, path, label, fileSystem = DEFAULT_FILE_SYSTEM) {
  const target = resolveWithin(root, path, label);
  const realRoot = fileSystem.realpathSync(resolve(root));
  const realTarget = fileSystem.realpathSync(target);
  const targetRelative = relative(realRoot, realTarget);
  if (targetRelative === ".."
      || targetRelative.startsWith(`..\\`)
      || targetRelative.startsWith("../")
      || isAbsolute(targetRelative)) {
    throw new Error(
      `${label} escapes its allowed real path boundary through a filesystem link`,
    );
  }
  return target;
}

function nearestExistingPath(path, fileSystem = DEFAULT_FILE_SYSTEM) {
  let current = resolve(path);
  while (!pathEntryExists(current, fileSystem)) {
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(`No existing parent for path ${path}`);
    }
    current = parent;
  }
  return current;
}

function pathEntryExists(path, fileSystem = DEFAULT_FILE_SYSTEM) {
  try {
    fileSystem.lstatSync(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function writablePathWithin(root, path, label, fileSystem = DEFAULT_FILE_SYSTEM) {
  const target = resolveWithin(root, path, label);
  const existingParent = nearestExistingPath(target, fileSystem);
  realPathWithin(root, existingParent, `${label} parent`, fileSystem);
  if (pathEntryExists(target, fileSystem)) {
    realPathWithin(root, target, label, fileSystem);
  }
  return target;
}

function sha256File(path, fileSystem = DEFAULT_FILE_SYSTEM) {
  return createHash("sha256").update(fileSystem.readFileSync(path)).digest("hex");
}

export function loadPlayerReportAnalysis(matchId, projectRoot = process.cwd()) {
  const normalizedMatchId = String(matchId || "8894766243");
  if (!/^\d+$/.test(normalizedMatchId)) {
    throw new Error("Invalid match_id for analysis source");
  }
  const analysesDirectory = resolve(
    projectRoot,
    "tools",
    "runtime",
    "dota-lens-data",
    "analyses",
  );
  const analysisDirectory = resolveWithin(
    analysesDirectory,
    normalizedMatchId,
    `Analysis ${normalizedMatchId} source path`,
  );
  realPathWithin(
    analysesDirectory,
    analysisDirectory,
    `Analysis ${normalizedMatchId} source path`,
  );
  const summaryPath = resolveWithin(
    analysisDirectory,
    "summary.json",
    `Analysis ${normalizedMatchId} summary path`,
  );
  realPathWithin(
    analysisDirectory,
    summaryPath,
    `Analysis ${normalizedMatchId} summary path`,
  );
  const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
  const moduleBase = String(summary?.analysis_storage?.module_base || "");
  if (!moduleBase) {
    throw new Error(`Analysis ${normalizedMatchId} has no split module base`);
  }
  const moduleDirectory = resolveWithin(
    analysisDirectory,
    moduleBase,
    `Analysis ${normalizedMatchId} split module source path`,
  );
  realPathWithin(
    analysisDirectory,
    moduleDirectory,
    `Analysis ${normalizedMatchId} split module source path`,
  );
  const playersPath = resolveWithin(
    moduleDirectory,
    "players.json.gz",
    `Analysis ${normalizedMatchId} players source path`,
  );
  realPathWithin(
    moduleDirectory,
    playersPath,
    `Analysis ${normalizedMatchId} players source path`,
  );
  const players = JSON.parse(gunzipSync(readFileSync(playersPath)));
  return {
    matchId: normalizedMatchId,
    projectRoot: resolve(projectRoot),
    analysisDirectory,
    moduleBase,
    playersPath,
    summary,
    summaryPath,
    players,
  };
}

function manifestContext(manifestArgument) {
  const manifestPath = resolve(String(manifestArgument || ""));
  const projectRoot = resolve(dirname(manifestPath), "..", "..");
  const runtimeBoundaryDirectory = resolve(projectRoot, "tools", "runtime");
  const replayDirectory = resolve(
    runtimeBoundaryDirectory,
    "dota-lens-data",
    "replays",
  );
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest?.schema !== "player-report-regression-manifest/1.0") {
    throw new Error("Unsupported player report regression manifest schema");
  }
  if (!Array.isArray(manifest.matches)) {
    throw new Error("Player report regression manifest requires matches");
  }

  const matchIds = new Set();
  for (const [index, match] of manifest.matches.entries()) {
    const matchId = String(match?.match_id || "");
    if (!/^\d+$/.test(matchId)) {
      throw new Error(`Invalid match_id at matches[${index}]`);
    }
    if (matchIds.has(matchId)) {
      throw new Error(`Duplicate match_id=${matchId}`);
    }
    matchIds.add(matchId);

    const replayPath = String(match?.replay_path || "");
    const resolvedReplay = resolve(projectRoot, replayPath);
    const replayRelative = relative(projectRoot, resolvedReplay);
    const replayBoundaryRelative = relative(replayDirectory, resolvedReplay);
    if (!replayPath
        || isAbsolute(replayPath)
        || replayRelative === ".."
        || replayRelative.startsWith(`..\\`)
        || replayRelative.startsWith("../")
        || isAbsolute(replayRelative)
        || replayBoundaryRelative === ".."
        || replayBoundaryRelative.startsWith(`..\\`)
        || replayBoundaryRelative.startsWith("../")
        || isAbsolute(replayBoundaryRelative)) {
      throw new Error(`Invalid replay_path for match_id=${matchId}`);
    }
    realPathWithin(
      replayDirectory,
      resolvedReplay,
      `Replay source path for match_id=${matchId}`,
    );
  }

  return {
    manifest,
    manifestPath,
    projectRoot,
    replayDirectory,
    runtimeBoundaryDirectory,
    runtimeDirectory: resolve(
      projectRoot,
      "tools",
      "runtime",
      "player-report-regression",
    ),
    expectedDirectory: resolve(dirname(manifestPath), "expected"),
  };
}

function validateGoldenSubject(match, index) {
  const subject = match?.golden_subject;
  if (subject == null) return null;
  const playerSlot = subject.player_slot;
  const expectedPosition = subject.expected_position;
  if (!Number.isInteger(playerSlot) || playerSlot < 0 || playerSlot > 9) {
    throw new Error(`Invalid golden_subject.player_slot at matches[${index}]`);
  }
  if (!Number.isInteger(expectedPosition)
      || expectedPosition < 1
      || expectedPosition > 5) {
    throw new Error(`Invalid golden_subject.expected_position at matches[${index}]`);
  }
  if (!Array.isArray(subject.scenario_tags)
      || subject.scenario_tags.some((tag) => (
        typeof tag !== "string" || !tag.trim()
      ))) {
    throw new Error(`Invalid golden_subject.scenario_tags at matches[${index}]`);
  }
  return {
    ...subject,
    player_slot: playerSlot,
    expected_position: expectedPosition,
    scenario_tags: uniqueSortedStrings(subject.scenario_tags),
  };
}

function goldenSubjectRows(context) {
  return context.manifest.matches
    .map((match, index) => ({
      index,
      match,
      matchId: String(match.match_id),
      subject: validateGoldenSubject(match, index),
    }))
    .filter((row) => row.subject)
    .sort((left, right) => (
      left.matchId.localeCompare(right.matchId, "en")
      || left.subject.player_slot - right.subject.player_slot
    ));
}

function validateFrozenManifest(context) {
  const { matches } = context.manifest;
  if (matches.length !== 16) {
    throw new Error(`Frozen manifest cardinality must be 16, received ${matches.length}`);
  }
  const enabled = matches.filter((match) => match.matrix_enabled === true);
  const reserve = matches.filter((match) => match.reserve === true);
  const subjects = goldenSubjectRows(context);
  if (enabled.length !== 15 || reserve.length !== 1 || subjects.length !== 15) {
    throw new Error(
      "Frozen manifest requires 15 enabled matches, 1 reserve, and 15 Golden subjects",
    );
  }
  for (const [index, match] of matches.entries()) {
    const subject = validateGoldenSubject(match, index);
    if (match.matrix_enabled === true) {
      if (match.reserve === true || subject == null) {
        throw new Error(`Enabled match ${match.match_id} requires one Golden subject`);
      }
    } else if (match.reserve !== true || subject != null) {
      throw new Error(`Disabled match ${match.match_id} must be the subject-free reserve`);
    }
  }
  const positionCounts = Object.fromEntries(
    [1, 2, 3, 4, 5].map((position) => [position, 0]),
  );
  for (const { subject } of subjects) {
    positionCounts[subject.expected_position] += 1;
  }
  for (const [position, count] of Object.entries(positionCounts)) {
    if (count !== 3) {
      throw new Error(`Golden position ${position} cardinality must be 3, received ${count}`);
    }
  }
  return subjects;
}

function reportForSubject(context, row) {
  const analysis = loadPlayerReportAnalysis(row.matchId, context.projectRoot);
  const validation = validatePlayerReportBundle(analysis.players, {
    requireAtomic: true,
    requireServerAudit: true,
    requireEventPool: true,
  });
  if (!validation.valid) {
    throw new Error(
      `Analysis ${row.matchId} is invalid: ${validation.errors.join("; ")}`,
    );
  }
  const report = analysis.players?.by_slot?.[String(row.subject.player_slot)]?.report;
  if (!isRecord(report)) {
    throw new Error(
      `Missing report ${row.matchId} slot ${row.subject.player_slot}`,
    );
  }
  if (Number(report.position) !== row.subject.expected_position) {
    throw new Error(
      `Position mismatch ${row.matchId} slot ${row.subject.player_slot}: `
        + `expected ${row.subject.expected_position}, received ${report.position}`,
    );
  }
  const projection = projectGoldenReport({
    matchId: row.matchId,
    slot: row.subject.player_slot,
    report,
  });
  if (projection.dimension_coverage < 8) {
    throw new Error(
      `Golden subject ${row.matchId} slot ${row.subject.player_slot} `
        + `has dimension_coverage=${projection.dimension_coverage}`,
    );
  }
  if (projection.role_confidence < 75
      && !row.subject.scenario_tags.includes("role-confidence-low")) {
    throw new Error(
      `Golden subject ${row.matchId} slot ${row.subject.player_slot} `
        + "requires scenario tag role-confidence-low",
    );
  }
  const integrity = compareGolden(projection, projection);
  if (!integrity.valid || integrity.changes.length > 0) {
    throw new Error(
      `Generated Golden projection failed integrity for ${row.matchId} `
        + `slot ${row.subject.player_slot}`,
    );
  }
  return { analysis, projection, report, validation };
}

function goldenFileName(row) {
  return `${row.matchId}-slot-${row.subject.player_slot}.json`;
}

function replaceDirectoryAtomically(directory, files, options = {}) {
  const fileSystem = {
    ...DEFAULT_FILE_SYSTEM,
    ...(options.fileSystem || {}),
  };
  const parent = dirname(directory);
  const boundaryRoot = options.boundaryRoot || parent;
  const nonce = `${process.pid}-${Date.now()}`;
  const staging = `${directory}.staging-${nonce}`;
  const backup = `${directory}.backup-${nonce}`;
  const transactionMarker = resolve(staging, ".transaction");
  let backupPresent = false;
  let replacementCommitted = false;
  writablePathWithin(
    boundaryRoot,
    directory,
    "Golden destination directory",
    fileSystem,
  );
  writablePathWithin(
    boundaryRoot,
    staging,
    "Golden staging directory",
    fileSystem,
  );
  writablePathWithin(
    boundaryRoot,
    backup,
    "Golden backup directory",
    fileSystem,
  );
  fileSystem.mkdirSync(parent, { recursive: true });
  realPathWithin(
    boundaryRoot,
    parent,
    "Golden destination parent directory",
    fileSystem,
  );
  fileSystem.rmSync(staging, { recursive: true, force: true });
  fileSystem.mkdirSync(staging, { recursive: true });
  realPathWithin(
    boundaryRoot,
    staging,
    "Golden staging directory",
    fileSystem,
  );
  try {
    writablePathWithin(
      boundaryRoot,
      transactionMarker,
      "Golden transaction marker",
      fileSystem,
    );
    fileSystem.writeFileSync(transactionMarker, "staging\n");
    for (const [fileName, contents] of files) {
      const destination = resolveWithin(staging, fileName, "Golden staging path");
      writablePathWithin(
        boundaryRoot,
        destination,
        "Golden staging path",
        fileSystem,
      );
      fileSystem.writeFileSync(destination, contents);
    }
    fileSystem.rmSync(transactionMarker, { force: true });
    if (fileSystem.existsSync(directory)) {
      fileSystem.renameSync(directory, backup);
      backupPresent = true;
    }
    try {
      fileSystem.renameSync(staging, directory);
      replacementCommitted = true;
    } catch (swapError) {
      if (backupPresent && fileSystem.existsSync(backup)) {
        try {
          fileSystem.renameSync(backup, directory);
          backupPresent = false;
        } catch (restoreError) {
          const recoveryError = new Error(
            `Golden directory swap failed and backup restore failed; `
              + `original expected remains at ${backup}: ${restoreError.message}`,
          );
          recoveryError.cause = new AggregateError(
            [swapError, restoreError],
            "Golden directory swap and recovery both failed",
          );
          throw recoveryError;
        }
      }
      throw swapError;
    }
    if (backupPresent) {
      fileSystem.rmSync(backup, { recursive: true, force: true });
      backupPresent = false;
    }
  } finally {
    fileSystem.rmSync(staging, { recursive: true, force: true });
    if (backupPresent && replacementCommitted) {
      fileSystem.rmSync(backup, { recursive: true, force: true });
      backupPresent = false;
    }
  }
}

function sourceProvenance(context, row, analysis) {
  const replayPath = resolveWithin(
    context.projectRoot,
    String(row.match.replay_path),
    `Replay source path for match_id=${row.matchId}`,
  );
  realPathWithin(
    context.replayDirectory,
    replayPath,
    `Replay source path for match_id=${row.matchId}`,
  );
  realPathWithin(
    analysis.analysisDirectory,
    analysis.summaryPath,
    `Analysis ${row.matchId} summary path`,
  );
  realPathWithin(
    analysis.analysisDirectory,
    analysis.playersPath,
    `Analysis ${row.matchId} players source path`,
  );
  return {
    match_id: row.matchId,
    replay_sha256: sha256File(replayPath),
    summary_sha256: sha256File(analysis.summaryPath),
    players_sha256: sha256File(analysis.playersPath),
    module_base: analysis.moduleBase,
  };
}

function proposalProvenancePath(context) {
  return resolve(context.runtimeDirectory, "candidate-golden.provenance.json");
}

function writeProposalProvenance(context, sources) {
  const destination = proposalProvenancePath(context);
  const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
  const contents = `${JSON.stringify({
    schema: PROPOSAL_PROVENANCE_SCHEMA,
    sources,
  }, null, 2)}\n`;
  writablePathWithin(
    context.runtimeBoundaryDirectory,
    destination,
    "Golden proposal provenance destination",
  );
  writablePathWithin(
    context.runtimeBoundaryDirectory,
    temporary,
    "Golden proposal provenance staging path",
  );
  writeFileSync(temporary, contents);
  renameSync(temporary, destination);
}

function readProposalProvenance(context) {
  const path = proposalProvenancePath(context);
  if (!existsSync(path)) {
    throw new Error("Golden proposal provenance is missing");
  }
  realPathWithin(
    context.runtimeBoundaryDirectory,
    path,
    "Golden proposal provenance source path",
  );
  const provenance = JSON.parse(readFileSync(path, "utf8"));
  if (provenance?.schema !== PROPOSAL_PROVENANCE_SCHEMA
      || !Array.isArray(provenance.sources)) {
    throw new Error("Golden proposal provenance is invalid");
  }
  return provenance.sources;
}

function jsonProjection(projection) {
  return `${JSON.stringify(projection, null, 2)}\n`;
}

function markdownCell(value) {
  const text = Array.isArray(value) ? value.join(", ") : String(value ?? "");
  return (text || "-").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function candidateScenarioTags(match, slot, projection) {
  const tags = [
    ...(Array.isArray(match?.scenario_tags) ? match.scenario_tags : []),
    ...(match?.golden_subject?.player_slot === slot
      ? match.golden_subject.scenario_tags || []
      : []),
  ];
  if (projection.role_confidence < 75) tags.push("role-confidence-low");
  if (projection.dimension_coverage < PLAYER_REPORT_DIMENSIONS.length) {
    tags.push("dimensions-missing");
  }
  return uniqueSortedStrings(tags);
}

function candidatesMarkdown(context) {
  const lines = [
    "# Player Report Regression Candidates",
    "",
    "| Match | Slot | Position | Role confidence | Coverage | Base score | Final score | Main strength | Main issue | Scenario tags | Missing dimensions |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- |",
  ];
  for (const match of context.manifest.matches) {
    const matchId = String(match.match_id);
    const analysis = loadPlayerReportAnalysis(matchId, context.projectRoot);
    const validation = validatePlayerReportBundle(analysis.players, {
      requireAtomic: true,
      requireServerAudit: true,
      requireEventPool: true,
    });
    if (!validation.valid) {
      throw new Error(
        `Analysis ${matchId} is invalid: ${validation.errors.join("; ")}`,
      );
    }
    for (let slot = 0; slot < 10; slot += 1) {
      const report = analysis.players?.by_slot?.[String(slot)]?.report;
      const scoreCard = isRecord(report?.score_card) ? report.score_card : {};
      const dimensions = Array.isArray(scoreCard.dimensions)
        ? scoreCard.dimensions
        : Array.isArray(report?.dimensions) ? report.dimensions : [];
      const dimensionCoverage = dimensions.filter(
        (dimension) => dimension?.available !== false
          && dimension?.base_score != null,
      ).length;
      const candidate = {
        position: Number(report?.position || 0),
        role_confidence: projectNumber(report?.role_confidence),
        dimension_coverage: dimensionCoverage,
        score_card: {
          base_score: projectNumber(scoreCard.base_score),
          final_score: projectNumber(
            scoreCard.final_score ?? scoreCard.overall_score,
          ),
        },
        dimensions,
        semantic: projectSemantic(report),
      };
      candidate.main_strength_id = projectMainStrengthId(
        report,
        candidate.semantic,
      );
      const missingDimensions = candidate.dimensions
        .filter((dimension) => (
          dimension.available === false || dimension.base_score == null
        ))
        .map((dimension) => dimension.key);
      const tags = candidateScenarioTags(match, slot, candidate);
      lines.push([
        matchId,
        slot,
        candidate.position,
        candidate.role_confidence,
        candidate.dimension_coverage,
        candidate.score_card.base_score,
        candidate.score_card.final_score,
        candidate.main_strength_id || "-",
        candidate.semantic.main_issue_id || "-",
        tags,
        missingDimensions,
      ].map(markdownCell).join(" | ").replace(/^/, "| ").replace(/$/, " |"));
    }
  }
  return `${lines.join("\n")}\n`;
}

function runCandidatesCommand(manifestArgument) {
  const context = manifestContext(manifestArgument);
  const markdown = candidatesMarkdown(context);
  const reportDirectory = resolve(context.runtimeDirectory, "reports");
  writablePathWithin(
    context.runtimeBoundaryDirectory,
    reportDirectory,
    "Golden candidates report directory",
  );
  mkdirSync(reportDirectory, { recursive: true });
  realPathWithin(
    context.runtimeBoundaryDirectory,
    reportDirectory,
    "Golden candidates report directory",
  );
  const reportPath = resolve(reportDirectory, "candidates.md");
  const temporary = `${reportPath}.${process.pid}.${Date.now()}.tmp`;
  writablePathWithin(
    context.runtimeBoundaryDirectory,
    reportPath,
    "Golden candidates report path",
  );
  writablePathWithin(
    context.runtimeBoundaryDirectory,
    temporary,
    "Golden candidates report staging path",
  );
  writeFileSync(temporary, markdown);
  renameSync(temporary, reportPath);
  process.stdout.write(markdown);
  return 0;
}

function runProposeGoldenCommand(manifestArgument) {
  const context = manifestContext(manifestArgument);
  const rows = goldenSubjectRows(context);
  const sources = [];
  const files = rows.map((row) => {
    const { analysis, projection } = reportForSubject(context, row);
    sources.push(sourceProvenance(context, row, analysis));
    return [goldenFileName(row), jsonProjection(projection)];
  });
  replaceDirectoryAtomically(
    resolve(context.runtimeDirectory, "candidate-golden"),
    files,
    { boundaryRoot: context.runtimeBoundaryDirectory },
  );
  writeProposalProvenance(context, sources);
  console.log(`Proposed ${files.length} Golden candidates`);
  return 0;
}

function runApproveGoldenCommand(manifestArgument, reviewed, fileSystem) {
  if (!reviewed) {
    throw new Error("approve-golden requires explicit --reviewed");
  }
  const context = manifestContext(manifestArgument);
  const rows = validateFrozenManifest(context);
  const candidateDirectory = resolve(
    context.runtimeDirectory,
    "candidate-golden",
  );
  realPathWithin(
    context.runtimeBoundaryDirectory,
    candidateDirectory,
    "Golden candidate source directory",
  );
  const expectedNames = rows.map(goldenFileName).sort();
  const candidateNames = existsSync(candidateDirectory)
    ? readdirSync(candidateDirectory)
      .filter((fileName) => fileName.endsWith(".json"))
      .sort()
    : [];
  if (candidateNames.length !== 15
      || JSON.stringify(candidateNames) !== JSON.stringify(expectedNames)) {
    throw new Error(
      `Golden candidate cardinality mismatch: expected ${expectedNames.length}, `
        + `received ${candidateNames.length}`,
    );
  }

  const proposedSources = readProposalProvenance(context);
  if (proposedSources.length !== rows.length) {
    throw new Error("Golden proposal provenance cardinality mismatch");
  }

  const files = [];
  for (const [index, row] of rows.entries()) {
    const fileName = goldenFileName(row);
    const candidatePath = resolveWithin(
      candidateDirectory,
      fileName,
      "Golden candidate path",
    );
    realPathWithin(
      candidateDirectory,
      candidatePath,
      "Golden candidate path",
    );
    const candidateContents = readFileSync(candidatePath, "utf8");
    const candidate = JSON.parse(candidateContents);
    const selfComparison = compareGolden(candidate, candidate);
    if (!selfComparison.valid || selfComparison.changes.length > 0) {
      throw new Error(`Golden candidate integrity failed for ${fileName}`);
    }
    const { analysis, projection } = reportForSubject(context, row);
    const currentSource = sourceProvenance(context, row, analysis);
    if (JSON.stringify(proposedSources[index]) !== JSON.stringify(currentSource)) {
      throw new Error(`Golden proposal source hash drift detected for ${fileName}`);
    }
    const sourceComparison = compareGolden(candidate, projection);
    if (!sourceComparison.valid
        || sourceComparison.changes.length > 0
        || JSON.stringify(candidate) !== JSON.stringify(projection)) {
      throw new Error(`Golden candidate drift detected for ${fileName}`);
    }
    files.push([fileName, candidateContents]);
  }

  replaceDirectoryAtomically(context.expectedDirectory, files, {
    boundaryRoot: context.projectRoot,
    fileSystem,
  });
  console.log(`Approved ${files.length} reviewed Golden files`);
  return 0;
}

export function runRegressionCli(argv = process.argv.slice(2), options = {}) {
  const [subcommand, firstArgument, secondArgument] = argv;
  try {
    if (subcommand === "validate-analysis") {
      const matchId = firstArgument || "8894766243";
      const root = secondArgument || process.cwd();
      const analysis = loadPlayerReportAnalysis(matchId, resolve(root));
      const result = validatePlayerReportBundle(analysis.players, {
        requireAtomic: true,
        requireServerAudit: true,
        requireEventPool: true,
      });
      console.log(JSON.stringify(result, null, 2));
      return result.valid ? 0 : 1;
    }
    if (subcommand === "candidates") {
      return runCandidatesCommand(firstArgument);
    }
    if (subcommand === "propose-golden") {
      return runProposeGoldenCommand(firstArgument);
    }
    if (subcommand === "approve-golden") {
      const reviewed = argv.slice(2).includes("--reviewed");
      return runApproveGoldenCommand(firstArgument, reviewed, options.fileSystem);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (typeof options.onError === "function") options.onError(message);
    else console.error(message);
    return 1;
  }
  console.error(
    "Usage: node tools/player-report-regression.mjs "
      + "validate-analysis [match-id] [project-root] | "
      + "candidates <manifest> | propose-golden <manifest> | "
      + "approve-golden <manifest> --reviewed",
  );
  return 2;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  process.exitCode = runRegressionCli();
}
