const TERMINAL_TASK_STATUSES = new Set(["completed", "failed", "canceled"]);
const PLAYER_STORY_VERDICTS = new Set([
  "major_advantage",
  "advantage",
  "even",
  "disadvantage",
  "major_disadvantage",
  "stable",
  "issue",
  "missing",
]);

const COVERAGE_IMPACT_CATALOG = Object.freeze({
  snapshots: {
    label: "逐秒快照",
    reliable: "英雄逐秒位置、等级、经济、经验和补刀状态。",
    limited: "缺失区间内不绘制轨迹或曲线。",
    suppressed: "不会使用缺失秒数补造玩家行为。",
  },
  development: {
    label: "发育复盘",
    reliable: "已观测的发育位置、经济经验变化和发育片段。",
    limited: "单个兵线单位轨迹不足时，精确漏线归因会受限。",
    suppressed: "不会仅凭玩家离线推断其漏掉了整波兵。",
  },
  build: {
    label: "出装技能",
    reliable: "购买、技能升级和可观测的装备栏变化。",
    limited: "缺少精确 Patch 元数据时，关键装备窗口会降级。",
    suppressed: "不会把未知技能或装备时机写成确定失误。",
  },
  farm: {
    label: "打钱分析",
    reliable: "金币事件、已观测单位生命周期和可确认的资源收入。",
    limited: "队友资源占用或单位归属不足时，路线收益只能部分估算。",
    suppressed: "关键路线门禁缺失时不会输出确定的最优路线。",
  },
  laning: {
    label: "对线分析",
    reliable: "10 分钟补刀、反补、等级、经验和双人组差距。",
    limited: "塔血量、精确拉野状态和兵线位置不足时，线况解释受限。",
    suppressed: "不会把未确认的拉野或塔下压力写成确定责任。",
  },
  vision: {
    label: "视野分析",
    reliable: "眼位位置、类型、放置者、生命周期和直接可见事件。",
    limited: "树林、地形和战争迷雾不完整时，几何覆盖只能作为推断。",
    suppressed: "不会把几何推断冒充为敌方英雄的直接可见事实。",
  },
  combat: {
    label: "战斗团战",
    reliable: "伤害、控制、治疗、死亡、技能物品使用和战斗时空聚类。",
    limited: "英雄专属施法语义不足时，职责评价会减少。",
    suppressed: "职责硬门禁未通过时不会生成负面技能结论。",
  },
  objectives: {
    label: "地图目标",
    reliable: "已记录的塔、肉山、盾和其它目标事件。",
    limited: "连续肉山存活状态不足时，精确刷新和空窗判断受限。",
    suppressed: "不会在状态未知区间断言目标一定存活或可打。",
  },
  map: {
    label: "地图坐标",
    reliable: "通过当前 Patch profile 和 Replay 动态锚点校准的位置。",
    limited: "Patch 未精确匹配时，静态地标位置会显式降级。",
    suppressed: "无效坐标不会回退到地图中心或边缘。",
  },
  timeline: {
    label: "完整时间轴",
    reliable: "Replay 事件顺序、游戏时间和原始事实引用。",
    limited: "缺失事件类型不会由聚合数据补造。",
    suppressed: "不会用估算事件替代缺失的原始事件。",
  },
  players: {
    label: "玩家报告",
    reliable: "本场同位置、分位置职责和已有证据支持的行为结论。",
    limited: "英雄专属施法机会和跨比赛基准不足时，评分维度会降级。",
    suppressed: "不会展示段位百分位，也不会为缺失维度填默认分。",
  },
});

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function finiteNumberOrNull(value) {
  if (value == null || (typeof value === "string" && value.trim() === "")) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

const COMBAT_CONTRIBUTION_METRICS = Object.freeze({
  responsibility: {
    label: "职责评分", field: "responsibilityScore", unit: "score", higherIsBetter: true,
  },
  damage: {
    label: "伤害", field: "damage", unit: "number", higherIsBetter: null,
  },
  damage_taken: {
    label: "承伤", field: "damageTaken", unit: "number", higherIsBetter: null,
  },
  control: {
    label: "控制", field: "controlSeconds", unit: "seconds", higherIsBetter: null,
  },
  healing: {
    label: "治疗", field: "healing", unit: "number", higherIsBetter: null,
  },
  presence: {
    label: "在场", field: "presencePct", unit: "percent", higherIsBetter: true,
  },
  arrival: {
    label: "到场", field: "arrivalMedianSeconds", unit: "delay", higherIsBetter: false,
  },
  vision: {
    label: "视野准备", field: "visionSetup", unit: "wards", higherIsBetter: null,
  },
});

const COMBAT_RESPONSIBILITY_COMPONENT_LABELS = Object.freeze({
  base: "职责基础分",
  damage_share: "输出占比",
  kill_conversion: "减员转化",
  damage_taken_share: "承伤价值",
  ability_casts: "技能执行",
  item_uses: "道具执行",
  control: "控制价值",
  healing: "治疗与救援",
  vision_setup: "视野准备",
  arrival: "到场时机",
  presence: "战场在场",
  death_penalty: "生存代价",
});

const COMBAT_ROLE_AXES = Object.freeze({
  1: [
    ["damage_share", "输出占比"],
    ["kill_conversion", "减员转化"],
    ["ability_casts", "技能执行"],
    ["presence", "在场输出"],
    ["death_penalty", "生存代价"],
  ],
  2: [
    ["damage_share", "输出占比"],
    ["ability_casts", "技能执行"],
    ["control", "控制价值"],
    ["arrival", "到场时机"],
    ["presence", "战场在场"],
  ],
  3: [
    ["damage_taken_share", "承伤价值"],
    ["control", "先手控制"],
    ["damage_share", "输出补充"],
    ["ability_casts", "技能执行"],
    ["presence", "战场在场"],
  ],
  4: [
    ["ability_casts", "技能执行"],
    ["control", "控制价值"],
    ["healing", "治疗功能"],
    ["vision_setup", "视野准备"],
    ["presence", "战场在场"],
  ],
  5: [
    ["healing", "救援治疗"],
    ["control", "控制价值"],
    ["item_uses", "道具执行"],
    ["vision_setup", "视野准备"],
    ["presence", "战场在场"],
  ],
});

const COMBAT_DIMENSION_EVIDENCE_KEYS = Object.freeze({
  damage: "damage",
  damage_share: "damage",
  kill_conversion: "damage",
  damage_taken: "damage_taken",
  damage_taken_share: "damage_taken",
  ability_casts: "ability_casts",
  item_uses: "item_uses",
  control: "control",
  healing: "healing",
  vision: "vision_setup",
  vision_setup: "vision_setup",
  arrival: "arrival",
  presence: "arrival",
});

const COMBAT_CONTRIBUTION_NUMBER_FIELDS = [
  "damage",
  "damageTaken",
  "abilityCasts",
  "itemUses",
  "controlSeconds",
  "healing",
  "kills",
  "deaths",
  "setupObservers",
  "setupSentries",
];

function boundedNumber(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, finiteNumber(value)));
}

function rounded(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(finiteNumber(value) * factor) / factor;
}

function combatContributionRoleReady(row = {}) {
  const confidence = finiteNumberOrNull(row.role_confidence ?? row.roleConfidence);
  return confidence != null && confidence >= 65;
}

function combatContributionGateStatus(row = {}) {
  return row.responsibility_gate?.status || row.gateStatus || "insufficient_evidence";
}

export function combatContributionDisplayStatus(row = {}) {
  if (row.hasContribution === false) {
    return row.participant ? "participant_no_events" : "not_participant";
  }
  if (row.participant === false && row.hasContribution !== true) return "not_participant";
  if (!combatContributionRoleReady(row)) return "role_uncertain";
  const gate = combatContributionGateStatus(row);
  if (gate === "passed") return "passed";
  if (gate === "blocked") return "blocked";
  return "insufficient_evidence";
}

