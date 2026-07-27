import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildSimplePlayerReport,
  normalizeReadingMode,
  presentSimpleInsight,
} from "../../app-core.js";

const htmlSource = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../../app.js", import.meta.url), "utf8");

function localizedInsight(overrides = {}) {
  const id = overrides.id || "localized";
  return {
    id,
    kind: "improvement",
    category: "combat",
    title: `结论 ${id}`,
    time: 600,
    timeEnd: 630,
    location: "中路河道",
    fact: "首轮技能结束后才进入战场。",
    judgment: "到场时机偏晚。",
    impact: "队伍第一轮交战少一人。",
    action: "冲突开始前提前靠近队友。",
    ordinaryEligible: true,
    localizationLevel: 3,
    gateStatus: "passed",
    jumpTarget: {
      module: "combat",
      entityType: "fight",
      entityId: `fight-${id}`,
      rangeStart: 590,
      rangeEnd: 640,
      mapFocus: { region: "mid_river" },
    },
    occurrences: [],
    ...overrides,
  };
}

function eligibleStrengths(count) {
  return Array.from({ length: count }, (_, index) => localizedInsight({
    id: `strength-${index}`,
    kind: "strength",
    category: "lane",
    time: 120 + index * 30,
    timeEnd: 140 + index * 30,
    jumpTarget: {
      module: "development",
      entityType: "lane_checkpoint",
      entityId: `lane-${index}`,
      rangeStart: 110 + index * 30,
      rangeEnd: 150 + index * 30,
      mapFocus: { region: "safe_lane" },
    },
  }));
}

function eligibleImprovements(count) {
  return Array.from({ length: count }, (_, index) => localizedInsight({
    id: `improvement-${index}`,
    time: 700 + index * 40,
    timeEnd: 730 + index * 40,
  }));
}

test("reading mode defaults to simple and preserves only professional", () => {
  assert.equal(normalizeReadingMode(null), "simple");
  assert.equal(normalizeReadingMode("deep"), "simple");
  assert.equal(normalizeReadingMode("professional"), "professional");
});

test("global reading mode controls replace the player report local preference", () => {
  assert.match(htmlSource, /id="reading-mode-switch"/);
  assert.match(htmlSource, /data-reading-mode="simple"[\s\S]*>简明</);
  assert.match(htmlSource, /data-reading-mode="professional"[\s\S]*>专业</);
  assert.match(htmlSource, /data-settings-panel="display"/);
  assert.match(appSource, /const READING_MODE_KEY = "dota-lens-reading-mode-v1"/);
  assert.match(appSource, /function setReadingMode\(/);
  assert.doesNotMatch(appSource, /PLAYER_SCORE_MODE_KEY/);
});

test("simple report always returns all six responsibility domains", () => {
  const report = buildSimplePlayerReport({ dimensions: [], insights: [] });
  assert.deepEqual(
    report.domains.map((domain) => domain.key),
    ["lane", "farm", "tempo", "combat", "vision", "execution"],
  );
  assert.ok(report.domains.every((domain) => domain.status === "insufficient"));
});

test("simple report keeps every eligible conclusion and merges one root cause", () => {
  const report = buildSimplePlayerReport({
    dimensions: [],
    insights: [
      ...eligibleStrengths(4),
      ...eligibleImprovements(5),
      localizedInsight({ id: "late-1", rootCauseId: "late-arrival", time: 940 }),
      localizedInsight({ id: "late-2", rootCauseId: "late-arrival", time: 1120 }),
      localizedInsight({
        id: "l1",
        jumpTarget: {
          module: "combat",
          entityType: "fight",
          entityId: "fight-l1",
          rangeStart: 590,
          rangeEnd: 640,
        },
      }),
      localizedInsight({ id: "blocked", ordinaryEligible: false }),
    ],
  });

  assert.equal(report.strengths.length, 4);
  assert.equal(report.improvements.length, 6);
  assert.equal(
    report.improvements.find((item) => item.rootCauseId === "late-arrival").occurrences.length,
    2,
  );
});

test("simple presentation exposes only plain-language review fields", () => {
  const presentation = presentSimpleInsight(localizedInsight({
    protocol: "player-report/4.0",
    gateStatus: "passed",
    scoreImpact: -4,
  }));

  assert.deepEqual(Object.keys(presentation).sort(), [
    "action", "fact", "id", "impact", "jumpTarget", "kind", "location",
    "occurrences", "time", "timeEnd", "title",
  ]);
  assert.doesNotMatch(JSON.stringify(presentation), /player-report|gateStatus|scoreImpact/);
});

test("standalone timeline and coverage views are absent", () => {
  assert.doesNotMatch(htmlSource, /data-detail-view="(?:timeline|coverage)"/);
  assert.doesNotMatch(htmlSource, /data-detail-panel="(?:timeline|coverage)"/);
  assert.doesNotMatch(htmlSource, />完整时间轴</);
  assert.doesNotMatch(htmlSource, />数据覆盖</);
});

test("removed views are not valid analysis destinations", () => {
  assert.doesNotMatch(appSource, /REAL_ANALYSIS_VIEWS[^;]+["']timeline["']/s);
  assert.doesNotMatch(appSource, /REAL_ANALYSIS_VIEWS[^;]+["']coverage["']/s);
});
