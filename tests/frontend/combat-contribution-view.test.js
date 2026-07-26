import assert from "node:assert/strict";
import test from "node:test";

import {
  combatContributionAuditScrollTarget,
  combatContributionAccessibleMarkup,
  combatDimensionDetailMarkup,
  combatContributionLabelMarkup,
  combatContributionPairedRows,
  combatContributionSampleLabel,
  combatScoreComponentsMarkup,
} from "../../combat-contribution-view.js";

function datum(slot, team, position, overrides = {}) {
  return {
    slot,
    team,
    position,
    hero: {
      player: `玩家${slot}`,
      name: `英雄${slot}`,
      token: `hero_${slot}`,
    },
    status: "passed",
    available: true,
    value: 70,
    display: "70",
    secondary: "",
    ...overrides,
  };
}

const model = {
  metric: "responsibility",
  label: "职责评分",
  positions: [1, 2, 3, 4, 5],
  radiant: Array.from({ length: 5 }, (_, index) => datum(index, "radiant", index + 1)),
  dire: Array.from({ length: 5 }, (_, index) => datum(index + 5, "dire", index + 1)),
};

test("label rows keep same-position opponents paired", () => {
  const rows = combatContributionPairedRows(model);

  assert.equal(rows.length, 5);
  assert.equal(rows[2].position, 3);
  assert.equal(rows[2].radiant.slot, 2);
  assert.equal(rows[2].dire.slot, 7);
});

test("label markup renders all ten clickable players and the active state", () => {
  const markedModel = {
    ...model,
    dire: model.dire.map((row) => (
      row.slot === 7
        ? { ...row, status: "not_participant", available: false, display: "未进入主战场" }
        : row
    )),
  };
  const markup = combatContributionLabelMarkup({
    model: markedModel,
    selectedSlot: 2,
    heroImage: (hero) => `/heroes/${hero.token}.png`,
  });

  assert.equal((markup.match(/data-combat-player-slot=/g) || []).length, 10);
  assert.match(markup, /data-combat-player-slot="2"[^>]*aria-pressed="true"/);
  assert.match(markup, /data-combat-player-slot="7"/);
  assert.match(markup, /未进入主战场/);
  assert.match(markup, /\/heroes\/hero_2\.png/);
});

test("accessible summary exposes every player and metric state", () => {
  const markup = combatContributionAccessibleMarkup(model);

  assert.equal((markup.match(/<li>/g) || []).length, 10);
  assert.match(markup, /天辉 1 号位，玩家0，英雄0，职责评分 70/);
  assert.match(markup, /夜魇 5 号位，玩家9，英雄9，职责评分 70/);
});

test("sample label distinguishes current fight from filtered full-match aggregation", () => {
  assert.equal(
    combatContributionSampleLabel({
      scope: "current",
      fight: { title: "中路河道交战" },
    }),
    "当前团战 · 中路河道交战",
  );
  assert.equal(
    combatContributionSampleLabel({
      scope: "all",
      filter: "important",
      sampleCount: 7,
      totalCount: 18,
    }),
    "全场累计 · 重要战斗 · 7/18 场",
  );
});

test("audit drilldown scrolls to the content implied by the interaction", () => {
  assert.equal(combatContributionAuditScrollTarget("player"), "top");
  assert.equal(combatContributionAuditScrollTarget("dimension"), "detail");
  assert.equal(combatContributionAuditScrollTarget("scope"), "preserve");
});

test("score component markup keeps positive penalties and suppressed states drillable", () => {
  const markup = combatScoreComponentsMarkup({
    scoreBreakdownAvailable: true,
    scoreComponents: [
      {
        key: "damage_share",
        label: "输出占比",
        points: 27.8,
        maxPoints: 38,
        rawValue: 27.8,
        rawUnit: "percent",
        tone: "positive",
        ratio: 73.2,
        judgmentSuppressed: false,
      },
      {
        key: "death_penalty",
        label: "生存代价",
        points: -14,
        maxPoints: 0,
        rawValue: 2,
        rawUnit: "deaths",
        tone: "negative",
        ratio: 0,
        judgmentSuppressed: true,
      },
    ],
  }, "death_penalty");

  assert.equal((markup.match(/data-combat-contribution-dimension=/g) || []).length, 2);
  assert.match(markup, /data-combat-contribution-dimension="death_penalty"[^>]*aria-pressed="true"/);
  assert.match(markup, /门禁抑制/);
  assert.match(markup, /-14/);
});

test("legacy score component markup asks for a real reparse", () => {
  const markup = combatScoreComponentsMarkup({
    scoreBreakdownAvailable: false,
    legacyPackage: true,
  });

  assert.match(markup, /旧分析包未包含评分分项/);
  assert.match(markup, /重新解析/);
});

test("dimension evidence markup carries exact navigation identity", () => {
  const markup = combatDimensionDetailMarkup({
    scope: "all",
    gateStatus: "passed",
    roleConfidence: 91,
    selectedDimension: {
      key: "damage_share",
      label: "输出占比",
      value: 27.8,
      share: 27.8,
      opponentValue: 31.2,
      points: 27.8,
      maxPoints: 38,
      rawUnit: "percent",
      evidence: [{
        fight_id: "fight-8",
        fight_title: "夜魇野区团战",
        game_time_ms: 43067,
        event_seq: 9980,
        kind: "damage",
        key: "shadow_shaman_shackles",
        value: 320,
      }],
    },
  }, {
    evidenceLabel: (event) => `枷锁造成 ${event.value} 伤害`,
  });

  assert.match(markup, /data-combat-evidence-fight-id="fight-8"/);
  assert.match(markup, /data-combat-evidence-time-ms="43067"/);
  assert.match(markup, /data-combat-evidence-seq="9980"/);
  assert.match(markup, /00:43\.067/);
  assert.match(markup, /夜魇野区团战/);
  assert.match(markup, /枷锁造成 320 伤害/);
});