function normalizedCombatContribution(hero, contribution, participant) {
  const slot = Number(hero.slot);
  const hasContribution = Boolean(contribution);
  const roleConfidence = finiteNumberOrNull(
    contribution?.role_confidence ?? hero.roleConfidence ?? hero.role_confidence,
  );
  const row = {
    ...(contribution || {}),
    slot,
    team: hero.team || (slot < 5 ? "radiant" : "dire"),
    position: finiteNumber(contribution?.position ?? hero.position, slot % 5 + 1),
    hero,
    participant,
    hasContribution,
    role_confidence: roleConfidence ?? 0,
    responsibility_gate: contribution?.responsibility_gate || null,
    score_components: contribution?.score_components || null,
    dimension_evidence: contribution?.dimension_evidence || null,
    participantCount: participant ? 1 : 0,
    contributionCount: hasContribution ? 1 : 0,
    fightCount: 1,
    passedGateCount: combatContributionGateStatus(contribution) === "passed" && hasContribution ? 1 : 0,
    blockedGateCount: combatContributionGateStatus(contribution) === "blocked" && hasContribution ? 1 : 0,
    insufficientCount: combatContributionGateStatus(contribution) === "insufficient_evidence"
      && hasContribution ? 1 : 0,
  };
  COMBAT_CONTRIBUTION_NUMBER_FIELDS.forEach((field) => {
    row[field] = finiteNumber(contribution?.[field]);
  });
  row.teamDamageShare = finiteNumber(contribution?.teamDamageShare);
  row.teamDamageTakenShare = finiteNumber(contribution?.teamDamageTakenShare);
  row.presencePct = finiteNumber(contribution?.presencePct);
  row.arrivalDelay = finiteNumber(contribution?.arrivalDelay);
  row.arrivalMedianSeconds = row.arrivalDelay;
  row.arrivalP75Seconds = row.arrivalDelay;
  row.arrivalSource = "legacy_contribution";
  row.visionSetup = row.setupObservers + row.setupSentries;
  row.responsibilityScore = hasContribution
    && combatContributionRoleReady(row)
    && combatContributionGateStatus(row) === "passed"
    ? finiteNumberOrNull(contribution?.responsibilityScore)
    : null;
  row.displayStatus = combatContributionDisplayStatus(row);
  return row;
}

function completeCombatHeroes(heroes = []) {
  const bySlot = new Map((Array.isArray(heroes) ? heroes : [])
    .map((hero) => [Number(hero?.slot), hero])
    .filter(([slot]) => Number.isInteger(slot) && slot >= 0 && slot < 10));
  return Array.from({ length: 10 }, (_, slot) => {
    const hero = bySlot.get(slot) || {};
    return {
      ...hero,
      slot,
      team: hero.team || (slot < 5 ? "radiant" : "dire"),
      position: finiteNumber(hero.position, slot % 5 + 1),
      name: hero.name || "未知英雄",
      player: hero.player || "未知玩家",
      token: hero.token || "unknown",
    };
  });
}

function sortCombatContributionRows(rows = []) {
  return [...rows].sort((left, right) => {
    const team = (left.team === "dire" ? 1 : 0) - (right.team === "dire" ? 1 : 0);
    if (team !== 0) return team;
    const position = finiteNumber(left.position, 9) - finiteNumber(right.position, 9);
    return position !== 0 ? position : Number(left.slot) - Number(right.slot);
  });
}

export function buildCombatContributionRoster({ heroes = [], fight = {} } = {}) {
  const participants = new Set((fight?.participants || []).map(Number));
  const contributions = new Map((fight?.contributions || [])
    .map((row) => [Number(row?.slot), row])
    .filter(([slot]) => Number.isInteger(slot)));
  const rows = completeCombatHeroes(heroes).map((hero) => normalizedCombatContribution(
    hero,
    contributions.get(hero.slot),
    participants.has(hero.slot),
  ));
  return sortCombatContributionRows(rows);
}

function combatImportanceFactor(fight = {}) {
  if (fight.importance?.tier === "critical") return 1.5;
  if (fight.importance?.tier === "important") return 1.25;
  return 1;
}

function percentileNearestRank(values = [], percentile) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(percentile * sorted.length) - 1);
  return sorted[Math.min(sorted.length - 1, index)];
}

function median(values = []) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function contributionTimingFact(timingFacts, fightId, slot) {
  return timingFacts.find((fact) => (
    String(fact?.fight_id) === String(fightId)
    && Number(fact?.player_slot) === Number(slot)
    && finiteNumberOrNull(fact?.arrival_delta_seconds) != null
  )) || null;
}

function createCombatAccumulator(hero) {
  const numeric = Object.fromEntries(COMBAT_CONTRIBUTION_NUMBER_FIELDS.map((field) => [field, 0]));
  return {
    ...numeric,
    hero,
    slot: Number(hero.slot),
    team: hero.team,
    position: finiteNumber(hero.position, Number(hero.slot) % 5 + 1),
    role_confidence: finiteNumber(hero.roleConfidence ?? hero.role_confidence),
    participantCount: 0,
    contributionCount: 0,
    fightCount: 0,
    passedGateCount: 0,
    blockedGateCount: 0,
    insufficientCount: 0,
    presenceWeightedTotal: 0,
    presenceWeight: 0,
    arrivalValues: [],
    timingArrivalCount: 0,
    legacyArrivalCount: 0,
    responsibilityWeightedTotal: 0,
    responsibilityWeight: 0,
    scoreComponentTotals: new Map(),
    dimensionEvidence: new Map(),
  };
}

function aggregateScoreComponents(accumulator, components, weight) {
  if (!components || typeof components !== "object") return;
  Object.entries(components).forEach(([key, component]) => {
    if (!component || typeof component !== "object") return;
    const current = accumulator.scoreComponentTotals.get(key) || {
      points: 0,
      maxPoints: 0,
      rawValue: 0,
      weight: 0,
      rawUnit: component.raw_unit || "",
      status: component.status || "applicable",
      judgmentSuppressed: false,
    };
    current.points += finiteNumber(component.points) * weight;
    current.maxPoints += finiteNumber(component.max_points) * weight;
    current.rawValue += finiteNumber(component.raw_value) * weight;
    current.weight += weight;
    current.judgmentSuppressed ||= Boolean(component.judgment_suppressed);
    accumulator.scoreComponentTotals.set(key, current);
  });
}

function aggregateDimensionEvidence(accumulator, evidence, fight) {
  if (!evidence || typeof evidence !== "object") return;
  Object.entries(evidence).forEach(([key, references]) => {
    if (!Array.isArray(references)) return;
    const current = accumulator.dimensionEvidence.get(key) || [];
    references.forEach((reference) => {
      if (current.length >= 12 || !reference || typeof reference !== "object") return;
      current.push({
        ...reference,
        fight_id: fight.id,
        fight_title: fight.title || "",
      });
    });
    accumulator.dimensionEvidence.set(key, current);
  });
}

function finalizedScoreComponents(accumulator) {
  if (!accumulator.scoreComponentTotals.size) return null;
  return Object.fromEntries([...accumulator.scoreComponentTotals.entries()].map(([key, component]) => [
    key,
    {
      points: rounded(component.points / Math.max(1, component.weight), 3),
      max_points: rounded(component.maxPoints / Math.max(1, component.weight), 3),
      raw_value: rounded(component.rawValue / Math.max(1, component.weight), 3),
      raw_unit: component.rawUnit,
      status: component.status,
      judgment_suppressed: component.judgmentSuppressed,
    },
  ]));
}

