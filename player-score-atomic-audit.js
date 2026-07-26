const BASE_SCORE_TOLERANCE = 0.05;

const BASE_ISSUE_META = {
  base_component_malformed: "原子组件字段缺失或格式错误",
  base_component_duplicate_key: "原子组件标识重复",
  base_component_weight_mismatch: "有效权重与本地重算不同",
  base_component_contribution_mismatch: "维度贡献与本地重算不同",
  base_component_score_mismatch: "基础分与原子组件合计不同",
  base_component_weight_sum_mismatch: "有效权重合计不是 100%",
  aggregate_component_in_current_report: "当前报告仍包含旧版聚合组件",
};

const CHAIN_ISSUE_META = {
  dimension_modifier_mismatch: "行为修正与计分路径合计不同",
  dimension_final_mismatch: "最终分与本地重算不同",
  dimension_score_alias_mismatch: "维度分数字段之间不一致",
};

const REASON_META = {
  counterpart_or_subject_gpm_missing: "缺少你或同位置参照的 GPM",
  counterpart_or_subject_xpm_missing: "缺少你或同位置参照的 XPM",
  counterpart_or_subject_networth_missing: "缺少你或同位置参照的净资产",
  team_damage_share_inputs_missing: "缺少个人或团队伤害数据",
  no_passed_responsibility_gate_fights: "没有战斗片段通过职责硬门禁",
  responsibility_gate_not_passed: "职责硬门禁未通过，本项被抑制",
  team_utility_share_inputs_missing: "缺少个人或团队效用数据",
  team_vision_share_inputs_missing: "缺少个人或团队视野数据",
  subject_or_same_position_deaths_missing: "缺少你或同位置参照的死亡数据",
  dead_time_or_duration_missing: "缺少死亡时长或比赛时长",
  team_tower_damage_share_inputs_missing: "缺少个人或团队防御塔伤害",
  tower_or_roshan_finish_inputs_missing: "缺少防御塔或肉山终结数据",
  team_tempo_share_inputs_missing: "缺少个人或团队节奏数据",
  tp_and_rune_activation_inputs_missing: "缺少传送或神符激活数据",
  action_continuity_apm_missing: "缺少可用的操作连续性 APM",
  subject_or_opponent_observable_uses_missing: "缺少你或同位置参照的技能物品使用数据",
};

const UNIT_META = {
  model_points: "模型分",
  percent: "%",
  route_score: "路线分",
  windows: "个窗口",
  count: "次",
  per_minute: "每分钟",
  damage: "伤害",
  score: "分",
  utility: "效用值",
  vision_value: "视野值",
  gold: "金",
  tower_damage: "防御塔伤害",
  actions_per_minute: "APM",
  seconds: "秒",
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}

function atomicNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function inRange(value, minimum, maximum) {
  return value != null && value >= minimum && value <= maximum;
}

function componentSemanticsValid(component) {
  const available = component?.available === true;
  const normalizedScore = atomicNumber(component?.normalized_score);
  const localWeight = atomicNumber(component?.local_weight);
  const effectiveWeight = atomicNumber(component?.effective_local_weight);
  const contribution = atomicNumber(component?.weighted_contribution);
  const confidence = atomicNumber(component?.confidence);
  if (!inRange(confidence, 0, 100) || localWeight == null || localWeight <= 0) return false;
  if (available) {
    return inRange(normalizedScore, 0, 100)
      && inRange(effectiveWeight, 0, 100)
      && inRange(contribution, 0, 100);
  }
  return component?.normalized_score === null
    && effectiveWeight === 0
    && component?.weighted_contribution === null;
}

function formatNumber(value) {
  const number = atomicNumber(value);
  if (number == null) return "--";
  return Number.isInteger(number) ? number.toLocaleString("zh-CN") : number.toFixed(2);
}

function comparisonText(component) {
  const comparison = component?.comparison;
  const subject = atomicNumber(comparison?.subject);
  const reference = atomicNumber(comparison?.reference);
  if (subject == null && reference == null) return "主体值与参照值未提供";
  const key = String(component?.key || "");
  const rawUnit = String(comparison?.unit || "");
  const unit = key === "relative_gpm" ? "GPM"
    : key === "relative_xpm" ? "XPM"
      : UNIT_META[rawUnit] || rawUnit;
  const suffix = unit === "%" ? "%" : unit ? ` ${unit}` : "";
  const subjectLabel = key.startsWith("team_") ? "你" : "主体";
  const referenceLabel = key.startsWith("team_")
    ? "团队"
    : key.includes("same_position") || key.startsWith("relative_") ? "同位置" : "参照";
  return `${subjectLabel} ${formatNumber(subject)}${suffix} / ${referenceLabel} ${formatNumber(reference)}${suffix}`;
}

