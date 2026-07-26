import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateCombatContributions,
  buildCombatContributionRoster,
  combatContributionChartModel,
  combatContributionDrilldown,
  combatContributionMetric,
  filterCombatContributionFights,
} from "../../app-core.js";

const heroes = Array.from({ length: 10 }, (_, slot) => ({
  slot,
  team: slot < 5 ? "radiant" : "dire",
  position: slot % 5 + 1,
  name: `英雄${slot}`,
  player: `玩家${slot}`,
  token: `hero_${slot}`,
}));

test("current combat roster always contains ten players and separates absence states", () => {
  const fight = {
    id: "fight-1",
    participants: [0, 1, 5, 6],
    contributions: [
      contribution(0, {
        position: 1,
        damage: 1000,
        responsibilityScore: 80,
        responsibility_gate: { status: "passed" },
      }),
      contribution(5, {
        position: 1,
        damage: 700,
        responsibilityScore: 62,
        responsibility_gate: { status: "blocked" },
      }),
    ],
  };

  const rows = buildCombatContributionRoster({ heroes, fight });

  assert.equal(rows.length, 10);
  assert.equal(rows.find((row) => row.slot === 0).displayStatus, "passed");
  assert.equal(rows.find((row) => row.slot === 1).displayStatus, "participant_no_events");
  assert.equal(rows.find((row) => row.slot === 2).displayStatus, "not_participant");
  assert.equal(rows.find((row) => row.slot === 5).displayStatus, "blocked");
});

test("current combat roster orders each team by role position", () => {
  const shuffledHeroes = [
    { ...heroes[2], position: 3 },
    { ...heroes[0], position: 1 },
    { ...heroes[1], position: 2 },
    { ...heroes[4], position: 5 },
    { ...heroes[3], position: 4 },
    ...heroes.slice(5),
  ];

  const rows = buildCombatContributionRoster({
    heroes: shuffledHeroes,
    fight: { participants: [], contributions: [] },
  });

  assert.deepEqual(
    rows.filter((row) => row.team === "radiant").map((row) => row.position),
    [1, 2, 3, 4, 5],
  );
});

test("unpassed gate and uncertain role never expose a responsibility score", () => {
  const blocked = combatContributionMetric({
    responsibilityScore: 82,
    role_confidence: 96,
    responsibility_gate: { status: "blocked" },
  }, "responsibility");
  const uncertain = combatContributionMetric({
    responsibilityScore: 82,
    role_confidence: 60,
    responsibility_gate: { status: "passed" },
  }, "responsibility");

  assert.equal(blocked.available, false);
  assert.equal(blocked.display, "客观条件阻断");
  assert.equal(uncertain.available, false);
  assert.equal(uncertain.display, "位置待确认");
});

test("full-match shares use totals while presence uses contact-duration weighting", () => {
  const fights = [
    {
      id: "a",
      contact_start: 10,
      contact_end: 20,
      participants: [0, 1, 5],
      contributions: [
        contribution(0, {
          damage: 900,
          teamDamageShare: 90,
          presencePct: 100,
          arrivalDelay: 1,
          responsibilityScore: 80,
        }),
        contribution(1, {
          damage: 100,
          teamDamageShare: 10,
          presencePct: 100,
          arrivalDelay: 2,
          responsibilityScore: 70,
        }),
        contribution(5, {
          damage: 500,
          teamDamageShare: 100,
          presencePct: 100,
          arrivalDelay: 3,
          responsibilityScore: 60,
        }),
      ],
    },
    {
      id: "b",
      contact_start: 30,
      contact_end: 60,
      participants: [0, 1, 5],
      contributions: [
        contribution(0, {
          damage: 100,
          teamDamageShare: 10,
          presencePct: 50,
          arrivalDelay: 9,
          responsibilityScore: 60,
        }),
        contribution(1, {
          damage: 900,
          teamDamageShare: 90,
          presencePct: 50,
          arrivalDelay: 4,
          responsibilityScore: 80,
        }),
        contribution(5, {
          damage: 500,
          teamDamageShare: 100,
          presencePct: 50,
          arrivalDelay: 5,
          responsibilityScore: 60,
        }),
      ],
    },
  ];

  const rows = aggregateCombatContributions({ heroes, fights, timingFacts: [] });
  const row = rows.find((item) => item.slot === 0);

  assert.equal(row.damage, 1000);
  assert.equal(row.teamDamageShare, 50);
  assert.equal(row.presencePct, 62.5);
  assert.equal(row.arrivalMedianSeconds, 5);
  assert.equal(row.arrivalP75Seconds, 9);
  assert.equal(row.responsibilityScore, 65);
  assert.equal(row.passedGateCount, 2);
});