export function aggregateCombatContributions({
  heroes = [],
  fights = [],
  timingFacts = [],
} = {}) {
  const completeHeroes = completeCombatHeroes(heroes);
  const accumulators = new Map(completeHeroes.map((hero) => [hero.slot, createCombatAccumulator(hero)]));
  const safeFights = Array.isArray(fights) ? fights : [];

  safeFights.forEach((fight) => {
    const duration = Math.max(
      1,
      finiteNumber(fight.contact_end ?? fight.end) - finiteNumber(fight.contact_start ?? fight.start),
    );
    const responsibilityWeight = boundedNumber(duration, 5, 30) * combatImportanceFactor(fight);
    const participants = new Set((fight.participants || []).map(Number));
    participants.forEach((slot) => {
      const accumulator = accumulators.get(slot);
      if (accumulator) accumulator.participantCount += 1;
    });

    (fight.contributions || []).forEach((contribution) => {
      const slot = Number(contribution?.slot);
      const accumulator = accumulators.get(slot);
      if (!accumulator) return;
      accumulator.contributionCount += 1;
      accumulator.fightCount += 1;
      accumulator.role_confidence = Math.max(
        accumulator.role_confidence,
        finiteNumber(contribution.role_confidence),
      );
      COMBAT_CONTRIBUTION_NUMBER_FIELDS.forEach((field) => {
        accumulator[field] += finiteNumber(contribution[field]);
      });
      accumulator.presenceWeightedTotal += finiteNumber(contribution.presencePct) * duration;
      accumulator.presenceWeight += duration;

      const timing = contributionTimingFact(timingFacts, fight.id, slot);
      if (timing) {
        accumulator.arrivalValues.push(finiteNumber(timing.arrival_delta_seconds));
        accumulator.timingArrivalCount += 1;
      } else if (finiteNumberOrNull(contribution.arrivalDelay) != null) {
        accumulator.arrivalValues.push(finiteNumber(contribution.arrivalDelay));
        accumulator.legacyArrivalCount += 1;
      }

      const gate = combatContributionGateStatus(contribution);
      if (gate === "passed" && combatContributionRoleReady(contribution)) {
        accumulator.passedGateCount += 1;
        const score = finiteNumberOrNull(contribution.responsibilityScore);
        if (score != null) {
          accumulator.responsibilityWeightedTotal += score * responsibilityWeight;
          accumulator.responsibilityWeight += responsibilityWeight;
        }
        aggregateScoreComponents(accumulator, contribution.score_components, responsibilityWeight);
      } else if (gate === "blocked") {
        accumulator.blockedGateCount += 1;
      } else {
        accumulator.insufficientCount += 1;
      }
      aggregateDimensionEvidence(accumulator, contribution.dimension_evidence, fight);
    });
  });

  const rows = completeHeroes.map((hero) => {
    const accumulator = accumulators.get(hero.slot);
    const hasContribution = accumulator.contributionCount > 0;
    let displayStatus = "not_participant";
    if (hasContribution && accumulator.role_confidence < 65) displayStatus = "role_uncertain";
    else if (accumulator.passedGateCount > 0) displayStatus = "passed";
    else if (hasContribution && accumulator.blockedGateCount === accumulator.contributionCount) {
      displayStatus = "blocked";
    } else if (hasContribution) displayStatus = "insufficient_evidence";
    else if (accumulator.participantCount > 0) displayStatus = "participant_no_events";

    const arrivalMedian = median(accumulator.arrivalValues);
    const arrivalP75 = percentileNearestRank(accumulator.arrivalValues, 0.75);
    const arrivalSource = accumulator.timingArrivalCount === accumulator.arrivalValues.length
      && accumulator.arrivalValues.length > 0
      ? "combat_timing"
      : accumulator.timingArrivalCount > 0
        ? "mixed"
        : "legacy_contribution";

    return {
      ...Object.fromEntries(COMBAT_CONTRIBUTION_NUMBER_FIELDS.map((field) => [
        field,
        rounded(accumulator[field], field === "controlSeconds" ? 1 : 0),
      ])),
      hero,
      slot: hero.slot,
      team: hero.team,
      position: accumulator.position,
      role_confidence: accumulator.role_confidence,
      participant: accumulator.participantCount > 0,
      hasContribution,
      participantCount: accumulator.participantCount,
      contributionCount: accumulator.contributionCount,
      fightCount: safeFights.length,
      passedGateCount: accumulator.passedGateCount,
      blockedGateCount: accumulator.blockedGateCount,
      insufficientCount: accumulator.insufficientCount,
      presencePct: accumulator.presenceWeight
        ? rounded(accumulator.presenceWeightedTotal / accumulator.presenceWeight, 1)
        : 0,
      arrivalMedianSeconds: arrivalMedian == null ? null : rounded(arrivalMedian, 1),
      arrivalP75Seconds: arrivalP75 == null ? null : rounded(arrivalP75, 1),
      arrivalSource,
      visionSetup: accumulator.setupObservers + accumulator.setupSentries,
      responsibilityScore: accumulator.responsibilityWeight
        ? rounded(accumulator.responsibilityWeightedTotal / accumulator.responsibilityWeight, 1)
        : null,
      responsibility_gate: {
        status: displayStatus === "passed" ? "passed"
          : displayStatus === "blocked" ? "blocked" : "insufficient_evidence",
      },
      score_components: finalizedScoreComponents(accumulator),
      dimension_evidence: Object.fromEntries(accumulator.dimensionEvidence),
      displayStatus,
    };
  });

  ["radiant", "dire"].forEach((team) => {
    const teamRows = rows.filter((row) => row.team === team);
    const damage = teamRows.reduce((sum, row) => sum + row.damage, 0);
    const damageTaken = teamRows.reduce((sum, row) => sum + row.damageTaken, 0);
    teamRows.forEach((row) => {
      row.teamDamageShare = damage ? rounded(row.damage / damage * 100, 1) : 0;
      row.teamDamageTakenShare = damageTaken ? rounded(row.damageTaken / damageTaken * 100, 1) : 0;
    });
  });
  return sortCombatContributionRows(rows);
}

function combatContributionMetricDisplay(value, unit) {
  if (value == null) return "--";
  if (unit === "score") return String(rounded(value, 1));
  if (unit === "percent") return `${rounded(value, 1)}%`;
  if (unit === "seconds") return `${rounded(value, 1)}s`;
  if (unit === "delay") return `+${rounded(value, 1)}s`;
  if (unit === "wards") return `${Math.round(value)} 个`;
  return Math.round(value).toLocaleString("zh-CN");
}

function unavailableResponsibilityDisplay(row) {
  if (finiteNumber(row.role_confidence ?? row.roleConfidence) < 65) return "位置待确认";
  if (combatContributionGateStatus(row) === "blocked") return "客观条件阻断";
  if (row.displayStatus === "not_participant") return "未进入主战场";
  if (row.displayStatus === "participant_no_events") return "贡献事件不足";
  return "证据不足";
}

