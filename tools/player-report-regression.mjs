import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";

const REPORT_MODEL = "player-report/4.0";
const ATOMIC_MODEL = "player-report-base-components/1.0";
const VALIDATION_SCHEMA = "player-report-regression-validation/1.0";
const GOLDEN_SCHEMA = "player-report-golden/1.0";
const SCORE_TOLERANCE = 0.05;
const LOCAL_WEIGHT_SUM_TOLERANCE = 0.01;
const ROOT_NEGATIVE_OVERALL_CAP = 6;
const APPLIED_EPSILON = 0.0001;
const SCORE_PATHS = new Set(["embedded", "modifier", "context_only"]);

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

export function validatePlayerReportBundle(players, options = {}) {
  const requireAtomic = options.requireAtomic === true;
  const requireServerAudit = options.requireServerAudit === true;
  const errors = [];
  const reports = [];
  const positionCounts = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  let aggregateFallbackCount = 0;
  let duplicateAppliedKeyCount = 0;
  const bySlot = isRecord(players?.by_slot) ? players.by_slot : {};

  if (players?.schema !== REPORT_MODEL) {
    errors.push(`players.schema=${players?.schema || "missing"}`);
  }
  if (requireAtomic && players?.base_component_model !== ATOMIC_MODEL) {
    errors.push(
      `players.base_component_model=${players?.base_component_model || "missing"}`,
    );
  }

  for (const [slot, player] of Object.entries(bySlot).sort(
    ([left], [right]) => Number(left) - Number(right),
  )) {
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

    const dimensions = Array.isArray(scoreCard.dimensions)
      ? scoreCard.dimensions
      : Array.isArray(report.dimensions) ? report.dimensions : [];
    const keys = dimensions.map((dimension) => String(dimension?.key || ""));
    if (JSON.stringify(keys) !== JSON.stringify(PLAYER_REPORT_DIMENSIONS)) {
      slotErrors.push(`dimension_order=${keys.join(",")}`);
    }

    let weight = 0;
    let baseWeighted = 0;
    let finalWeighted = 0;
    const dimensionWeights = new Map();
    const dimensionComponents = [];
    for (const dimension of dimensions) {
      const dimensionKey = String(dimension?.key || "");
      const baseComponents = Array.isArray(dimension?.base_components)
        ? dimension.base_components
        : [];
      aggregateFallbackCount += baseComponents.filter(
        (component) => String(component?.key || "") === "existing_dimension_model",
      ).length;
      const baseAudit = (atomicModel || requireAtomic)
        ? atomicDiagnostics(baseComponents, dimensionKey, slotErrors)
        : null;

      const components = Array.isArray(dimension?.scoring_components)
        ? dimension.scoring_components
        : [];
      dimensionComponents.push(...components);
      appendPathDiagnostics(components, dimensionKey, slotErrors);

      if (dimension?.available === false || dimension?.base_score == null) {
        if (dimension?.score != null || dimension?.final_score != null) {
          slotErrors.push(`${dimensionKey}:missing_dimension_has_score`);
        }
        continue;
      }

      const modifier = round2(components.reduce((sum, component) => {
        const applied = finiteNumber(component?.applied_delta);
        return sum + (applied ?? 0);
      }, 0));
      const recomputedFinal = round2(
        clampScore(Number(dimension.base_score) + modifier),
      );
      if (!close(modifier, dimension.behavior_modifier)) {
        slotErrors.push(`${dimensionKey}:modifier_mismatch`);
      }
      if (!close(recomputedFinal, dimension.final_score)) {
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

      const effectiveWeight = finiteNumber(dimension.effective_weight) ?? 0;
      dimensionWeights.set(dimensionKey, effectiveWeight);
      weight += effectiveWeight;
      baseWeighted += Number(dimension.base_score) * effectiveWeight;
      finalWeighted += recomputedFinal * effectiveWeight;
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
    if (!close(recomputedFinal, scoreCard.final_score ?? scoreCard.overall_score)) {
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

    if (requireServerAudit
        && scoreCard?.audit?.model !== "player-report-score-audit/1.0") {
      slotErrors.push("missing_score_audit");
    }
    if (requireServerAudit && scoreCard?.audit?.recomputation_valid !== true) {
      slotErrors.push("server_recomputation_invalid");
    }

    const position = finiteNumber(report.position) ?? 0;
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

    for (const error of slotErrors) errors.push(`slot ${slot}: ${error}`);
    reports.push({
      slot: Number(slot),
      position,
      base_score: Number(scoreCard.base_score),
      behavior_modifier: Number(scoreCard.behavior_modifier),
      final_score: Number(scoreCard.final_score ?? scoreCard.overall_score),
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
    effective_weight: projectNumber(dimension?.effective_weight),
    base_score: projectNumber(dimension?.base_score),
    behavior_modifier: projectNumber(dimension?.behavior_modifier),
    final_score: projectNumber(dimension?.final_score),
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
    jumpTargetsByIdentity.set(jumpTargetIdentity(projected), projected);
  }
  const jumpTargets = [...jumpTargetsByIdentity.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, target]) => target);
  const semantic = isRecord(report?.semantic) ? report.semantic : {};

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
      strength_ids: uniqueSortedStrings(semantic.strength_ids),
      main_issue_id: String(semantic.main_issue_id || ""),
      training_target_id: String(semantic.training_target_id || ""),
      root_cause_ids: rootCauseIds,
    },
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

function appendGoldenIntegrityFailures(actual, hardFailures) {
  const scoreCard = actual?.score_card || {};
  const base = finiteJsonNumber(scoreCard.base_score);
  const modifier = finiteJsonNumber(scoreCard.behavior_modifier);
  const finalScore = finiteJsonNumber(scoreCard.final_score);
  if (base != null && modifier != null && finalScore != null
      && Math.abs(round2(clampScore(base + modifier)) - finalScore)
        > SCORE_TOLERANCE) {
    hardFailures.push(diffItem(
      "score_card.final_score",
      round2(clampScore(base + modifier)),
      finalScore,
      "formula_error",
    ));
  }

  const allScoringComponents = [];
  for (const dimension of Array.isArray(actual?.dimensions) ? actual.dimensions : []) {
    const key = String(dimension?.key || "");
    const dimensionBase = finiteJsonNumber(dimension?.base_score);
    const dimensionModifier = finiteJsonNumber(dimension?.behavior_modifier);
    const dimensionFinal = finiteJsonNumber(dimension?.final_score);
    if (dimensionBase != null && dimensionModifier != null && dimensionFinal != null
        && Math.abs(round2(clampScore(dimensionBase + dimensionModifier)) - dimensionFinal)
          > SCORE_TOLERANCE) {
      hardFailures.push(diffItem(
        `dimensions.${key}.final_score`,
        round2(clampScore(dimensionBase + dimensionModifier)),
        dimensionFinal,
        "formula_error",
      ));
    }

    const components = Array.isArray(dimension?.base_components)
      ? dimension.base_components
      : [];
    if (components.length) {
      const audit = recomputeBaseComponents(components);
      for (const issue of audit.issues) {
        hardFailures.push(diffItem(
          `dimensions.${key}.base_components`,
          "valid atomic recomputation",
          issue,
          issue,
        ));
      }
      if (dimensionBase != null
          && audit.recomputedScore != null
          && Math.abs(dimensionBase - audit.recomputedScore) > SCORE_TOLERANCE) {
        hardFailures.push(diffItem(
          `dimensions.${key}.base_score`,
          audit.recomputedScore,
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
    hardFailures.push(diffItem(
      `scoring_components.${dedupeKey}`,
      "unique applied deduction",
      "duplicate",
      "duplicate_applied_dedupe_key",
    ));
  }
}

export function compareGolden(expected, actual, policy = {}) {
  const scoreTolerance = finiteJsonNumber(policy.scoreTolerance) ?? 3;
  const componentTolerance = finiteJsonNumber(policy.componentTolerance) ?? 5;
  const confidenceBoundary = finiteJsonNumber(policy.confidenceBoundary) ?? 75;
  const hardFailures = [];
  const approvalRequired = [];
  const changes = [];

  for (const path of ["schema", "match_id", "slot", "position"]) {
    if (recordChange(changes, path, expected?.[path], actual?.[path])) {
      hardFailures.push(diffItem(
        path,
        expected?.[path],
        actual?.[path],
        "protocol_or_identity_changed",
      ));
    }
  }
  if (actual?.schema !== GOLDEN_SCHEMA) {
    hardFailures.push(diffItem(
      "schema",
      GOLDEN_SCHEMA,
      actual?.schema,
      "unsupported_golden_schema",
    ));
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
    hardFailures.push(diffItem(
      "dimensions.keys",
      expectedDimensionKeys,
      actualDimensionKeys,
      "protocol_key_changed",
    ));
  }

  const actualDimensionsByKey = indexByKey(actualDimensions);
  for (const expectedDimension of expectedDimensions) {
    const dimensionKey = String(expectedDimension?.key || "");
    const actualDimension = actualDimensionsByKey.get(dimensionKey);
    if (!actualDimension) continue;
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
      hardFailures.push(diffItem(
        componentKeysPath,
        expectedComponentKeys,
        actualComponentKeys,
        "protocol_key_changed",
      ));
    }
    const scoringIdentity = (component) => [
      String(component?.key || ""),
      String(component?.dimension || ""),
      String(component?.score_path || ""),
      String(component?.dedupe_key || ""),
    ].join("|");
    const expectedScoringKeys = (
      Array.isArray(expectedDimension?.scoring_components)
        ? expectedDimension.scoring_components
        : []
    ).map(scoringIdentity);
    const actualScoringKeys = (
      Array.isArray(actualDimension?.scoring_components)
        ? actualDimension.scoring_components
        : []
    ).map(scoringIdentity);
    const scoringKeysPath = `dimensions.${dimensionKey}.scoring_components.keys`;
    if (recordChange(
      changes,
      scoringKeysPath,
      expectedScoringKeys,
      actualScoringKeys,
    )) {
      hardFailures.push(diffItem(
        scoringKeysPath,
        expectedScoringKeys,
        actualScoringKeys,
        "protocol_key_changed",
      ));
    }

    const expectedFinal = finiteJsonNumber(expectedDimension?.final_score);
    const actualFinal = finiteJsonNumber(actualDimension?.final_score);
    if (expectedFinal != null && actualFinal != null) {
      const path = `dimensions.${dimensionKey}.final_score`;
      if (recordChange(changes, path, expectedFinal, actualFinal)
          && Math.abs(expectedFinal - actualFinal) > scoreTolerance) {
        approvalRequired.push(diffItem(
          path,
          expectedFinal,
          actualFinal,
          "score_drift",
        ));
      }
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
      const expectedScore = finiteJsonNumber(expectedComponent?.normalized_score);
      const actualScore = finiteJsonNumber(actualComponent?.normalized_score);
      if (expectedScore == null || actualScore == null) continue;
      const path = `dimensions.${dimensionKey}`
        + `.base_components.${componentKey}.normalized_score`;
      if (recordChange(changes, path, expectedScore, actualScore)
          && Math.abs(expectedScore - actualScore) > componentTolerance) {
        approvalRequired.push(diffItem(
          path,
          expectedScore,
          actualScore,
          "atomic_component_score_drift",
        ));
      }
    }
  }

  const expectedFinal = finiteJsonNumber(expected?.score_card?.final_score);
  const actualFinal = finiteJsonNumber(actual?.score_card?.final_score);
  if (expectedFinal != null && actualFinal != null
      && recordChange(
        changes,
        "score_card.final_score",
        expectedFinal,
        actualFinal,
      )
      && Math.abs(expectedFinal - actualFinal) > scoreTolerance) {
    approvalRequired.push(diffItem(
      "score_card.final_score",
      expectedFinal,
      actualFinal,
      "score_drift",
    ));
  }

  const expectedCoverage = finiteJsonNumber(expected?.dimension_coverage);
  const actualCoverage = finiteJsonNumber(actual?.dimension_coverage);
  if (recordChange(
    changes,
    "dimension_coverage",
    expectedCoverage,
    actualCoverage,
  )) {
    approvalRequired.push(diffItem(
      "dimension_coverage",
      expectedCoverage,
      actualCoverage,
      "available_dimension_count_changed",
    ));
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
    approvalRequired.push(diffItem(
      "role_confidence",
      expectedConfidence,
      actualConfidence,
      "confidence_boundary_crossed",
    ));
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
      approvalRequired.push(diffItem(
        path,
        expectedValue,
        actualValue,
        "primary_semantic_id_changed",
      ));
    }
  }

  const actualJumpTargets = new Map(
    (Array.isArray(actual?.jump_targets) ? actual.jump_targets : [])
      .map((target) => [jumpTargetIdentity(target), target]),
  );
  for (const target of (
    Array.isArray(expected?.jump_targets) ? expected.jump_targets : []
  )) {
    const identity = jumpTargetIdentity(target);
    if (!actualJumpTargets.has(identity)) {
      const path = `jump_targets.${identity}`;
      hardFailures.push(diffItem(
        path,
        target,
        null,
        "jump_target_missing",
      ));
      changes.push({ path, expected: target, actual: null });
    }
  }

  appendGoldenIntegrityFailures(actual, hardFailures);

  return {
    schema: "player-report-golden-diff/1.0",
    valid: hardFailures.length === 0 && approvalRequired.length === 0,
    hardFailures,
    approvalRequired,
    changes,
  };
}

export function loadPlayerReportAnalysis(matchId, projectRoot = process.cwd()) {
  const normalizedMatchId = String(matchId || "8894766243");
  const analysisDirectory = resolve(
    projectRoot,
    "tools",
    "runtime",
    "dota-lens-data",
    "analyses",
    normalizedMatchId,
  );
  const summary = JSON.parse(
    readFileSync(resolve(analysisDirectory, "summary.json"), "utf8"),
  );
  const moduleBase = String(summary?.analysis_storage?.module_base || "");
  if (!moduleBase) {
    throw new Error(`Analysis ${normalizedMatchId} has no split module base`);
  }
  const players = JSON.parse(gunzipSync(readFileSync(
    resolve(analysisDirectory, moduleBase, "players.json.gz"),
  )));
  return {
    matchId: normalizedMatchId,
    projectRoot: resolve(projectRoot),
    analysisDirectory,
    moduleBase,
    summary,
    players,
  };
}

export function runRegressionCli(argv = process.argv.slice(2)) {
  const [subcommand, matchId = "8894766243", root = process.cwd()] = argv;
  if (subcommand !== "validate-analysis") {
    console.error(
      "Usage: node tools/player-report-regression.mjs "
        + "validate-analysis [match-id] [project-root]",
    );
    return 2;
  }
  const analysis = loadPlayerReportAnalysis(matchId, resolve(root));
  const result = validatePlayerReportBundle(analysis.players, {
    requireAtomic: true,
    requireServerAudit: true,
  });
  console.log(JSON.stringify(result, null, 2));
  return result.valid ? 0 : 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  process.exitCode = runRegressionCli();
}
