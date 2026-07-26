const TEAM_LABELS = Object.freeze({
  radiant: "天辉",
  dire: "夜魇",
});

const FILTER_LABELS = Object.freeze({
  all: "全部战斗",
  important: "重要战斗",
  critical: "关键战斗",
  teamfight: "团战",
});

const STATUS_LABELS = Object.freeze({
  passed: "证据通过",
  blocked: "客观条件阻断",
  insufficient_evidence: "证据不足",
  role_uncertain: "位置待确认",
  participant_no_events: "参战事件不足",
  not_participant: "未进入主战场",
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function finiteSlot(value) {
  const slot = Number(value);
  return Number.isInteger(slot) ? slot : -1;
}

export function combatContributionAuditScrollTarget(action = "") {
  if (action === "player") return "top";
  if (action === "dimension") return "detail";
  return "preserve";
}

export function combatContributionPairedRows(model = {}) {
  const radiant = new Map((model.radiant || []).map((row) => [Number(row.position), row]));
  const dire = new Map((model.dire || []).map((row) => [Number(row.position), row]));
  const positions = Array.isArray(model.positions) && model.positions.length
    ? model.positions : [1, 2, 3, 4, 5];
  return positions.map((position) => ({
    position: Number(position),
    radiant: radiant.get(Number(position)) || null,
    dire: dire.get(Number(position)) || null,
  }));
}

function playerButton(row, selectedSlot, heroImage) {
  if (!row) return '<span class="combat-contribution-player-label empty" aria-hidden="true"></span>';
  const hero = row.hero || {};
  const slot = finiteSlot(row.slot);
  const active = slot === finiteSlot(selectedSlot);
  const status = STATUS_LABELS[row.status] || "证据状态未知";
  const image = typeof heroImage === "function" ? heroImage(hero) : "";
  return `<button class="combat-contribution-player-label ${escapeHtml(row.team)} ${active ? "active" : ""} ${escapeHtml(row.status || "")}" data-combat-player-slot="${slot}" aria-pressed="${active}" type="button">
    <img src="${escapeHtml(image)}" alt="${escapeHtml(hero.name || "未知英雄")}">
    <span class="combat-contribution-identity">
      <strong>${escapeHtml(hero.player || "未知玩家")}</strong>
      <small>${escapeHtml(hero.name || "未知英雄")}</small>
    </span>
    <span class="combat-contribution-value">
      <strong>${escapeHtml(row.display || "--")}</strong>
      <small>${escapeHtml(row.secondary || status)}</small>
    </span>
  </button>`;
}

export function combatContributionLabelMarkup({
  model = {},
  selectedSlot = -1,
  heroImage,
} = {}) {
  return combatContributionPairedRows(model).map((pair) => `
    <div class="combat-contribution-pair" data-combat-position="${pair.position}">
      ${playerButton(pair.radiant, selectedSlot, heroImage)}
      <span class="combat-contribution-position" aria-hidden="true">${pair.position}</span>
      ${playerButton(pair.dire, selectedSlot, heroImage)}
    </div>
  `).join("");
}

export function combatContributionAccessibleMarkup(model = {}) {
  const rows = combatContributionPairedRows(model)
    .flatMap((pair) => [pair.radiant, pair.dire])
    .filter(Boolean);
  return `<ol>${rows.map((row) => {
    const hero = row.hero || {};
    return `<li>${TEAM_LABELS[row.team] || row.team} ${row.position} 号位，${escapeHtml(hero.player || "未知玩家")}，${escapeHtml(hero.name || "未知英雄")}，${escapeHtml(model.label || "贡献")} ${escapeHtml(row.display || "--")}</li>`;
  }).join("")}</ol>`;
}

export function combatContributionSampleLabel({
  scope = "current",
  fight = null,
  filter = "all",
  sampleCount = 0,
  totalCount = 0,
} = {}) {
  if (scope !== "all") {
    return `当前团战 · ${fight?.title || "未选择战斗"}`;
  }
  return `全场累计 · ${FILTER_LABELS[filter] || FILTER_LABELS.all} · ${Number(sampleCount) || 0}/${Number(totalCount) || 0} 场`;
}

function formattedNumber(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: digits,
  }).format(number);
}

function formattedRawValue(value, unit) {
  if (value == null || !Number.isFinite(Number(value))) return "--";
  if (unit === "percent") return `${formattedNumber(value)}%`;
  if (unit === "seconds" || unit === "delay") return `${formattedNumber(value)} 秒`;
  if (unit === "health") return `${formattedNumber(value, 0)} 治疗`;
  if (unit === "deaths") return `${formattedNumber(value, 0)} 次阵亡`;
  if (unit === "casts") return `${formattedNumber(value, 0)} 次施法`;
  if (unit === "uses") return `${formattedNumber(value, 0)} 次使用`;
  if (unit === "wards") return `${formattedNumber(value, 0)} 个眼位`;
  if (unit === "score") return `${formattedNumber(value)} 分`;
  return formattedNumber(value, 1);
}