export function combatContributionMetric(row = {}, metric = "responsibility") {
  const meta = COMBAT_CONTRIBUTION_METRICS[metric] || COMBAT_CONTRIBUTION_METRICS.responsibility;
  let value = finiteNumberOrNull(row[meta.field]);
  if (metric === "arrival") value = finiteNumberOrNull(row.arrivalMedianSeconds ?? row.arrivalDelay);
  if (metric === "vision") {
    value = finiteNumber(row.visionSetup, finiteNumber(row.setupObservers) + finiteNumber(row.setupSentries));
  }
  if (metric === "responsibility") {
    const available = value != null
      && combatContributionRoleReady(row)
      && combatContributionGateStatus(row) === "passed";
    return {
      key: metric,
      ...meta,
      value: available ? value : null,
      available,
      display: available ? combatContributionMetricDisplay(value, meta.unit)
        : unavailableResponsibilityDisplay(row),
      secondary: row.passedGateCount != null
        ? `通过 ${finiteNumber(row.passedGateCount)}/${finiteNumber(row.contributionCount ?? row.participantCount)} 场`
        : "",
    };
  }
  const available = !["not_participant", "participant_no_events"].includes(row.displayStatus)
    && value != null;
  const secondary = metric === "damage" ? `${rounded(row.teamDamageShare, 1)}%`
    : metric === "damage_taken" ? `${rounded(row.teamDamageTakenShare, 1)}%`
      : metric === "arrival" && row.arrivalP75Seconds != null
        ? `P75 +${rounded(row.arrivalP75Seconds, 1)}s`
        : "";
  return {
    key: metric,
    ...meta,
    value: available ? value : null,
    available,
    display: available ? combatContributionMetricDisplay(value, meta.unit)
      : row.displayStatus === "not_participant" ? "未进入主战场" : "贡献事件不足",
    secondary,
  };
}

export function combatContributionChartModel({ rows = [], metric = "responsibility" } = {}) {
  const datum = (row) => {
    const value = combatContributionMetric(row, metric);
    return {
      slot: Number(row.slot),
      position: finiteNumber(row.position, Number(row.slot) % 5 + 1),
      team: row.team,
      hero: row.hero,
      status: row.displayStatus,
      available: value.available,
      value: value.available ? Math.max(0, finiteNumber(value.value)) : 0,
      display: value.display,
      secondary: value.secondary,
    };
  };
  const radiant = rows.filter((row) => row.team === "radiant")
    .sort((left, right) => left.position - right.position).map(datum);
  const dire = rows.filter((row) => row.team === "dire")
    .sort((left, right) => left.position - right.position).map(datum);
  const values = [...radiant, ...dire].filter((row) => row.available).map((row) => row.value);
  const fixedScale = ["responsibility", "presence"].includes(metric) ? 100 : null;
  return {
    metric,
    label: (COMBAT_CONTRIBUTION_METRICS[metric]
      || COMBAT_CONTRIBUTION_METRICS.responsibility).label,
    maxValue: fixedScale || Math.max(1, ...values),
    radiant,
    dire,
    positions: [1, 2, 3, 4, 5],
  };
}

export function filterCombatContributionFights(fights = [], filter = "all") {
  const rows = Array.isArray(fights) ? fights : [];
  if (filter === "important") {
    return rows.filter((fight) => Boolean(fight?.importance?.important));
  }
  if (filter === "critical") {
    return rows.filter((fight) => fight?.importance?.tier === "critical");
  }
  if (filter === "teamfight") {
    return rows.filter((fight) => fight?.kind === "teamfight");
  }
  return [...rows];
}

function combatResponsibilityAxis(component, key, label, row) {
  const applicable = Boolean(component)
    && (component.status == null || component.status === "applicable");
  const suppressed = Boolean(component?.judgment_suppressed)
    || row.displayStatus === "blocked"
    || row.displayStatus === "insufficient_evidence"
    || !combatContributionRoleReady(row);
  if (!applicable) {
    return {
      key,
      label,
      applicable: false,
      available: false,
      value: null,
      reason: "职责不适用",
    };
  }
  if (suppressed) {
    return {
      key,
      label,
      applicable: true,
      available: false,
      value: null,
      reason: "门禁抑制",
    };
  }
  const points = finiteNumber(component.points);
  const maxPoints = finiteNumber(component.max_points);
  let value = null;
  if (maxPoints > 0) {
    value = rounded(boundedNumber(points / maxPoints * 100, 0, 100), 1);
  } else if (component.raw_unit === "deaths") {
    value = rounded(boundedNumber(100 - finiteNumber(component.raw_value) * 25, 0, 100), 1);
  }
  return {
    key,
    label,
    applicable: true,
    available: value != null,
    value,
    reason: value == null ? "缺少归一化上限" : "",
  };
}

function combatScoreComponentRows(components) {
  if (!components || typeof components !== "object") return [];
  return Object.entries(components).map(([key, component]) => {
    const points = finiteNumber(component?.points);
    const maxPoints = finiteNumber(component?.max_points);
    return {
      key,
      label: COMBAT_RESPONSIBILITY_COMPONENT_LABELS[key] || key,
      points: rounded(points, 3),
      maxPoints: rounded(maxPoints, 3),
      rawValue: finiteNumberOrNull(component?.raw_value),
      rawUnit: component?.raw_unit || "",
      status: component?.status || "applicable",
      applicable: component?.status == null || component.status === "applicable",
      judgmentSuppressed: Boolean(component?.judgment_suppressed),
      tone: points < 0 ? "negative" : points > 0 ? "positive" : "neutral",
      ratio: maxPoints > 0 ? rounded(boundedNumber(Math.abs(points) / maxPoints * 100, 0, 100), 1) : 0,
    };
  });
}

function combatDimensionValue(row, dimension) {
  if (!row) return null;
  const component = row.score_components?.[dimension];
  if (component && typeof component === "object") {
    return finiteNumberOrNull(component.raw_value);
  }
  if (dimension === "responsibility") return finiteNumberOrNull(row.responsibilityScore);
  return combatContributionMetric(row, dimension).value;
}

function combatDimensionShare(row, dimension) {
  if (!row) return null;
  if (["damage", "damage_share", "kill_conversion"].includes(dimension)) {
    return finiteNumberOrNull(row.teamDamageShare);
  }
  if (["damage_taken", "damage_taken_share"].includes(dimension)) {
    return finiteNumberOrNull(row.teamDamageTakenShare);
  }
  return null;
}

export function combatContributionDrilldown({
  row = null,
  opponent = null,
  metric = "responsibility",
  scope = "current",
} = {}) {
  const safeRow = row || {};
  const components = safeRow.score_components && typeof safeRow.score_components === "object"
    ? safeRow.score_components : null;
  const position = Math.max(1, Math.min(5, finiteNumber(safeRow.position, 1)));
  const roleAxes = (COMBAT_ROLE_AXES[position] || COMBAT_ROLE_AXES[1]).map(([key, label]) => (
    combatResponsibilityAxis(components?.[key], key, label, safeRow)
  ));
  const scoreComponents = combatScoreComponentRows(components);
  const selectedComponent = scoreComponents.find((component) => component.key === metric) || null;
  const evidenceKey = COMBAT_DIMENSION_EVIDENCE_KEYS[metric] || metric;
  const evidence = Array.isArray(safeRow.dimension_evidence?.[evidenceKey])
    ? safeRow.dimension_evidence[evidenceKey].slice(0, 12)
    : [];
  const metricMeta = COMBAT_CONTRIBUTION_METRICS[metric];

  return {
    row: safeRow,
    opponent,
    position,
    scope,
    metric,
    responsibilityScore: finiteNumberOrNull(safeRow.responsibilityScore),
    roleConfidence: finiteNumber(safeRow.role_confidence ?? safeRow.roleConfidence),
    gateStatus: combatContributionGateStatus(safeRow),
    roleAxes,
    scoreComponents,
    scoreBreakdownAvailable: scoreComponents.length > 0,
    legacyPackage: scoreComponents.length === 0,
    selectedDimension: {
      key: metric,
      label: selectedComponent?.label
        || metricMeta?.label
        || COMBAT_RESPONSIBILITY_COMPONENT_LABELS[metric]
        || metric,
      value: combatDimensionValue(safeRow, metric),
      share: combatDimensionShare(safeRow, metric),
      opponentValue: combatDimensionValue(opponent, metric),
      points: selectedComponent?.points ?? null,
      maxPoints: selectedComponent?.maxPoints ?? null,
      rawUnit: selectedComponent?.rawUnit || metricMeta?.unit || "",
      applicable: selectedComponent?.applicable ?? true,
      judgmentSuppressed: selectedComponent?.judgmentSuppressed ?? false,
      evidenceKey,
      evidence,
    },
  };
}

