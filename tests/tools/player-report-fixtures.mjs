import {
  PLAYER_REPORT_DIMENSIONS,
  PLAYER_REPORT_ROLE_WEIGHTS,
} from "../../tools/player-report-regression.mjs";

const DIMENSION_COMPONENTS = [
  ["lane_execution", "lane_model_score"],
  ["farm_efficiency", "relative_gpm"],
  ["resource_decision", "secured_lane_opportunity_ratio"],
  ["map_tempo", "team_tempo_share_vs_role_target"],
  ["combat_output", "team_damage_share_vs_role_target"],
  ["combat_duty", "hard_gated_duty_average"],
  ["survival_risk", "deaths_vs_same_position"],
  ["objective_conversion", "team_tower_damage_share_vs_role_target"],
  ["vision_team", "team_vision_share_vs_role_target"],
  ["observable_execution", "action_continuity_apm"],
];

function baseComponents(dimensionKey, primaryKey) {
  const secondaryKey = dimensionKey === "lane_execution"
    ? "core_lane_opportunity_conversion"
    : `${primaryKey}_supporting`;
  return [
    {
      key: primaryKey,
      label: dimensionKey === "lane_execution" ? "对线模型结果" : primaryKey,
      available: true,
      normalized_score: 80,
      local_weight: 75,
      effective_local_weight: 75,
      weighted_contribution: 60,
      confidence: 90,
      comparison: {},
      raw_metrics: {},
      evidence_refs: dimensionKey === "lane_execution"
        ? ["laning.slot.0"]
        : [`fixture.${dimensionKey}.${primaryKey}`],
    },
    {
      key: secondaryKey,
      label: dimensionKey === "lane_execution" ? "核心对线资源转化" : secondaryKey,
      available: true,
      normalized_score: 40,
      local_weight: 25,
      effective_local_weight: 25,
      weighted_contribution: 10,
      confidence: 90,
      comparison: {},
      raw_metrics: {},
      evidence_refs: dimensionKey === "lane_execution"
        ? ["players.slot.0.lane_opportunity_summary"]
        : [`fixture.${dimensionKey}.${secondaryKey}`],
    },
  ];
}

function modifierCap() {
  return {
    before_dimension_cap: 0,
    after_dimension_cap: 0,
    negative_limit: -15,
    positive_limit: 10,
    negative_factor: 1,
    positive_factor: 1,
    applied: false,
  };
}

function atomicDimensions(position) {
  const weights = PLAYER_REPORT_ROLE_WEIGHTS[String(position)];
  return DIMENSION_COMPONENTS.map(([dimensionKey, componentKey], index) => ({
    key: dimensionKey,
    available: true,
    weight: weights[index],
    effective_weight: weights[index],
    base_score: 70,
    behavior_modifier: 0,
    final_score: 70,
    score: 70,
    base_components: baseComponents(dimensionKey, componentKey),
    scoring_components: [],
    modifier_cap: modifierCap(),
  }));
}

const ATOMIC_REPORT_TEMPLATES = Object.fromEntries(
  Object.keys(PLAYER_REPORT_ROLE_WEIGHTS).map((position) => [position, {
    model: "player-report/4.0",
    base_component_model: "player-report-base-components/1.0",
    root_causes: [],
    score_card: {
      model: "player-report/4.0",
      base_score: 70,
      behavior_modifier: 0,
      final_score: 70,
      overall_score: 70,
      audit: { recomputation_tolerance: 0.05 },
      dimensions: atomicDimensions(Number(position)),
    },
  }]),
);

export function addServerAuditDeclarations(report) {
  const scoreCard = report.score_card;
  scoreCard.audit = {
    model: "player-report-score-audit/1.0",
    formula_version: "player-report/4.0",
    dimension_formula: "clamp(base_score + sum(applied_delta), 0, 100)",
    overall_formula:
      "sum(dimension_score * effective_weight) / sum(effective_weight)",
    weight_denominator: 100,
    recomputed_base_score: 70,
    recomputed_final_score: 70,
    recomputed_behavior_modifier: 0,
    recomputation_tolerance: 0.05,
    recomputation_valid: true,
    base_component_model: "player-report-base-components/1.0",
    atomic_dimension_count: PLAYER_REPORT_DIMENSIONS.length,
    aggregate_fallback_count: 0,
    score_path_counts: {
      embedded: 0,
      modifier: 0,
      context_only: 0,
    },
    duplicate_suppressed_count: 0,
    limits: {
      root_negative_overall: 6,
      dimension_negative: -15,
      dimension_positive: 10,
      overall_negative: -12,
      overall_positive: 8,
    },
    overall_cap: {
      before_cap: 0,
      after_cap: 0,
      negative_limit: -12,
      positive_limit: 8,
      negative_factor: 1,
      positive_factor: 1,
      applied: false,
    },
  };
  for (const dimension of scoreCard.dimensions) {
    dimension.modifier_cap = modifierCap();
  }
  for (const root of report.root_causes) {
    root.scoring_summary = {
      candidate_negative_overall: 0,
      root_cap: 6,
      root_cap_factor: 1,
      root_cap_applied: false,
      duplicate_suppressed_count: 0,
      applied_negative_overall: 0,
      applied_modifier_total: 0,
    };
  }
  return report;
}

export function atomicReportFixture({
  slot = 0,
  position = (slot % 5) + 1,
  serverAudit = false,
} = {}) {
  const report = structuredClone(ATOMIC_REPORT_TEMPLATES[String(position)]);
  report.slot = slot;
  report.position = position;
  report.role_code = `position_${position}`;
  report.role_confidence = 96;
  report.dimension_coverage = 10;
  report.event_candidate_model = "player-report-event-candidates/1.1";
  report.event_candidates = [];
  report.important_events = [];
  report.story_nodes = [];
  report.semantic = {
    strength_ids: ["strength:lane_execution"],
    main_issue_id: "issue:combat_timing",
    training_target_id: "training:arrive-first-window",
  };
  report.root_causes = [{
    id: "root:combat_timing",
    scoring_impacts: [],
    scoring_summary: { applied_negative_overall: 0 },
  }];
  if (serverAudit) addServerAuditDeclarations(report);
  return report;
}

export function bundleFixture({
  slots = 10,
  atomic = true,
  serverAudit = false,
} = {}) {
  const bySlot = {};
  for (let slot = 0; slot < slots; slot += 1) {
    const report = atomicReportFixture({ slot, serverAudit });
    if (!atomic) delete report.base_component_model;
    bySlot[String(slot)] = { report };
  }
  return {
    schema: "player-report/4.0",
    base_component_model: atomic
      ? "player-report-base-components/1.0"
      : undefined,
    by_slot: bySlot,
  };
}

export function goldenFixture({ finalScore = 70 } = {}) {
  return {
    schema: "player-report-golden/1.0",
    match_id: "fixture",
    slot: 0,
    position: 1,
    role_confidence: 96,
    dimension_coverage: 1,
    score_card: {
      base_score: 70,
      behavior_modifier: finalScore - 70,
      final_score: finalScore,
    },
    dimensions: [],
    semantic: {
      strength_ids: ["strength:lane_execution"],
      main_issue_id: "issue:combat_timing",
      training_target_id: "training:arrive-first-window",
      root_cause_ids: ["root:combat_timing"],
    },
    jump_targets: [],
  };
}