test("full-match responsibility excludes blocked and insufficient samples", () => {
  const fights = [{
    id: "gates",
    contact_start: 0,
    contact_end: 10,
    participants: [0, 1, 5],
    contributions: [
      contribution(0, {
        responsibilityScore: 90,
        responsibility_gate: { status: "blocked" },
      }),
      contribution(1, {
        responsibilityScore: 95,
        responsibility_gate: { status: "insufficient_evidence" },
      }),
      contribution(5, {
        responsibilityScore: 75,
        responsibility_gate: { status: "passed" },
      }),
    ],
  }];

  const rows = aggregateCombatContributions({ heroes, fights, timingFacts: [] });

  assert.equal(rows.find((row) => row.slot === 0).responsibilityScore, null);
  assert.equal(rows.find((row) => row.slot === 0).displayStatus, "blocked");
  assert.equal(rows.find((row) => row.slot === 1).responsibilityScore, null);
  assert.equal(rows.find((row) => row.slot === 1).displayStatus, "insufficient_evidence");
  assert.equal(rows.find((row) => row.slot === 5).responsibilityScore, 75);
});

test("full-match aggregation keeps uncertain roles distinct from missing evidence", () => {
  const rows = aggregateCombatContributions({
    heroes,
    fights: [{
      id: "uncertain-role",
      contact_start: 0,
      contact_end: 12,
      participants: [0],
      contributions: [contribution(0, {
        role_confidence: 54,
        responsibilityScore: 88,
        responsibility_gate: { status: "passed" },
      })],
    }],
    timingFacts: [],
  });
  const row = rows.find((item) => item.slot === 0);

  assert.equal(row.displayStatus, "role_uncertain");
  assert.equal(row.responsibilityScore, null);
  assert.equal(combatContributionMetric(row, "responsibility").display, "位置待确认");
});

test("combat timing facts replace legacy arrival delay for aggregation", () => {
  const fights = [{
    id: "timing",
    contact_start: 0,
    contact_end: 10,
    participants: [0],
    contributions: [contribution(0, { arrivalDelay: 18 })],
  }];
  const timingFacts = [{
    fight_id: "timing",
    player_slot: 0,
    arrival_delta_seconds: 3,
  }];

  const row = aggregateCombatContributions({ heroes, fights, timingFacts })
    .find((item) => item.slot === 0);

  assert.equal(row.arrivalMedianSeconds, 3);
  assert.equal(row.arrivalSource, "combat_timing");
});

test("chart model pairs same-position players and shares one scale", () => {
  const rows = buildCombatContributionRoster({
    heroes,
    fight: {
      participants: [0, 5],
      contributions: [
        contribution(0, { damage: 1200 }),
        contribution(5, { damage: 600 }),
      ],
    },
  });

  const model = combatContributionChartModel({ rows, metric: "damage" });

  assert.equal(model.maxValue, 1200);
  assert.equal(model.radiant[0].position, 1);
  assert.equal(model.radiant[0].value, 1200);
  assert.equal(model.dire[0].position, 1);
  assert.equal(model.dire[0].value, 600);
  assert.deepEqual(model.positions, [1, 2, 3, 4, 5]);
});