export function normalizeMatchSubject(match = {}, requestedAccountId = "") {
  const players = Array.isArray(match.players) ? match.players : [];
  const persisted = match.subject && typeof match.subject === "object"
    ? { ...match.subject } : null;
  if (persisted?.schema === "match-subject/1.0") {
    const rawSelectedSlot = persisted.selected_player_slot;
    const selectedSlot = Number(rawSelectedSlot);
    const selectedExists = rawSelectedSlot !== null
      && rawSelectedSlot !== ""
      && rawSelectedSlot !== undefined
      && Number.isFinite(selectedSlot)
      && players.some((player) => Number(player.player_slot) === selectedSlot);
    if (["matched", "manual_selected"].includes(persisted.status) && selectedExists) {
      return { ...persisted, selected_player_slot: selectedSlot };
    }
    return {
      ...persisted,
      status: persisted.status === "invalidated" ? "invalidated" : "manual_required",
      selected_player_slot: null,
    };
  }

  const requested = String(requestedAccountId || "");
  const matches = requested
    ? players.filter((player) => String(player.account_id || "") === requested)
    : [];
  if (matches.length === 1) {
    return {
      schema: "match-subject/1.0",
      status: "matched",
      source: "account_id",
      requested_account_id: requested,
      selected_player_slot: Number(matches[0].player_slot),
      selected_account_id: Number(matches[0].account_id) || undefined,
    };
  }
  return {
    schema: "match-subject/1.0",
    status: "manual_required",
    source: "none",
    requested_account_id: requested || undefined,
    reason: matches.length > 1 ? "requested_account_ambiguous"
      : requested ? "requested_account_not_in_replay" : "account_id_not_provided",
  };
}

export function selectedPlayerIndex(players = [], subject = {}) {
  const rawSelectedSlot = subject?.selected_player_slot;
  const selectedSlot = Number(rawSelectedSlot);
  if (rawSelectedSlot === null
      || rawSelectedSlot === ""
      || rawSelectedSlot === undefined
      || !Number.isFinite(selectedSlot)
      || !["matched", "manual_selected"].includes(String(subject?.status || ""))) {
    return -1;
  }
  return players.findIndex((player) => Number(player?.player_slot) === selectedSlot);
}

export function patchResolutionLabel(resolution = {}, fallbackName = "") {
  const status = String(resolution.status || "");
  const patchName = String(resolution.patch_name || fallbackName || "").trim();
  if (status === "exact") return patchName ? `${patchName} · 已确认` : "Patch 已确认";
  if (status === "inferred") {
    return patchName ? `${patchName} · 按录像时间推断` : "Patch 按录像时间推断";
  }
  if (status === "ambiguous") return "Patch 边界不确定";
  if (status === "unknown") return "Patch 未识别";
  return patchName || "--";
}

export function patchCoverageImpact(match = {}) {
  const resolution = match?.patch_resolution;
  if (!resolution || typeof resolution !== "object") return null;
  const status = String(resolution.status || "");
  if (!status) return null;
  const gates = resolution.gates && typeof resolution.gates === "object"
    ? resolution.gates : {};
  const disabled = [
    gates.map_profile === false ? "地图校准" : null,
    gates.ability_metadata === false ? "技能元数据" : null,
    gates.negative_scoring === false ? "负面职责评分" : null,
  ].filter(Boolean);
  if (["exact", "inferred"].includes(status) && disabled.length === 0) return null;

  const limited = disabled.filter((item) => item !== "负面职责评分");
  return {
    key: "patch_resolution",
    label: "Patch 规则可信度",
    status: status === "unknown" ? "missing" : "partial",
    confidence: Number(resolution.confidence) || 0,
    missing: disabled.length ? disabled : ["Patch 精确版本"],
    reliable: "Replay 原始事件、时间、经济和击杀事实仍可确认",
    limited: limited.length
      ? `${limited.join("、")}只能按保守规则展示`
      : "Patch 边界附近的规则差异需要人工复核",
    suppressed: gates.negative_scoring === false
      ? "Patch 依赖的负面职责评分与技能未交结论"
      : "没有额外抑制的负面结论",
  };
}

export function matchHistoryGuidance(availability = {}) {
  const code = String(availability.code || "");
  const likelyImmortalDraft = availability.likely_immortal_draft === true;
  if (code === "private_match_history") {
    return {
      kind: "private",
      title: "公开 API 未提供该账号的比赛",
      detail: likelyImmortalDraft
        ? "8500+ Immortal Draft 对局由 Valve 设为私有，不进入公开比赛历史，Replay 仅向参赛者开放。请先在 Dota 2 客户端下载自己的录像，再导入 Dota Lens。"
        : "该账号的公开比赛历史不可用。账号本人可以在 Dota 2 客户端下载录像，再导入 Dota Lens。",
      canImportReplay: true,
    };
  }
  return {
    kind: "empty",
    title: "公开比赛历史为空",
    detail: "请确认 Steam 数字 ID 和“公开比赛数据”设置；也可以直接导入本机 Replay。",
    canImportReplay: true,
  };
}

export function simplifyPlayerReportText(value) {
  return String(value || "")
    .replace(/player-report\/3\.0/giu, "新版报告")
    .replace(/V3\s*结构化报告/giu, "比赛简报")
    .replace(/职责硬门禁均未通过，因此不输出负面职责结论。/gu, "现有数据不足以判断职责问题。")
    .replace(/通过职责硬门禁\s*(\d+)\s*场/gu, "$1 场具备完整的职责判断条件")
    .replace(/高置信度路线复核\s*0\s*个/gu, "没有发现需要优先复盘的路线窗口")
    .replace(/高置信度路线复核/gu, "可复盘路线")
    .replace(/对线置信度/gu, "数据可信度")
    .replace(/对线模型/gu, "对线评分")
    .replace(/职责硬门禁/gu, "职责判断条件")
    .replace(/高置信度/gu, "数据充分的")
    .replace(/证据门槛/gu, "判断条件")
    .replace(/资源存续门禁/gu, "资源是否仍可获取的条件")
    .replace(/路线门禁/gu, "路线安全条件")
    .replace(/门禁/gu, "判断条件")
    .replace(/聚合事实/gu, "比赛数据")
    .replace(/已归属伤害/gu, "记录伤害")
    .replace(/归属伤害/gu, "记录伤害")
    .replace(/结构化结论/gu, "比赛结论")
    .trim();
}