function auditRowsByKey(rows) {
  const byKey = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = String(row?.key || "");
    const matches = byKey.get(key) || [];
    matches.push(row);
    byKey.set(key, matches);
  }
  return byKey;
}

function consumeAuditRow(byKey, key) {
  const matches = byKey.get(key);
  return matches?.length ? matches.shift() : null;
}

function readableIssue(issue, meta) {
  return meta[issue] || `未识别审计差异（${issue}）`;
}

function uniqueIssues(issues) {
  return [...new Set(issues.filter(Boolean).map(String))];
}

function componentRows(components, baseComponentAudit, reasonMeta) {
  const byKey = auditRowsByKey(baseComponentAudit?.rows);
  return (Array.isArray(components) ? components : []).map((component) => {
    const key = String(component?.key || "");
    const auditRow = consumeAuditRow(byKey, key);
    const semanticsValid = componentSemanticsValid(component);
    const auditValid = auditRow?.key === key && auditRow?.valid === true;
    const sourceAvailable = component?.available === true;
    const trusted = semanticsValid && auditValid;
    const available = trusted && sourceAvailable && auditRow?.available === true;
    const tone = !trusted ? "invalid" : available ? "valid" : "unavailable";
    const confidence = available ? atomicNumber(component?.confidence) : null;
    const structuredReason = component?.suppression_reason || component?.missing_reason;
    const reasons = [];
    if (structuredReason) {
      const prefix = component?.suppression_reason ? "职责门禁" : "数据缺失";
      reasons.push(`${prefix}：${reasonMeta[structuredReason]
        || `未识别原因（${structuredReason}）`}`);
    } else if (!sourceAvailable && trusted) {
      reasons.push("未通过当前组件的计分条件");
    }
    const auditIssues = uniqueIssues(auditRow?.issues || []);
    if (!trusted && !auditIssues.length) auditIssues.push("base_component_malformed");
    reasons.push(...auditIssues.map((issue) => readableIssue(issue, BASE_ISSUE_META)));
    return {
      key,
      tone,
      label: String(component?.label || key || "基础评分模型"),
      comparisonText: comparisonText(component),
      confidenceText: confidence == null ? "--" : `${Math.round(confidence)}%`,
      reasonText: reasons.join("；"),
      scoreText: available ? atomicNumber(component?.normalized_score).toFixed(2) : "未计分",
      effectiveWeightText: available
        ? `${atomicNumber(component?.effective_local_weight).toFixed(2)}%` : "--",
      contributionText: available
        ? atomicNumber(component?.weighted_contribution).toFixed(2) : "--",
    };
  });
}

function componentsHtml(rows) {
  return rows.map((row) => `<div class="player-score-base-component ${row.tone}" data-player-score-component-key="${escapeHtml(row.key)}">
    <span class="identity">
      <strong>${escapeHtml(row.label)}</strong>
      <small>${escapeHtml(row.comparisonText)}</small>
      <em>可信度 ${escapeHtml(row.confidenceText)}</em>
      ${row.reasonText ? `<span class="player-score-base-component-reason">${escapeHtml(row.reasonText)}</span>` : ""}
    </span>
    <span><small>原子分</small><b>${escapeHtml(row.scoreText)}</b></span>
    <span><small>有效权重</small><b>${escapeHtml(row.effectiveWeightText)}</b></span>
    <span><small>对维度贡献</small><b>${escapeHtml(row.contributionText)}</b></span>
  </div>`).join("");
}

