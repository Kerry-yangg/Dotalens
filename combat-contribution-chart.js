const TEAM_COLORS = Object.freeze({
  radiant: "#53b77f",
  dire: "#df5b61",
});

const STATUS_COLORS = Object.freeze({
  blocked: "#d8a447",
  insufficient_evidence: "#7b858a",
  role_uncertain: "#7b858a",
  participant_no_events: "#626b70",
  not_participant: "#626b70",
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function seriesColor(row) {
  return STATUS_COLORS[row.status] || TEAM_COLORS[row.team] || STATUS_COLORS.insufficient_evidence;
}

export function combatContributionSeriesDatum(row = {}) {
  return {
    value: row.available ? Math.max(0, Number(row.value) || 0) : 0,
    slot: Number(row.slot),
    team: row.team,
    position: Number(row.position),
    hero: row.hero || {},
    status: row.status || "insufficient_evidence",
    available: row.available === true,
    display: row.display || "--",
    secondary: row.secondary || "",
    itemStyle: {
      color: seriesColor(row),
      opacity: row.available ? 0.94 : 0.52,
    },
  };
}

export function combatContributionTooltip(params = {}) {
  const row = params.data || {};
  const hero = row.hero || {};
  const identity = [hero.player, hero.name].filter(Boolean).map(escapeHtml).join(" · ");
  const status = escapeHtml(row.display || "证据不足");
  const secondary = row.secondary
    ? `<small class="combat-chart-tooltip-secondary">${escapeHtml(row.secondary)}</small>`
    : "";
  const value = row.available
    ? `<strong class="combat-chart-tooltip-value">${status}</strong>`
    : `<strong class="combat-chart-tooltip-state">${status}</strong>`;
  return [
    `<div class="combat-chart-tooltip">`,
    `<span>${escapeHtml(params.seriesName || row.team || "")}</span>`,
    `<b>${identity || "未知玩家"}</b>`,
    value,
    secondary,
    `</div>`,
  ].join("");
}

export function combatContributionChartOption(model = {}) {
  const max = Math.max(1, Number(model.maxValue) || 1);
  const labelWidth = Math.max(118, Number(model.labelWidth) || 190);
  const positions = Array.isArray(model.positions) ? model.positions.map(String) : [];
  const commonYAxis = {
    type: "category",
    data: positions,
    inverse: true,
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { show: false },
  };
  return {
    animationDuration: 180,
    animationDurationUpdate: 140,
    tooltip: {
      trigger: "item",
      confine: true,
      backgroundColor: "#24292d",
      borderColor: "#495158",
      padding: [9, 11],
      textStyle: { color: "#f2f0e9", fontSize: 12 },
      formatter: combatContributionTooltip,
    },
    grid: [
      { left: labelWidth, right: "52%", top: 8, bottom: 8, containLabel: false },
      { left: "52%", right: labelWidth, top: 8, bottom: 8, containLabel: false },
    ],
    xAxis: [
      {
        type: "value",
        inverse: true,
        min: 0,
        max,
        show: false,
        splitNumber: 4,
      },
      {
        type: "value",
        min: 0,
        max,
        show: false,
        splitNumber: 4,
        gridIndex: 1,
      },
    ],
    yAxis: [
      commonYAxis,
      { ...commonYAxis, gridIndex: 1 },
    ],
    series: [
      {
        name: "天辉",
        type: "bar",
        barWidth: 18,
        data: (model.radiant || []).map(combatContributionSeriesDatum),
        itemStyle: { borderRadius: [3, 0, 0, 3] },
        emphasis: { focus: "self" },
      },
      {
        name: "夜魇",
        type: "bar",
        xAxisIndex: 1,
        yAxisIndex: 1,
        barWidth: 18,
        data: (model.dire || []).map(combatContributionSeriesDatum),
        itemStyle: { borderRadius: [0, 3, 3, 0] },
        emphasis: { focus: "self" },
      },
    ],
  };
}

export function combatResponsibilityRadarOption(model = {}) {
  const axes = (model.roleAxes || []).filter((axis) => (
    axis?.applicable && axis?.available && Number.isFinite(Number(axis.value))
  ));
  if (axes.length < 3) return null;
  return {
    animationDuration: 180,
    animationDurationUpdate: 140,
    tooltip: {
      trigger: "item",
      confine: true,
      backgroundColor: "#24292d",
      borderColor: "#495158",
      textStyle: { color: "#f2f0e9", fontSize: 12 },
    },
    radar: {
      triggerEvent: true,
      radius: "66%",
      splitNumber: 4,
      indicator: axes.map((axis) => ({
        name: axis.label,
        max: 100,
        key: axis.key,
      })),
      axisName: { color: "#aeb6bb", fontSize: 11 },
      splitLine: { lineStyle: { color: "#343a3f" } },
      splitArea: { areaStyle: { color: ["#15191b", "#181d20"] } },
      axisLine: { lineStyle: { color: "#343a3f" } },
    },
    series: [{
      type: "radar",
      symbolSize: 5,
      data: [{
        value: axes.map((axis) => Number(axis.value)),
        areaStyle: { color: "rgba(94,159,214,.18)" },
        lineStyle: { color: "#5e9fd6", width: 2 },
        itemStyle: { color: "#5e9fd6" },
      }],
    }],
  };
}