export function combatScoreComponentsMarkup(model = {}, selectedDimension = "") {
  if (!model.scoreBreakdownAvailable) {
    return `<div class="combat-score-upgrade">
      <strong>旧分析包未包含评分分项</strong>
      <span>重新解析后可查看每一项加分、扣分与门禁证据；当前不会由前端猜测。</span>
    </div>`;
  }
  return model.scoreComponents.map((component) => {
    const active = component.key === selectedDimension;
    const points = Number(component.points) || 0;
    const pointsText = points > 0 ? `+${formattedNumber(points)}` : formattedNumber(points);
    const cap = Number(component.maxPoints) > 0
      ? ` / ${formattedNumber(component.maxPoints)}`
      : "";
    const suppressed = component.judgmentSuppressed
      ? '<em class="combat-component-state">门禁抑制</em>'
      : "";
    return `<button class="combat-score-component ${escapeHtml(component.tone || "neutral")} ${component.judgmentSuppressed ? "suppressed" : ""} ${active ? "active" : ""}" data-combat-contribution-dimension="${escapeHtml(component.key)}" aria-pressed="${active}" type="button">
      <span class="combat-score-component-copy">
        <strong>${escapeHtml(component.label)}</strong>
        <small>${escapeHtml(formattedRawValue(component.rawValue, component.rawUnit))}</small>
      </span>
      ${suppressed}
      <span class="combat-score-component-points">${pointsText}${cap}</span>
      <span class="combat-score-component-track" aria-hidden="true"><span style="width:${Math.max(0, Math.min(100, Number(component.ratio) || 0))}%"></span></span>
    </button>`;
  }).join("");
}

function formatEvidenceTime(value) {
  const milliseconds = Math.max(0, Math.round(Number(value) || 0));
  const minutes = Math.floor(milliseconds / 60000);
  const seconds = Math.floor(milliseconds % 60000 / 1000);
  const millis = milliseconds % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

export function combatDimensionDetailMarkup(model = {}, options = {}) {
  const dimension = model.selectedDimension || {};
  const evidence = Array.isArray(dimension.evidence) ? dimension.evidence : [];
  const gateLabel = STATUS_LABELS[model.gateStatus] || model.gateStatus || "证据状态未知";
  const evidenceLabel = typeof options.evidenceLabel === "function"
    ? options.evidenceLabel
    : (event) => [event.kind, event.key, event.value].filter((value) => value != null && value !== "").join(" · ");
  const score = dimension.points == null
    ? "--"
    : `${Number(dimension.points) > 0 ? "+" : ""}${formattedNumber(dimension.points)}${dimension.maxPoints > 0 ? ` / ${formattedNumber(dimension.maxPoints)}` : ""}`;
  return `<section class="combat-dimension-section">
    <header>
      <span><small>当前下钻维度</small><strong>${escapeHtml(dimension.label || dimension.key || "贡献详情")}</strong></span>
      <em>${escapeHtml(gateLabel)} · 位置置信度 ${formattedNumber(model.roleConfidence, 0)}%</em>
    </header>
    <dl class="combat-dimension-facts">
      <div><dt>实际值</dt><dd>${escapeHtml(formattedRawValue(dimension.value, dimension.rawUnit))}</dd></div>
      <div><dt>队内占比</dt><dd>${dimension.share == null ? "--" : `${formattedNumber(dimension.share)}%`}</dd></div>
      <div><dt>同位置对手</dt><dd>${escapeHtml(formattedRawValue(dimension.opponentValue, dimension.rawUnit))}</dd></div>
      <div><dt>本项得分</dt><dd>${escapeHtml(score)}</dd></div>
    </dl>
    <div class="combat-dimension-evidence">
      <header><strong>关联事件</strong><span>${evidence.length} 条</span></header>
      ${evidence.length ? evidence.map((event) => {
        const timeMs = Math.round(Number(event.game_time_ms) || 0);
        const sequence = event.event_seq == null ? "" : Math.round(Number(event.event_seq));
        const fightId = event.fight_id || "";
        const fightTitle = model.scope === "all" && event.fight_title
          ? `<small>${escapeHtml(event.fight_title)}</small>` : "";
        return `<button type="button" data-combat-evidence-fight-id="${escapeHtml(fightId)}" data-combat-evidence-time-ms="${timeMs}" data-combat-evidence-seq="${escapeHtml(sequence)}">
          <time>${formatEvidenceTime(timeMs)}</time>
          <span>${escapeHtml(evidenceLabel(event))}${fightTitle}</span>
        </button>`;
      }).join("") : '<p class="combat-dimension-empty">该维度没有可跳转的逐事件证据。</p>'}
    </div>
  </section>`;
}