export function normalizePlayerReportJumpTarget(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const rawMapFocus = source.map_focus ?? source.mapFocus;
  const mapSource = rawMapFocus && typeof rawMapFocus === "object" ? rawMapFocus : {};
  const rawModule = String(source.module || "").trim();
  const module = {
    lane: "development",
    laning: "development",
    wards: "vision",
  }[rawModule] || rawModule;
  const entityType = String(source.entity_type ?? source.entityType ?? "").trim();
  const entityId = String(source.entity_id ?? source.entityId ?? "").trim();
  const playerSlot = finiteNumberOrNull(source.player_slot ?? source.playerSlot);
  const timeValue = finiteNumberOrNull(source.time);
  const time = timeValue == null ? null : Math.max(0, timeValue);
  const rangeStartValue = finiteNumberOrNull(source.range_start ?? source.rangeStart ?? time);
  const rangeEndValue = finiteNumberOrNull(source.range_end ?? source.rangeEnd ?? time);
  const rangeValid = rangeStartValue != null
    && rangeEndValue != null
    && rangeEndValue >= rangeStartValue;
  const rangeStart = rangeStartValue == null ? time : Math.max(0, rangeStartValue);
  const rangeEnd = rangeEndValue != null
    ? Math.max(rangeStart ?? 0, rangeEndValue)
    : rangeStart;

  const xValue = finiteNumberOrNull(mapSource.x);
  const yValue = finiteNumberOrNull(mapSource.y);
  const coordinateValid = (mapSource.coordinate_valid ?? mapSource.coordinateValid) === true
    && xValue != null
    && yValue != null
    && xValue >= 0
    && xValue <= 100
    && yValue >= 0
    && yValue <= 100;
  const region = String(mapSource.region || "").trim();
  const regionValid = Boolean(region)
    && !["unknown", "未定位"].includes(region);
  const locationLevel = coordinateValid
    ? "L3"
    : entityId && regionValid
      ? "L2"
      : entityId && time !== null
        ? "L1"
        : "L0";

  const mapFocus = {
    coordinateValid,
    x: coordinateValid ? xValue : null,
    y: coordinateValid ? yValue : null,
    region: regionValid ? region : "",
    coordinateSpace: String(
      mapSource.coordinate_space ?? mapSource.coordinateSpace ?? "",
    ).trim(),
    coordinateSource: String(
      mapSource.coordinate_source ?? mapSource.coordinateSource ?? "",
    ).trim(),
    coordinateVersion: String(
      mapSource.coordinate_version ?? mapSource.coordinateVersion ?? "",
    ).trim(),
    locationConfidence: finiteNumber(
      mapSource.location_confidence ?? mapSource.locationConfidence,
    ),
  };
  const returnContextValue = source.return_context ?? source.returnContext;
  const returnContext = returnContextValue && typeof returnContextValue === "object"
    ? { ...returnContextValue }
    : {};

  return {
    module,
    entityType,
    entityId,
    playerSlot,
    time,
    rangeStart,
    rangeEnd,
    rangeValid,
    locationLevel,
    mapFocus,
    returnContext,
    reviewable: rangeValid
      && Boolean(entityType)
      && Boolean(entityId)
      && ["L2", "L3"].includes(locationLevel),
  };
}

export function normalizePlayerReportInsightOccurrences(value = []) {
  if (!Array.isArray(value)) return [];
  return value.map((occurrence, index) => {
    const source = occurrence && typeof occurrence === "object" ? occurrence : {};
    const jumpTarget = normalizePlayerReportJumpTarget(
      source.jump_target ?? source.jumpTarget,
    );
    const timeValue = finiteNumberOrNull(source.time ?? jumpTarget.time);
    const arrivalDeltaValue = finiteNumberOrNull(
      source.arrival_delta_seconds ?? source.arrivalDeltaSeconds,
    );
    const fightId = String(
      source.fight_id ?? source.fightId ?? jumpTarget.entityId ?? "",
    ).trim();

    return {
      id: String(source.id || fightId || `occurrence-${index}`),
      fightId,
      time: timeValue == null ? jumpTarget.time : Math.max(0, timeValue),
      region: String(source.region || jumpTarget.mapFocus.region || "").trim(),
      label: String(source.label || "").trim(),
      arrivalDeltaSeconds: arrivalDeltaValue,
      missedFirstRotation:
        (source.missed_first_rotation ?? source.missedFirstRotation) === true,
      joinFeasibility: String(
        source.join_feasibility ?? source.joinFeasibility ?? "",
      ).trim(),
      jumpTarget,
    };
  }).filter((occurrence) => occurrence.jumpTarget.reviewable);
}

export function ordinaryPlayerReportInsightEligible(insight = {}) {
  const explicit = insight.ordinary_eligible ?? insight.ordinaryEligible;
  if (explicit !== true) return false;
  const jumpTarget = normalizePlayerReportJumpTarget(
    insight.jump_target ?? insight.jumpTarget,
  );
  return jumpTarget.reviewable;
}

export function resolvePlayerReportReviewNavigation(value = {}) {
  const target = normalizePlayerReportJumpTarget(value);
  const entityNavigation = {
    fight: ["combat", "selectedCombatId"],
    farm_diagnostic: ["farm", "selectedFarmDiagnosticId"],
    ward: ["vision", "selectedWardId"],
    lane_checkpoint: ["development", null],
    purchase: ["build", null],
    death: ["timeline", null],
    objective: ["timeline", null],
    teleport: ["timeline", null],
  };
  const mapped = entityNavigation[target.entityType];
  const validViews = new Set([
    "development",
    "farm",
    "map",
    "vision",
    "build",
    "combat",
    "timeline",
    "player-score",
    "players",
    "coverage",
  ]);
  const view = mapped?.[0]
    || (validViews.has(target.module) ? target.module : "timeline");
  const seekTime = target.rangeValid && target.rangeStart != null
    ? target.rangeStart
    : target.time ?? 0;

  return {
    view,
    selectedStateKey: mapped?.[1] || null,
    selectedId: mapped?.[1] ? target.entityId : null,
    developmentSideView: target.entityType === "lane_checkpoint" ? "lane" : null,
    seekTime,
    rangeStart: target.rangeValid ? target.rangeStart : seekTime,
    rangeEnd: target.rangeValid ? target.rangeEnd : seekTime,
    mapFocus: target.mapFocus,
    returnContext: target.returnContext,
  };
}

export function selectOrdinaryPlayerReportContent(brief = {}) {
  const stories = Array.isArray(brief.stories) ? brief.stories.filter(Boolean).slice(0, 3) : [];
  const strengths = Array.isArray(brief.strengths)
    ? brief.strengths.filter(ordinaryPlayerReportInsightEligible)
    : [];
  const priorities = Array.isArray(brief.priorities)
    ? brief.priorities.filter(ordinaryPlayerReportInsightEligible)
    : [];
  const training = Array.isArray(brief.training) ? brief.training.filter(Boolean) : [];
  const strength = strengths[0] || null;
  const priority = priorities[0] || null;
  const priorityId = String(priority?.id || "");
  const matchedTraining = priorityId
    ? training.find((item) => (
      Array.isArray(item?.sourceInsights)
      && item.sourceInsights.some((sourceId) => String(sourceId) === priorityId)
    ))
    : null;

  return {
    stories,
    strength,
    priority,
    training: matchedTraining || training[0] || null,
  };
}

export function normalizePlayerStoryVerdict(value, fallback = "missing") {
  const verdict = String(value || "");
  return PLAYER_STORY_VERDICTS.has(verdict)
    ? verdict
    : PLAYER_STORY_VERDICTS.has(fallback) ? fallback : "missing";
}

export function playerReportUpgradeState(report) {
  const hasReport = Boolean(report);
  const current = hasReport && report.model === "player-report/4.0";
  const legacy = hasReport && !current;
  const missingCombatTiming = hasReport
    && report.combat_timing?.model !== "player-combat-timing/1.0";
  const missingScoringAudit = current
    && report.score_card?.audit?.model !== "player-report-score-audit/1.0";
  return {
    hasReport,
    legacy,
    missingCombatTiming,
    missingScoringAudit,
    needsUpgrade: !hasReport || legacy || missingCombatTiming || missingScoringAudit,
  };
}

