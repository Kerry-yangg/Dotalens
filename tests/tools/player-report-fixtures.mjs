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

const atomicDimensions = DIMENSION_COMPONENTS.map(([dimensionKey, componentKey]) => ({
  key: dimensionKey,
  available: true,
  weight: 10,
  effective_weight: 10,
  base_score: 70,
  behavior_modifier: 0,
  final_score: 70,
  score: 70,
  base_components: baseComponents(dimensionKey, componentKey),
  scoring_components: [],
}));

const ATOMIC_REPORT_TEMPLATE = {
  model: "player-report/4.0",
  base_component_model: "player-report-base-components/1.0",
  root_causes: [],
  score_card: {
    model: "player-report/4.0",
    base_score: 70,
    behavior_modifier: 0,
    final_score: 70,
    audit: { recomputation_tolerance: 0.05 },
    dimensions: atomicDimensions,
  },
};

export function atomicReportFixture({
  slot = 0,
  position = (slot % 5) + 1,
} = {}) {
  const report = structuredClone(ATOMIC_REPORT_TEMPLATE);
  report.slot = slot;
  report.position = position;
  report.role_code = `position_${position}`;
  report.role_confidence = 96;
  report.dimension_coverage = 10;
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
  return report;
}

export function bundleFixture({ slots = 10, atomic = true } = {}) {
  const bySlot = {};
  for (let slot = 0; slot < slots; slot += 1) {
    const report = atomicReportFixture({ slot });
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