function basePresentation(scoreAudit) {
  const baseComponentAudit = scoreAudit?.baseComponentAudit;
  const rows = Array.isArray(baseComponentAudit?.rows) ? baseComponentAudit.rows : [];
  const recomputedScore = atomicNumber(baseComponentAudit?.recomputedScore);
  const serverScore = atomicNumber(scoreAudit?.baseScore);
  const supported = rows.length > 0 && recomputedScore != null && serverScore != null;
  const withinTolerance = supported
    && Math.abs(recomputedScore - serverScore) <= BASE_SCORE_TOLERANCE;
  const valid = supported && baseComponentAudit?.valid === true && withinTolerance;
  const issues = uniqueIssues([
    ...(baseComponentAudit?.issues || []),
    ...(scoreAudit?.issues || []).filter((issue) => (
      Object.prototype.hasOwnProperty.call(BASE_ISSUE_META, issue)
    )),
    ...supported && !withinTolerance ? ["base_component_score_mismatch"] : [],
  ]);
  return {
    supported,
    state: !supported ? "无法重算" : valid ? "一致" : "不同",
    tone: !supported ? "unavailable" : valid ? "valid" : "invalid",
    recomputedText: recomputedScore == null ? "--" : recomputedScore.toFixed(2),
    serverText: serverScore == null ? "--" : serverScore.toFixed(2),
    toleranceText: `±${BASE_SCORE_TOLERANCE.toFixed(2)}`,
    issues: issues.map((issue) => readableIssue(issue, BASE_ISSUE_META)),
  };
}

function baseHtml(base) {
  const issueText = base.issues.join("；");
  return `<section class="player-score-dimension-audit ${base.tone}">
    <div class="player-score-dimension-audit-grid">
      <span><small>基础分重算</small><strong>${escapeHtml(base.recomputedText)}</strong></span>
      <span><small>服务端基础分</small><strong>${escapeHtml(base.serverText)}</strong></span>
      <span><small>允许误差</small><strong>${escapeHtml(base.toleranceText)}</strong></span>
      <span><small>状态</small><strong>${escapeHtml(base.state)}</strong></span>
    </div>
    ${issueText ? `<p>${escapeHtml(issueText)}</p>` : ""}
  </section>`;
}

function chainPresentation(scoreAudit) {
  const storedModifier = atomicNumber(scoreAudit?.storedModifier);
  const recomputedModifier = atomicNumber(scoreAudit?.componentModifier);
  const storedFinal = atomicNumber(scoreAudit?.storedFinalScore);
  const recomputedFinal = atomicNumber(scoreAudit?.recomputedFinalScore);
  const supported = storedModifier != null
    && recomputedModifier != null
    && storedFinal != null
    && recomputedFinal != null;
  const issues = uniqueIssues((scoreAudit?.issues || []).filter((issue) => (
    !Object.prototype.hasOwnProperty.call(BASE_ISSUE_META, issue)
  )));
  const valuesMatch = supported
    && Math.abs(storedModifier - recomputedModifier) <= BASE_SCORE_TOLERANCE
    && Math.abs(storedFinal - recomputedFinal) <= BASE_SCORE_TOLERANCE;
  const valid = supported && valuesMatch && issues.length === 0;
  return {
    supported,
    state: !supported ? "无法校验" : valid ? "一致" : "不同",
    tone: !supported ? "unavailable" : valid ? "valid" : "invalid",
    storedModifierText: storedModifier == null ? "--" : storedModifier.toFixed(2),
    recomputedModifierText: recomputedModifier == null ? "--" : recomputedModifier.toFixed(2),
    storedFinalText: storedFinal == null ? "--" : storedFinal.toFixed(2),
    recomputedFinalText: recomputedFinal == null ? "--" : recomputedFinal.toFixed(2),
    issues: issues.map((issue) => readableIssue(issue, CHAIN_ISSUE_META)),
  };
}

function chainHtml(chain) {
  const issueText = chain.issues.join("；");
  return `<section class="player-score-dimension-chain-audit ${chain.tone}">
    <header>维度分链校验 · ${escapeHtml(chain.state)}</header>
    <p>行为修正 ${escapeHtml(chain.storedModifierText)} / 重算 ${escapeHtml(chain.recomputedModifierText)} · 最终分 ${escapeHtml(chain.storedFinalText)} / 重算 ${escapeHtml(chain.recomputedFinalText)}</p>
    ${issueText ? `<small>${escapeHtml(issueText)}</small>` : ""}
  </section>`;
}

export function renderPlayerScoreAtomicAudit({
  components = [],
  scoreAudit = null,
  reasonMeta = {},
} = {}) {
  const rows = componentRows(components, scoreAudit?.baseComponentAudit, {
    ...reasonMeta,
    ...REASON_META,
  });
  const base = basePresentation(scoreAudit);
  const chain = chainPresentation(scoreAudit);
  return {
    rows,
    base,
    chain,
    componentsHtml: componentsHtml(rows),
    baseHtml: baseHtml(base),
    chainHtml: chainHtml(chain),
  };
}
