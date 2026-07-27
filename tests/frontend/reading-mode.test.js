import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as appCore from "../../app-core.js";

const {
  buildSimplePlayerReport,
  normalizeReadingMode,
  presentSimpleInsight,
} = appCore;

const htmlSource = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

function readingModeControl(surface, readingMode) {
  const classes = new Set();
  const attributes = new Map();
  return {
    surface,
    dataset: { readingMode },
    classList: {
      toggle(name, active) {
        if (active) classes.add(name);
        else classes.delete(name);
      },
      contains(name) {
        return classes.has(name);
      },
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
  };
}

function readingModeHarness(storedValue = null) {
  assert.equal(
    typeof appCore.createReadingModeController,
    "function",
    "app-core must expose the executable reading-mode boundary",
  );
  const storageKey = "reading-mode-test";
  const storage = memoryStorage(storedValue == null ? {} : { [storageKey]: storedValue });
  const controls = [
    readingModeControl("top", "simple"),
    readingModeControl("top", "professional"),
    readingModeControl("settings", "simple"),
    readingModeControl("settings", "professional"),
  ];
  let appliedMode = null;
  let renderCount = 0;
  const controller = appCore.createReadingModeController({
    storage,
    storageKey,
    getControls: () => controls,
    applyMode: (mode) => { appliedMode = mode; },
    render: () => { renderCount += 1; },
  });
  return {
    controller,
    controls,
    storage,
    storageKey,
    appliedMode: () => appliedMode,
    renderCount: () => renderCount,
  };
}

function controlState(control) {
  return {
    surface: control.surface,
    mode: control.dataset.readingMode,
    active: control.classList.contains("active"),
    pressed: control.getAttribute("aria-pressed"),
  };
}

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

test("reading mode controller synchronizes top and settings controls", () => {
  const harness = readingModeHarness();

  assert.equal(harness.controller.set("professional"), "professional");
  assert.equal(harness.appliedMode(), "professional");
  assert.equal(harness.storage.getItem(harness.storageKey), "professional");
  assert.equal(harness.renderCount(), 1);
  assert.deepEqual(harness.controls.map(controlState), [
    { surface: "top", mode: "simple", active: false, pressed: "false" },
    { surface: "top", mode: "professional", active: true, pressed: "true" },
    { surface: "settings", mode: "simple", active: false, pressed: "false" },
    { surface: "settings", mode: "professional", active: true, pressed: "true" },
  ]);
});

test("reading mode controller restores persisted mode and rejects invalid storage", () => {
  const restored = readingModeHarness("professional");
  const invalid = readingModeHarness("deep");

  assert.equal(restored.controller.restore(), "professional");
  assert.equal(restored.appliedMode(), "professional");
  assert.equal(restored.renderCount(), 0);
  assert.deepEqual(restored.controls.map(controlState), [
    { surface: "top", mode: "simple", active: false, pressed: "false" },
    { surface: "top", mode: "professional", active: true, pressed: "true" },
    { surface: "settings", mode: "simple", active: false, pressed: "false" },
    { surface: "settings", mode: "professional", active: true, pressed: "true" },
  ]);

  assert.equal(invalid.controller.restore(), "simple");
  assert.equal(invalid.appliedMode(), "simple");
  assert.deepEqual(invalid.controls.map(controlState), [
    { surface: "top", mode: "simple", active: true, pressed: "true" },
    { surface: "top", mode: "professional", active: false, pressed: "false" },
    { surface: "settings", mode: "simple", active: true, pressed: "true" },
    { surface: "settings", mode: "professional", active: false, pressed: "false" },
  ]);
});

test("reading mode controller restores the report review context", () => {
  const harness = readingModeHarness("professional");
  harness.controller.restore();

  assert.equal(
    harness.controller.restoreFromReviewContext({ readingMode: "simple" }, { render: false }),
    "simple",
  );
  assert.equal(harness.appliedMode(), "simple");
  assert.equal(harness.storage.getItem(harness.storageKey), "simple");
  assert.equal(harness.renderCount(), 0);
  assert.deepEqual(harness.controls.map(controlState), [
    { surface: "top", mode: "simple", active: true, pressed: "true" },
    { surface: "top", mode: "professional", active: false, pressed: "false" },
    { surface: "settings", mode: "simple", active: true, pressed: "true" },
    { surface: "settings", mode: "professional", active: false, pressed: "false" },
  ]);
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

test("player score model connects the complete simple report boundary", () => {
  assert.match(
    appSource,
    /buildSimplePlayerReport,\s*[\s\S]*presentSimpleInsight,\s*[\s\S]*from "\.\/app-core\.js"/,
  );
  assert.match(
    appSource,
    /model\.simpleReport\s*=\s*buildSimplePlayerReport\(\{[\s\S]*dimensions:\s*model\.dimensions[\s\S]*insights:[\s\S]*stories:\s*model\.storyNodes[\s\S]*training:\s*model\.trainingPlan/,
  );
});

test("simple player report renders complete plain-language match coverage", () => {
  const start = appSource.indexOf("function renderSimplePlayerReport(model)");
  const end = appSource.indexOf("function renderPlayerScoreLane", start);

  assert.notEqual(start, -1, "simple report needs its own complete renderer");
  assert.ok(end > start, "simple report renderer must end before the lane detail renderer");

  const renderer = appSource.slice(start, end);
  assert.match(renderer, /simpleReport\.domains\.map/);
  assert.match(renderer, /simpleReport\.strengths\.map/);
  assert.match(renderer, /simpleReport\.improvements\.map/);
  assert.match(renderer, /simpleReport\.timeline/);
  assert.match(renderer, /presentSimpleInsight/);
  assert.match(renderer, /全场做得好/);
  assert.match(renderer, /全场需要改进/);
  assert.match(renderer, /按时间查看全部结论/);
  assert.match(renderer, /查看这一波/);
  assert.match(renderer, /data-player-score-review=/);
  assert.match(renderer, /data-player-score-review-occurrence=/);
  assert.doesNotMatch(renderer, /selectOrdinaryPlayerReportContent/);
  assert.doesNotMatch(renderer, /三个关键时刻|本场优先改一件|主要问题/);
  assert.doesNotMatch(
    renderer,
    /confidence|gateStatus|rootCauseId|scoreImpact|protocol|player-report\//,
  );
});

test("simple player report keeps all conclusions and offers semantic timeline filters", () => {
  const start = appSource.indexOf("function renderSimplePlayerReport(model)");
  const end = appSource.indexOf("function renderPlayerScoreLane", start);
  const renderer = appSource.slice(start, end);
  const reviewStart = appSource.indexOf("function reviewPlayerScoreInsight(");
  const reviewEnd = appSource.indexOf("function returnToPlayerScoreReport", reviewStart);
  const reviewHandler = appSource.slice(reviewStart, reviewEnd);

  assert.doesNotMatch(renderer, /\.slice\(\s*0\s*,/);
  assert.match(renderer, /data-simple-report-filter="all"/);
  assert.match(renderer, /data-simple-report-filter="strength"/);
  assert.match(renderer, /data-simple-report-filter="improvement"/);
  assert.match(appSource, /state\.simpleReportFilter\s*=/);
  assert.match(reviewHandler, /model\.simpleReport\?\.timeline/);
});

test("simple report layout supports full coverage at desktop and compact widths", () => {
  assert.match(
    stylesSource,
    /\.player-score-simple-report\s*\{[^}]*display:\s*grid[^}]*overflow:\s*visible/s,
  );
  assert.match(
    stylesSource,
    /\.simple-report-domains\s*\{[^}]*grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)/s,
  );
  assert.match(
    stylesSource,
    /@media\s*\(min-width:\s*1360px\)[\s\S]*\.simple-report-conclusion-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
  );
  assert.match(
    stylesSource,
    /@media\s*\(max-width:\s*1099px\)[\s\S]*\.simple-report-domains\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
  );
  assert.match(
    stylesSource,
    /\.simple-report-insight-line\s+em\s*\{[^}]*white-space:\s*normal[^}]*overflow-wrap:\s*anywhere/s,
  );
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