test("full-match fight filter uses only the explicit combat filter", () => {
  const fights = [
    { id: "routine", kind: "skirmish", importance: { tier: "routine", important: false } },
    { id: "important", kind: "gank", importance: { tier: "important", important: true } },
    { id: "critical", kind: "teamfight", importance: { tier: "critical", important: true } },
  ];

  assert.deepEqual(
    filterCombatContributionFights(fights, "all").map((fight) => fight.id),
    ["routine", "important", "critical"],
  );
  assert.deepEqual(
    filterCombatContributionFights(fights, "important").map((fight) => fight.id),
    ["important", "critical"],
  );
  assert.deepEqual(
    filterCombatContributionFights(fights, "critical").map((fight) => fight.id),
    ["critical"],
  );
  assert.deepEqual(
    filterCombatContributionFights(fights, "teamfight").map((fight) => fight.id),
    ["critical"],
  );
});

test("drilldown keeps unavailable role axes distinct from zero performance", () => {
  const model = combatContributionDrilldown({
    row: {
      slot: 3,
      position: 5,
      displayStatus: "passed",
      role_confidence: 92,
      responsibilityScore: 75,
      responsibility_gate: { status: "passed" },
      score_components: {
        healing: {
          points: 8,
          max_points: 16,
          raw_value: 1440,
          raw_unit: "health",
          judgment_suppressed: false,
          status: "applicable",
        },
      },
      dimension_evidence: {
        healing: [{ game_time_ms: 100000, event_seq: 3, value: 400 }],
      },
    },
    opponent: null,
    metric: "healing",
    scope: "current",
  });

  assert.equal(model.roleAxes.find((axis) => axis.key === "healing").applicable, true);
  assert.equal(model.roleAxes.find((axis) => axis.key === "healing").value, 50);
  assert.equal(model.roleAxes.find((axis) => axis.key === "vision_setup").applicable, false);
  assert.equal(model.roleAxes.find((axis) => axis.key === "vision_setup").value, null);
  assert.equal(model.selectedDimension.evidence[0].event_seq, 3);
});

test("legacy contribution keeps raw metrics and marks score components unavailable", () => {
  const model = combatContributionDrilldown({
    row: {
      slot: 0,
      position: 1,
      displayStatus: "passed",
      role_confidence: 90,
      responsibility_gate: { status: "passed" },
      damage: 2400,
      responsibilityScore: 78,
      score_components: null,
      dimension_evidence: null,
    },
    opponent: null,
    metric: "damage",
    scope: "current",
  });

  assert.equal(model.selectedDimension.value, 2400);
  assert.equal(model.scoreBreakdownAvailable, false);
  assert.equal(model.legacyPackage, true);
});

test("suppressed score component stays applicable but is unavailable for judgment", () => {
  const model = combatContributionDrilldown({
    row: {
      slot: 1,
      position: 2,
      displayStatus: "blocked",
      role_confidence: 88,
      responsibility_gate: { status: "blocked" },
      score_components: {
        control: {
          points: 6,
          max_points: 10,
          raw_value: 3,
          raw_unit: "seconds",
          judgment_suppressed: true,
          status: "applicable",
        },
      },
    },
    metric: "control",
  });

  const control = model.roleAxes.find((axis) => axis.key === "control");
  assert.equal(control.applicable, true);
  assert.equal(control.available, false);
  assert.equal(control.value, null);
});

function contribution(slot, overrides = {}) {
  return {
    slot,
    position: slot % 5 + 1,
    role_confidence: 96,
    damage: 0,
    damageTaken: 0,
    teamDamageShare: 0,
    teamDamageTakenShare: 0,
    abilityCasts: 0,
    itemUses: 0,
    controlSeconds: 0,
    healing: 0,
    presencePct: 0,
    arrivalDelay: 0,
    setupObservers: 0,
    setupSentries: 0,
    responsibilityScore: 70,
    responsibility_gate: { status: "passed" },
    score_components: {},
    dimension_evidence: {},
    ...overrides,
  };
}