export function recomputePlayerReportBaseComponents(components = []) {
  const sourceComponents = Array.isArray(components) ? components : [];
  const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
  const round4 = (value) => Math.round((value + Number.EPSILON) * 10000) / 10000;
  const clampScore = (value) => Math.max(0, Math.min(100, value));
  const parsedRows = sourceComponents.map((component, index) => {
    const source = component && typeof component === "object" && !Array.isArray(component)
      ? component
      : null;
    const key = source == null ? "" : String(source.key ?? "").trim();
    const available = source?.available === true;
    const localWeight = finiteNumberOrNull(source?.local_weight);
    const normalizedScore = finiteNumberOrNull(source?.normalized_score);
    const storedEffectiveWeight = finiteNumberOrNull(source?.effective_local_weight);
    const storedContribution = finiteNumberOrNull(source?.weighted_contribution);
    const malformed = source == null
      || !key
      || typeof source.available !== "boolean"
      || localWeight == null
      || localWeight <= 0
      || storedEffectiveWeight == null
      || (available && normalizedScore == null)
      || (available && storedContribution == null)
      || (!available && (normalizedScore != null || storedContribution != null));
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
  for (const row of parsedRows) {
    if (row.key) keyCounts.set(row.key, (keyCounts.get(row.key) || 0) + 1);
  }
  for (const row of parsedRows) {
    if (row.key && keyCounts.get(row.key) > 1) {
      row.issues.push("base_component_duplicate_key");
    }
  }

  const availableRows = parsedRows.filter((row) => row.available && !row.malformed);
  const maximumWeight = availableRows.reduce(
    (maximum, row) => Math.max(maximum, row.localWeight),
    0,
  );
  const scaledDenominator = maximumWeight > 0
    ? availableRows.reduce((sum, row) => sum + row.localWeight / maximumWeight, 0)
    : 0;
  const canRecompute = scaledDenominator > 0 && Number.isFinite(scaledDenominator);
  let recomputedScore = null;
  let recomputedWeightSum = 0;
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
    recomputedWeightSum = availableRows.reduce(
      (sum, row) => sum + row.recomputedEffectiveWeight,
      0,
    );
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
  for (const row of parsedRows) {
    if (!row.malformed && row.storedEffectiveWeight != null
        && Math.abs(row.storedEffectiveWeight - row.recomputedEffectiveWeight) > 0.05) {
      row.issues.push("base_component_weight_mismatch");
    }
    if (row.available && !row.malformed && row.storedContribution != null
        && Math.abs(row.storedContribution - row.recomputedContribution) > 0.05) {
      row.issues.push("base_component_contribution_mismatch");
    }
  }

  const issues = [];
  if (!Array.isArray(components) || !parsedRows.length || parsedRows.some((row) => row.malformed)) {
    issues.push("base_component_malformed");
  }
  if (parsedRows.some((row) => row.issues.includes("base_component_duplicate_key"))) {
    issues.push("base_component_duplicate_key");
  }
  if (parsedRows.some((row) => row.issues.includes("base_component_weight_mismatch"))) {
    issues.push("base_component_weight_mismatch");
  }
  if (parsedRows.some((row) => row.issues.includes("base_component_contribution_mismatch"))) {
    issues.push("base_component_contribution_mismatch");
  }
  if (canRecompute && (storedScore == null || Math.abs(storedScore - recomputedScore) > 0.05)) {
    issues.push("base_component_score_mismatch");
  }
  if (canRecompute && (weightSum == null || Math.abs(weightSum - 100) > 0.01)) {
    issues.push("base_component_weight_sum_mismatch");
  }

  return {
    supported: true,
    rows: parsedRows.map((row) => ({
      key: row.key,
      available: row.available,
      storedEffectiveWeight: row.storedEffectiveWeight,
      recomputedEffectiveWeight: row.recomputedEffectiveWeight,
      storedContribution: row.storedContribution,
      recomputedContribution: row.recomputedContribution,
      issues: row.issues,
      valid: row.issues.length === 0,
    })),
    storedScore,
    recomputedScore,
    weightSum,
    recomputedWeightSum: canRecompute ? round4(recomputedWeightSum) : null,
    issues,
    valid: issues.length === 0,
  };
}

export function recomputePlayerReportScoreAudit(report = {}) {
  const scoreCard = report?.score_card && typeof report.score_card === "object"
    ? report.score_card
    : report;
  const dimensions = Array.isArray(scoreCard?.dimensions) ? scoreCard.dimensions : [];
  const atomicModel = (report?.base_component_model ?? scoreCard?.base_component_model)
    === "player-report-base-components/1.0";
  const tolerance = Math.min(
    0.05,
    Math.max(
      0.001,
      finiteNumberOrNull(scoreCard?.audit?.recomputation_tolerance) ?? 0.05,
    ),
  );
  const round = (value) => Math.round((finiteNumber(value) + Number.EPSILON) * 100) / 100;
  const differenceValid = (left, right) => (
    left != null && right != null && Math.abs(left - right) <= tolerance
  );
  const pathCounts = {
    embedded: 0,
    modifier: 0,
    context_only: 0,
  };
  const rootComponents = Array.isArray(report?.root_causes)
    ? report.root_causes.flatMap((root) => (
      Array.isArray(root?.scoring_impacts) ? root.scoring_impacts : []
    ))
    : [];
  const dimensionComponents = dimensions.flatMap((dimension) => (
    Array.isArray(dimension?.scoring_components) ? dimension.scoring_components : []
  ));
  const auditComponents = rootComponents.length ? rootComponents : dimensionComponents;
  const appliedDedupeKeys = [];
  const appliedDedupeKeySet = new Set();
  const duplicateAppliedDedupeKeys = new Set();
  let invalidNonModifierApplied = false;
  for (const component of auditComponents) {
    const path = String(component?.score_path || "");
    if (Object.prototype.hasOwnProperty.call(pathCounts, path)) pathCounts[path] += 1;
    const applied = finiteNumberOrNull(component?.applied_delta);
    const dedupeKey = String(component?.dedupe_key || "");
    if (applied == null || Math.abs(applied) <= 0.0001) continue;
    if (path !== "modifier") {
      invalidNonModifierApplied = true;
      continue;
    }
    if (!dedupeKey) continue;
    if (appliedDedupeKeySet.has(dedupeKey)) duplicateAppliedDedupeKeys.add(dedupeKey);
    else {
      appliedDedupeKeySet.add(dedupeKey);
      appliedDedupeKeys.push(dedupeKey);
    }
  }

  const rows = dimensions.map((dimension) => {
    const key = String(dimension?.key || "");
    const baseScore = finiteNumberOrNull(dimension?.base_score);
    const storedModifier = finiteNumberOrNull(dimension?.behavior_modifier);
    const storedFinalScore = finiteNumberOrNull(dimension?.final_score);
    const effectiveWeight = Math.max(0, finiteNumber(dimension?.effective_weight));
    const available = dimension?.available !== false
      && baseScore != null
      && storedFinalScore != null
      && effectiveWeight > 0;
    const components = Array.isArray(dimension?.scoring_components)
      ? dimension.scoring_components
      : [];
    const baseComponents = Array.isArray(dimension?.base_components)
      ? dimension.base_components
      : [];
    const baseComponentAudit = recomputePlayerReportBaseComponents(baseComponents);
    const componentModifier = round(components.reduce(
      (sum, component) => (
        component?.score_path === "modifier"
          ? sum + finiteNumber(component?.applied_delta)
          : sum
      ),
      0,
    ));
    const recomputedFinalScore = baseScore == null
      ? null
      : round(Math.max(0, Math.min(100, baseScore + componentModifier)));
    const issues = [];
    if (atomicModel && !baseComponentAudit.valid) {
      issues.push(...baseComponentAudit.issues);
    }
    if (atomicModel && baseComponents.some(
      (component) => String(component?.key || "") === "existing_dimension_model",
    )) {
      issues.push("aggregate_component_in_current_report");
    }
    if (atomicModel && available && !differenceValid(baseScore, baseComponentAudit.recomputedScore)) {
      issues.push("base_component_score_mismatch");
    }
    if (available && !differenceValid(storedModifier, componentModifier)) {
      issues.push("dimension_modifier_mismatch");
    }
    if (available && !differenceValid(storedFinalScore, recomputedFinalScore)) {
      issues.push("dimension_final_mismatch");
    }
    const scoreAlias = finiteNumberOrNull(dimension?.score);
    if (available && scoreAlias != null && !differenceValid(scoreAlias, storedFinalScore)) {
      issues.push("dimension_score_alias_mismatch");
    }
    return {
      key,
      available,
      baseScore,
      storedModifier,
      componentModifier,
      storedFinalScore,
      recomputedFinalScore,
      effectiveWeight,
      baseContribution: available ? round(baseScore * effectiveWeight / 100) : null,
      finalContribution: available ? round(recomputedFinalScore * effectiveWeight / 100) : null,
      components,
      baseComponentAudit,
      issues,
      valid: issues.length === 0,
    };
  });

  const included = rows.filter((row) => row.available);
  const weightDenominator = included.reduce((sum, row) => sum + row.effectiveWeight, 0);
  const recomputedBaseScore = weightDenominator > 0
    ? round(included.reduce(
      (sum, row) => sum + row.baseScore * row.effectiveWeight,
      0,
    ) / weightDenominator)
    : null;
  const recomputedFinalScore = weightDenominator > 0
    ? round(included.reduce(
      (sum, row) => sum + row.recomputedFinalScore * row.effectiveWeight,
      0,
    ) / weightDenominator)
    : null;
  const recomputedBehaviorModifier = recomputedBaseScore == null || recomputedFinalScore == null
    ? null
    : round(recomputedFinalScore - recomputedBaseScore);
  const storedBaseScore = finiteNumberOrNull(scoreCard?.base_score);
  const storedBehaviorModifier = finiteNumberOrNull(scoreCard?.behavior_modifier);
  const storedFinalScore = finiteNumberOrNull(scoreCard?.final_score ?? scoreCard?.overall_score);
  const issues = [];
  if (!differenceValid(storedBaseScore, recomputedBaseScore)) issues.push("overall_base_mismatch");
  if (!differenceValid(storedFinalScore, recomputedFinalScore)) issues.push("overall_final_mismatch");
  if (!differenceValid(storedBehaviorModifier, recomputedBehaviorModifier)) {
    issues.push("overall_modifier_mismatch");
  }
  if (duplicateAppliedDedupeKeys.size) issues.push("duplicate_applied_dedupe_key");
  if (invalidNonModifierApplied) issues.push("non_modifier_applied_delta");
  if (atomicModel && rows.some((row) => row.issues.includes("aggregate_component_in_current_report"))) {
    issues.push("aggregate_component_in_current_report");
  }
  if (!included.length) issues.push("no_available_dimensions");
  if (rows.some((row) => !row.valid)) issues.push("dimension_recomputation_failed");

  const supported = report?.model === "player-report/4.0"
    || scoreCard?.model === "player-report/4.0";
  return {
    model: String(report?.model || scoreCard?.model || ""),
    supported,
    atomicModel,
    tolerance,
    rows,
    storedBaseScore,
    storedBehaviorModifier,
    storedFinalScore,
    recomputedBaseScore,
    recomputedBehaviorModifier,
    recomputedFinalScore,
    weightDenominator: round(weightDenominator),
    pathCounts,
    appliedDedupeKeys,
    duplicateAppliedDedupeKeys: [...duplicateAppliedDedupeKeys],
    issues,
    valid: supported && issues.length === 0,
  };
}

export function formatCountdownSeconds(value) {
  const seconds = Math.max(0, finiteNumber(value));
  return `${Math.ceil(seconds)} 秒`;
}

export function resourceClockPatchLabel(replayPatch, rulesPatch) {
  const replay = String(replayPatch || "").replace(/^Patch\s*/i, "").trim();
  const rules = String(rulesPatch || "").replace(/^Patch\s*/i, "").trim();
  if (replay && rules && replay !== rules) return `Replay ${replay} · 规则基线 ${rules}`;
  if (replay || rules) return `${replay || rules} 资源时钟`;
  return "资源时钟";
}

export function combatVisionStatus(vision = {}) {
  const nearbyObservers = Math.max(0, finiteNumber(vision.nearby_observers));
  const nearbySentries = Math.max(0, finiteNumber(vision.nearby_sentries));
  const observerCoverage = Boolean(vision.observer_coverage);
  const sentryCoverage = Boolean(vision.sentry_coverage);

  if (observerCoverage) {
    return sentryCoverage ? "主战场有观察视野 · 有反隐" : "主战场有观察视野";
  }
  if (nearbyObservers > 0) {
    return sentryCoverage
      ? "附近有眼，主战场未覆盖 · 有反隐"
      : "附近有眼，主战场未覆盖";
  }
  if (sentryCoverage || nearbySentries > 0) return "仅有反隐，没有观察视野";
  return "主战场无观察视野";
}

export function countPlayerLaneWaves(waves = [], slot) {
  const key = String(slot);
  return waves.filter((wave) => (
    Object.prototype.hasOwnProperty.call(wave?.last_hits_by_slot || {}, key)
    || Object.prototype.hasOwnProperty.call(wave?.denies_by_slot || {}, key)
    || Object.prototype.hasOwnProperty.call(wave?.observed_gold_by_slot || {}, key)
  )).length;
}

export function upsertTaskHistory(history = [], job, limit = 20) {
  if (!job?.id) return normalizeTaskHistory(history, limit);
  return normalizeTaskHistory(
    [job, ...history.filter((item) => String(item?.id || "") !== String(job.id))],
    limit,
  );
}

export function normalizeTaskHistory(value, limit = 20) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((job) => job && job.id && job.match_id != null && job.status)
    .slice(0, Math.max(1, limit))
    .map((job) => ({ ...job }));
}

export function activeTaskFromHistory(history = []) {
  return normalizeTaskHistory(history).find((job) => !TERMINAL_TASK_STATUSES.has(job.status)) || null;
}

export function createMatchCache(accountId, matches, fetchedAt) {
  return {
    schema: "match-list-cache/1.0",
    account_id: String(accountId),
    saved_at: new Date().toISOString(),
    fetched_at: fetchedAt || null,
    matches: Array.isArray(matches) ? matches : [],
  };
}

export function normalizeMatchCache(value, accountId) {
  if (!value || value.schema !== "match-list-cache/1.0") return null;
  if (String(value.account_id || "") !== String(accountId || "")) return null;
  if (!Array.isArray(value.matches) || value.matches.length === 0) return null;
  return {
    ...value,
    matches: value.matches.slice(0, 100),
  };
}

export function resolveMatchListFailure(cacheValue, accountId, errorMessage = "OpenDota 暂时不可用") {
  const cache = normalizeMatchCache(cacheValue, accountId);
  if (!cache) {
    return {
      status: "error",
      offline: false,
      matches: [],
      fetchedAt: null,
      savedAt: null,
      error: errorMessage,
    };
  }
  return {
    status: "ready",
    offline: true,
    matches: cache.matches,
    fetchedAt: cache.fetched_at || cache.saved_at || null,
    savedAt: cache.saved_at || null,
    error: errorMessage,
  };
}

export function coverageImpactFor(moduleKey, evidence = {}) {
  const catalog = COVERAGE_IMPACT_CATALOG[moduleKey] || {
    label: moduleKey || "未知模块",
    reliable: "当前页面只展示已经记录的事实。",
    limited: "缺失字段会降低相关结论的可用性。",
    suppressed: "证据不足时不会生成确定建议。",
  };
  const missing = Array.isArray(evidence.missing) ? evidence.missing.filter(Boolean) : [];
  return {
    key: moduleKey,
    ...catalog,
    status: evidence.status || (missing.length ? "partial" : "available"),
    confidence: finiteNumber(evidence.confidence),
    missing,
  };
}
