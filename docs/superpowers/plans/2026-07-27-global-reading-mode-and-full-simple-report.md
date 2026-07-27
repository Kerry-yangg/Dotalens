# Global Reading Mode and Full Simple Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the standalone full-timeline and data-coverage tabs, add a persisted global simple/professional reading preference, and make simple player reports cover every trustworthy full-match strength and improvement without exposing technical fields.

**Architecture:** Keep Replay facts and scoring unchanged. Add pure presentation selectors in `app-core.js`, let `app.js` render either a plain-language complete view or a professional view from the same model, and migrate coverage details into a professional-only audit drawer. Use explicit navigation mappings so removing the standalone timeline cannot create dead links.

**Tech Stack:** Vanilla JavaScript ES modules, HTML, CSS, Node.js `node:test`, Vite, ECharts, Electron.

## Global Constraints

- Default reading mode is `simple`; the visible labels are `简明` and `专业`.
- Simple mode keeps maps, timelines, core facts, every trustworthy strength and improvement, and actionable advice.
- Secondary metrics and complex tables are collapsed by default in simple mode.
- Parser, Schema, protocol names, gate status, root-cause IDs, scoring paths, raw missing codes, and other technical fields must not enter the simple-mode DOM.
- Professional mode expands complete metrics and offers technical audit on demand.
- `完整时间轴` and `数据覆盖` are removed only as standalone tabs; all embedded and global time controls remain.
- A clear conclusion requires an eligible L2/L3 review target and must navigate to a real module and bounded time range.
- No fixed `one strength / one problem` cap is allowed.
- Missing evidence is never treated as a zero score or invented conclusion.
- Do not publish or push Git changes as part of this plan.

---

## File Structure

- Modify `app-core.js`: pure reading-mode normalization, full simple-report selection, safe simple presentation, and post-timeline navigation resolution.
- Modify `app.js`: global state, mode synchronization, comprehensive report rendering, module disclosure, audit drawer, and event handlers.
- Modify `index.html`: remove two standalone pages/tabs; add global mode controls, settings mirror, disclosure markup, and audit drawer.
- Modify `styles.css`: responsive top-bar control, comprehensive simple-report layout, shared disclosure styling, and audit drawer.
- Modify `desktop/main.cjs`: allow the new display settings panel in QA capture mode.
- Create `tests/frontend/reading-mode.test.js`: focused pure-function and source-contract tests.
- Modify `tests/frontend/app-core.test.js`: update legacy navigation and player-report expectations.
- Modify `DOTA-LENS-0.5.0-PLAYER-REPORT-PRODUCTIZATION-PRD.md`: record that full-coverage simple mode supersedes the former fixed-content cap.

---

### Task 1: Pure Reading Preference and Complete Simple Report Model

**Files:**
- Modify: `app-core.js`
- Create: `tests/frontend/reading-mode.test.js`
- Modify: `tests/frontend/app-core.test.js`

**Interfaces:**
- Produces: `normalizeReadingMode(value): "simple" | "professional"`
- Produces: `buildSimplePlayerReport(input): SimplePlayerReport`
- Produces: `presentSimpleInsight(insight): SimpleInsightPresentation`
- Consumes: normalized player-report dimensions, insights, stories, and training plans already assembled by `playerScoreModel`.

- [ ] **Step 1: Write failing reading-mode and six-domain tests**

Create `tests/frontend/reading-mode.test.js` with:

```js
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

test("simple report always returns all six responsibility domains", () => {
  const report = buildSimplePlayerReport({ dimensions: [], insights: [] });
  assert.deepEqual(
    report.domains.map((domain) => domain.key),
    ["lane", "farm", "tempo", "combat", "vision", "execution"],
  );
  assert.ok(report.domains.every((domain) => domain.status === "insufficient"));
});
```

- [ ] **Step 2: Write failing no-cap, deduplication, and whitelist tests**

Add fixtures containing four eligible strengths, five eligible improvements, two occurrences with the same `rootCauseId`, one L1 conclusion, and one suppressed conclusion:

```js
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
```

- [ ] **Step 3: Run focused tests and verify failure**

Run:

```powershell
node --test tests/frontend/reading-mode.test.js
```

Expected: FAIL because the three exports do not exist.

- [ ] **Step 4: Implement mode normalization and report selection**

Add to `app-core.js`:

```js
const SIMPLE_REPORT_DOMAINS = [
  { key: "lane", label: "对线", dimensionKeys: ["lane_execution"] },
  { key: "farm", label: "发育路线", dimensionKeys: ["farm_efficiency", "resource_decision"] },
  { key: "tempo", label: "地图节奏", dimensionKeys: ["map_tempo"] },
  { key: "combat", label: "战斗", dimensionKeys: ["combat_output", "combat_duty", "survival_risk"] },
  { key: "vision", label: "目标与视野", dimensionKeys: ["objective_conversion", "vision_team"] },
  { key: "execution", label: "操作执行", dimensionKeys: ["observable_execution"] },
];

export function normalizeReadingMode(value) {
  return value === "professional" ? "professional" : "simple";
}

function simpleDomainStatus(score) {
  if (score == null) return "insufficient";
  if (score >= 68) return "good";
  if (score < 52) return "improve";
  return "stable";
}

function normalizeSimpleReportInsight(source = {}) {
  const jumpTarget = normalizePlayerReportJumpTarget(
    source.jump_target ?? source.jumpTarget,
  );
  const primaryOccurrence = jumpTarget.reviewable ? [{
    id: jumpTarget.entityId,
    fightId: jumpTarget.entityType === "fight" ? jumpTarget.entityId : "",
    time: jumpTarget.time ?? jumpTarget.rangeStart,
    region: jumpTarget.mapFocus.region,
    label: String(source.title || ""),
    arrivalDeltaSeconds: null,
    missedFirstRotation: false,
    joinFeasibility: "",
    jumpTarget,
  }] : [];
  const occurrences = [
    ...primaryOccurrence,
    ...normalizePlayerReportInsightOccurrences(source.occurrences),
  ];
  return {
    ...source,
    id: String(source.id || ""),
    kind: String(source.kind || ""),
    rootCauseId: String(source.root_cause_id ?? source.rootCauseId ?? ""),
    time: finiteNumberOrNull(source.time_start ?? source.time),
    timeEnd: finiteNumberOrNull(source.time_end ?? source.timeEnd),
    jumpTarget,
    occurrences,
  };
}

function simpleInsightKey(insight) {
  if (insight.rootCauseId) return `root:${insight.rootCauseId}`;
  if (insight.jumpTarget.entityId) {
    return `entity:${insight.jumpTarget.entityType}:${insight.jumpTarget.entityId}`;
  }
  return `fact:${insight.kind}:${insight.category || ""}:${insight.title || ""}:${insight.time ?? ""}`;
}

export function buildSimplePlayerReport({
  dimensions = [],
  insights = [],
  stories = [],
  training = [],
} = {}) {
  const dimensionsByKey = new Map(
    dimensions.map((dimension) => [String(dimension.key || ""), dimension]),
  );
  const domains = SIMPLE_REPORT_DOMAINS.map((domain) => {
    const judgeable = domain.dimensionKeys
      .map((key) => dimensionsByKey.get(key))
      .filter((dimension) => dimension?.available !== false)
      .map((dimension) => ({
        score: finiteNumberOrNull(dimension.finalScore ?? dimension.score),
        weight: Math.max(1, finiteNumberOrNull(
          dimension.roleWeight ?? dimension.weight,
        ) ?? 1),
      }))
      .filter((dimension) => dimension.score != null);
    const totalWeight = judgeable.reduce((sum, item) => sum + item.weight, 0);
    const score = totalWeight
      ? judgeable.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight
      : null;
    return { key: domain.key, label: domain.label, score, status: simpleDomainStatus(score) };
  });

  const merged = new Map();
  insights
    .filter((insight) => ordinaryPlayerReportInsightEligible(insight))
    .map(normalizeSimpleReportInsight)
    .forEach((insight) => {
      const key = simpleInsightKey(insight);
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, insight);
        return;
      }
      const occurrences = [...existing.occurrences, ...insight.occurrences];
      merged.set(key, {
        ...existing,
        occurrences: [...new Map(occurrences.map((occurrence) => [
          `${occurrence.jumpTarget.entityId}:${occurrence.time}`,
          occurrence,
        ])).values()],
      });
    });

  const timeline = [...merged.values()].sort(
    (left, right) => (left.time ?? Number.MAX_SAFE_INTEGER)
      - (right.time ?? Number.MAX_SAFE_INTEGER),
  );
  const strengthKinds = new Set(["strength", "positive"]);
  const improvementKinds = new Set(["improvement", "problem", "priority"]);
  return {
    domains,
    strengths: timeline.filter((insight) => strengthKinds.has(insight.kind)),
    improvements: timeline.filter((insight) => improvementKinds.has(insight.kind)),
    timeline,
    stories: Array.isArray(stories) ? [...stories] : [],
    primaryTraining: Array.isArray(training) ? training[0] || null : null,
  };
}

export function presentSimpleInsight(insight = {}) {
  return {
    id: String(insight.id || ""),
    kind: String(insight.kind || ""),
    title: String(insight.title || ""),
    time: finiteNumberOrNull(insight.time),
    timeEnd: finiteNumberOrNull(insight.timeEnd),
    location: String(insight.location || ""),
    fact: String(insight.fact || ""),
    impact: String(insight.impact || insight.judgment || ""),
    action: String(insight.action || ""),
    jumpTarget: normalizePlayerReportJumpTarget(insight.jumpTarget),
    occurrences: normalizePlayerReportInsightOccurrences(insight.occurrences),
  };
}
```

Status thresholds must preserve current product semantics:

- no judgeable score: `insufficient`
- score at least 68: `good`
- score below 52: `improve`
- otherwise: `stable`

- [ ] **Step 5: Run focused and existing player-report tests**

Run:

```powershell
node --test tests/frontend/reading-mode.test.js tests/frontend/app-core.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```powershell
git add app-core.js tests/frontend/reading-mode.test.js tests/frontend/app-core.test.js
git commit -m "feat: build complete simple player report model"
```

---

### Task 2: Remove Standalone Tabs and Eliminate Timeline Fallbacks

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `app-core.js`
- Modify: `tests/frontend/reading-mode.test.js`
- Modify: `tests/frontend/app-core.test.js`

**Interfaces:**
- Consumes: existing `resolvePlayerReportReviewNavigation(target)`.
- Produces: all review navigation resolves to `development`, `farm`, `map`, `vision`, `build`, `combat`, `player-score`, or `players`.

- [ ] **Step 1: Write failing source-contract tests**

Add:

```js
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
```

Update navigation tests:

```js
assert.equal(resolvePlayerReportReviewNavigation({
  entityType: "death",
  time: 820,
}).view, "combat");

assert.equal(resolvePlayerReportReviewNavigation({
  entityType: "teleport",
  time: 600,
}).view, "map");
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
node --test tests/frontend/reading-mode.test.js tests/frontend/app-core.test.js
```

Expected: FAIL because both views and old fallback mappings still exist.

- [ ] **Step 3: Remove markup and obsolete event wiring**

In `index.html`:

- Remove both buttons from `#detail-tabs`.
- Remove `#detail-timeline`.
- Remove `#detail-coverage`.
- Keep `#playback-controller` and every module-specific timeline.

In `app.js`:

- Remove `timeline` and `coverage` from `REAL_ANALYSIS_VIEWS`.
- Remove their entries from `ANALYSIS_MODULES_BY_VIEW`.
- Remove `renderDetailView("timeline")` and `renderDetailView("coverage")` branches.
- Remove the coverage shortcut navigation handler.
- Remove the event-search branch from the global search button.
- Map old `?preview=timeline` to `map` and old `?preview=coverage` to `player-score`.
- Change invalid detail-view fallback from `coverage` to `player-score`.

- [ ] **Step 4: Redirect entity navigation**

In `app-core.js`, use:

```js
const entityNavigation = {
  fight: ["combat", "selectedCombatId"],
  death: ["combat", null],
  buyback: ["combat", null],
  ward: ["vision", "selectedWardId"],
  lane_checkpoint: ["development", null],
  route_window: ["farm", "selectedFarmDiagnosticId"],
  purchase: ["build", null],
  ability: ["build", null],
  objective: ["map", null],
  teleport: ["map", null],
};
```

Unknown localized events with a time or map focus resolve to `map`; otherwise preserve their valid source module.

- [ ] **Step 5: Run focused tests and build**

Run:

```powershell
node --test tests/frontend/reading-mode.test.js tests/frontend/app-core.test.js
npm run build
```

Expected: PASS with no missing-element runtime reference.

- [ ] **Step 6: Commit Task 2**

```powershell
git add index.html app.js app-core.js tests/frontend/reading-mode.test.js tests/frontend/app-core.test.js
git commit -m "refactor: remove standalone timeline and coverage tabs"
```

---

### Task 3: Add One Persisted Global Reading Preference

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `styles.css`
- Modify: `desktop/main.cjs`
- Modify: `tests/frontend/reading-mode.test.js`

**Interfaces:**
- Consumes: `normalizeReadingMode(value)`.
- Produces: `state.readingMode`.
- Produces: `setReadingMode(mode, { persist = true, render = true } = {})`.
- Replaces: independent persisted `state.playerScoreMode` selection.

- [ ] **Step 1: Write failing markup and state tests**

Add assertions for:

```js
assert.match(htmlSource, /id="reading-mode-switch"/);
assert.match(htmlSource, /data-reading-mode="simple"[\s\S]*>简明</);
assert.match(htmlSource, /data-reading-mode="professional"[\s\S]*>专业</);
assert.match(htmlSource, /data-settings-panel="display"/);
assert.match(appSource, /const READING_MODE_KEY = "dota-lens-reading-mode-v1"/);
assert.match(appSource, /function setReadingMode\(/);
assert.doesNotMatch(appSource, /PLAYER_SCORE_MODE_KEY/);
```

- [ ] **Step 2: Run the test and verify failure**

Run:

```powershell
node --test tests/frontend/reading-mode.test.js
```

Expected: FAIL because the global controls do not exist.

- [ ] **Step 3: Add top-bar and settings controls**

In `index.html`:

- Add a compact two-button segmented control before search/refresh.
- Add `显示与阅读` to settings navigation.
- Add a settings panel with the same two options and plain descriptions.
- Remove the local player-score brief/deep segmented control; retain the report metadata and evidence button.

In `desktop/main.cjs`, add `display` to accepted `DOTA_LENS_QA_SETTINGS_PANEL` values.

- [ ] **Step 4: Implement synchronized state**

In `app.js`:

```js
const READING_MODE_KEY = "dota-lens-reading-mode-v1";
const DEFAULT_READING_MODE = normalizeReadingMode(
  window.localStorage.getItem(READING_MODE_KEY),
);

function setReadingMode(mode, { persist = true, render = true } = {}) {
  state.readingMode = normalizeReadingMode(mode);
  document.body.dataset.readingMode = state.readingMode;
  document.querySelectorAll("[data-reading-mode]").forEach((button) => {
    const active = button.dataset.readingMode === state.readingMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (persist) window.localStorage.setItem(READING_MODE_KEY, state.readingMode);
  if (render && state.page === "detail") renderDetailView(state.detailView);
}
```

Replace `playerScoreMode === "deep"` checks with `readingMode === "professional"`. Store `readingMode` in report review return context.

- [ ] **Step 5: Add responsive styling**

Add stable dimensions for `.reading-mode-switch`, keep labels visible at 1024 px, and place the switch before icon-only top-bar actions. Do not shrink mode labels below 12 px.

- [ ] **Step 6: Run tests and build**

Run:

```powershell
node --test tests/frontend/reading-mode.test.js tests/frontend/app-core.test.js tests/desktop/*.test.cjs
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```powershell
git add index.html app.js styles.css desktop/main.cjs tests/frontend/reading-mode.test.js
git commit -m "feat: add persisted global reading preference"
```

---

### Task 4: Render a Comprehensive Plain-Language Player Report

**Files:**
- Modify: `app.js`
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `tests/frontend/reading-mode.test.js`
- Modify: `tests/frontend/app-core.test.js`

**Interfaces:**
- Consumes: `buildSimplePlayerReport(...)`.
- Consumes: `presentSimpleInsight(...)`.
- Produces: `renderSimplePlayerReport(model)`.
- Produces: `state.simpleReportFilter` with `all | strength | improvement | turning-point`.

- [ ] **Step 1: Write failing comprehensive-render tests**

Add source and model tests:

```js
test("simple report renders all domains and all eligible insight lists", () => {
  assert.match(appSource, /function renderSimplePlayerReport\(/);
  assert.match(appSource, /simpleReport\.domains/);
  assert.match(appSource, /simpleReport\.strengths/);
  assert.match(appSource, /simpleReport\.improvements/);
  assert.doesNotMatch(appSource, /selectOrdinaryPlayerReportContent\(brief\)/);
});

test("simple report does not describe itself as one strength and one problem", () => {
  assert.doesNotMatch(appSource, /本场优先改一件|一个优点|一个主要问题/);
  assert.match(appSource, /全场做得好/);
  assert.match(appSource, /全场需要改进/);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
node --test tests/frontend/reading-mode.test.js tests/frontend/app-core.test.js
```

Expected: FAIL because the renderer still slices ordinary content.

- [ ] **Step 3: Build the comprehensive model in `playerScoreModel`**

Change `playerScoreBriefV3Insights` to accept an explicit optional limit:

```js
function playerScoreBriefV3Insights(model, kind, { limit = null } = {}) {
  const briefRefs = kind === "strength"
    ? model.report?.brief?.strengths || []
    : model.report?.brief?.priorities || [];
  const allowedKinds = kind === "strength"
    ? new Set(["strength", "positive"])
    : new Set(["improvement", "problem", "priority"]);
  const sources = briefRefs.length
    ? [
      ...briefRefs
        .map((ref) => model.rawInsights.find((insight) => String(insight.id) === String(ref)))
        .filter(Boolean),
      ...model.rawInsights.filter((insight) => allowedKinds.has(String(insight.kind || ""))),
    ]
    : model.rawInsights.filter((insight) => allowedKinds.has(String(insight.kind || "")));
  const uniqueSources = [...new Map(
    sources.map((insight) => [String(insight.id || ""), insight]),
  ).values()];
  const normalized = uniqueSources.filter((insight) => kind === "strength"
    ? Number(insight.confidence || 0) >= 70
    : Number(insight.confidence || 0) >= 55
      && (insight.evidence_refs || []).length
      && insight.time_start != null
  ).map((insight, index) => {
    const jumpTarget = normalizePlayerReportJumpTarget(insight.jump_target);
    return {
      id: insight.id || `${kind}-v3-${index}`,
      kind,
      category: insight.category || "timeline",
      title: insight.title || (kind === "strength" ? "稳定行为" : "优先问题"),
      time: playerScoreNumber(insight.time_start),
      timeEnd: playerScoreNumber(insight.time_end),
      location: insight.location || "",
      fact: insight.fact || "",
      judgment: insight.judgment || "",
      impact: playerScoreImpactText(insight.impact),
      action: insight.action || "",
      confidence: playerScoreNumber(insight.confidence),
      module: jumpTarget.module || playerScoreAdviceModule(insight),
      jumpTarget,
      ordinaryEligible: insight.ordinary_eligible === true,
      localizationLevel: jumpTarget.locationLevel,
      occurrences: normalizePlayerReportInsightOccurrences(insight.occurrences),
      evidenceRefs: insight.evidence_refs || [],
      gateStatus: insight.gate_status || "passed",
      rootCauseId: insight.root_cause_id || null,
      rootCause: model.rootCauseById?.get(String(insight.root_cause_id || "")) || null,
    };
  });
  return Number.isFinite(limit) ? normalized.slice(0, Math.max(0, limit)) : normalized;
}
```

The existing top-summary builder calls it with `{ limit: 2 }` for strengths and `{ limit: 3 }` for priorities. The complete simple report calls it without a limit:

```js
const simpleInsights = [
  ...playerScoreBriefV3Insights(model, "strength"),
  ...playerScoreBriefV3Insights(model, "improvement"),
];

model.simpleReport = buildSimplePlayerReport({
  dimensions: model.dimensions,
  insights: simpleInsights,
  stories: model.storyNodes,
  training: model.trainingPlan,
});
```

Do not call `.slice()` on `simpleInsights` before the pure selector. Keep legacy fallback generation only for reports that have no structured insights.

- [ ] **Step 4: Replace the brief renderer**

Implement `renderSimplePlayerReport(model)` with:

- one verdict;
- one highlighted training target;
- six status rows;
- all strengths;
- all improvements;
- chronological conclusion stream;
- existing personal evidence timeline.

Each conclusion card must render:

```js
function renderSimpleInsightCard(source) {
  const insight = presentSimpleInsight(source);
  const improvement = insight.kind !== "strength" && insight.kind !== "positive";
  const occurrenceRows = insight.occurrences.map((occurrence, index) => `
    <button type="button"
      data-player-score-review-occurrence="${escapeHtml(insight.id)}"
      data-player-score-occurrence-index="${index}">
      ${escapeHtml(occurrence.label || formatTime(occurrence.time))}
    </button>`).join("");
  return `<article class="simple-insight ${improvement ? "improvement" : "strength"}">
    <header>
      <span>${improvement ? "需要改进" : "做得好"}</span>
      <time>${formatTime(insight.time)}${insight.timeEnd == null ? "" : `-${formatTime(insight.timeEnd)}`}</time>
      <em>${escapeHtml(insight.location || "对应地图区域")}</em>
    </header>
    <strong>${escapeHtml(insight.title)}</strong>
    <p><b>发生了什么</b>${escapeHtml(insight.fact)}</p>
    <p><b>造成的影响</b>${escapeHtml(insight.impact)}</p>
    <p><b>下次怎么做</b>${escapeHtml(insight.action)}</p>
    <button type="button" data-player-score-review="${escapeHtml(insight.id)}">查看这一波</button>
    ${occurrenceRows ? `<details><summary>更多事实与发生点</summary>${occurrenceRows}</details>` : ""}
  </article>`;
}
```

No confidence percentage, protocol, gate, root-cause identifier, or score path may be interpolated by this renderer.

- [ ] **Step 5: Add filter and expansion behavior**

Add compact filters above the chronological stream. Filtering changes only the event list; it does not hide the six-domain overview or the strengths/improvements sections.

- [ ] **Step 6: Add stable responsive layout**

Use a single-column report at 1024 px and a two-column strengths/improvements band only when at least 1360 px is available. Do not place cards inside cards. Keep `查看这一波` visible without hover.

- [ ] **Step 7: Run focused tests and build**

Run:

```powershell
node --test tests/frontend/reading-mode.test.js tests/frontend/app-core.test.js
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```powershell
git add app.js index.html styles.css tests/frontend/reading-mode.test.js tests/frontend/app-core.test.js
git commit -m "feat: render full-coverage simple player reports"
```

---

### Task 5: Apply Progressive Disclosure to Analysis Modules

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `styles.css`
- Modify: `tests/frontend/reading-mode.test.js`

**Interfaces:**
- Produces: reusable `[data-reading-secondary]` disclosures.
- Consumes: global `state.readingMode`.
- Preserves: every map and timeline container ID currently used by module renderers.

- [ ] **Step 1: Write failing module-preservation and disclosure tests**

Assert:

```js
for (const id of [
  "development-map", "farm-map", "ward-map", "combat-map",
  "global-time-slider", "ward-timeline", "player-score-timeline",
]) {
  assert.match(htmlSource, new RegExp(`id="${id}"`));
}

assert.match(htmlSource, /data-reading-secondary="development-metrics"/);
assert.match(htmlSource, /data-reading-secondary="farm-unit-detail"/);
assert.match(htmlSource, /data-reading-secondary="vision-detection-detail"/);
assert.match(htmlSource, /data-reading-secondary="combat-responsibility-detail"/);
assert.match(htmlSource, /data-reading-secondary="build-damage-detail"/);
assert.match(htmlSource, /data-reading-secondary="players-extra-columns"/);
```

- [ ] **Step 2: Run test and verify failure**

Run:

```powershell
node --test tests/frontend/reading-mode.test.js
```

Expected: FAIL because shared disclosures are not marked.

- [ ] **Step 3: Add semantic disclosure wrappers**

Use `<details class="reading-secondary" data-reading-secondary="development-metrics">` and the corresponding stable identifier from the test around:

- development checkpoint tables;
- farm unit/candidate-route details;
- vision detection and score-component details;
- combat ten-player responsibility details and event matrices;
- build damage matrices;
- player comparison non-core columns or expanded details.

Do not wrap maps, primary charts, core conclusions, advice, or timelines.

- [ ] **Step 4: Synchronize disclosure state with reading mode**

Implement:

```js
function syncReadingDisclosures() {
  const professional = state.readingMode === "professional";
  document.querySelectorAll("[data-reading-secondary]").forEach((details) => {
    details.open = professional;
    details.dataset.defaultOpen = String(professional);
  });
}
```

Call it after every detail-view render and reading-mode change. Users may manually open a simple-mode disclosure until the view rerenders.

- [ ] **Step 5: Conditionally render technical module labels**

For module renderers, interpolate confidence percentages, gate explanations, component keys, and source precision only when `state.readingMode === "professional"`. Simple mode may render `证据充分`, `证据有限`, or `信息不足，暂不判断`.

- [ ] **Step 6: Run all frontend tests and build**

Run:

```powershell
npm run test:frontend
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit Task 5**

```powershell
git add index.html app.js styles.css tests/frontend/reading-mode.test.js
git commit -m "feat: add progressive disclosure across analysis modules"
```

---

### Task 6: Migrate Data Coverage into Professional Audit

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `styles.css`
- Modify: `tests/frontend/reading-mode.test.js`

**Interfaces:**
- Produces: `renderDataTrustAudit()`.
- Produces: `setDataTrustOpen(open, { technical = false } = {})`.
- Consumes: existing `coverageImpactFor`, `patchCoverageImpact`, coverage rows, and module evidence.

- [ ] **Step 1: Write failing audit accessibility tests**

Add:

```js
test("data trust is a professional drawer rather than a detail tab", () => {
  assert.match(htmlSource, /id="data-trust-drawer"/);
  assert.match(htmlSource, /id="technical-audit-toggle"/);
  assert.doesNotMatch(htmlSource, /data-detail-panel="coverage"/);
  assert.match(appSource, /function renderDataTrustAudit\(/);
});

test("simple source control cannot open technical audit", () => {
  assert.match(appSource, /state\.readingMode !== "professional"[\s\S]*return/);
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```powershell
node --test tests/frontend/reading-mode.test.js
```

Expected: FAIL because the drawer does not exist.

- [ ] **Step 3: Add the professional-only drawer**

Add an app-level right drawer with:

- plain data reliability summary;
- affected conclusions;
- per-module reliable/limited/suppressed statements;
- a collapsed technical audit section containing the old coverage table and metadata;
- close button and backdrop.

The drawer must not be nested inside a card.

- [ ] **Step 4: Migrate coverage rendering**

Rename/refactor `renderCoverage()` to `renderDataTrustAudit()`. Reuse the existing coverage impact functions and row translations. Do not duplicate coverage calculations.

For simple mode, the top source control remains a status display. When clicked, show no drawer; an affected module supplies its own plain-language data-gap message.

- [ ] **Step 5: Test mode gating and return context**

Verify opening and closing the drawer does not alter selected player, current time, detail view, selected fight/ward/route, or scroll position.

- [ ] **Step 6: Run frontend tests and build**

Run:

```powershell
npm run test:frontend
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit Task 6**

```powershell
git add index.html app.js styles.css tests/frontend/reading-mode.test.js
git commit -m "feat: move data coverage into professional audit"
```

---

### Task 7: Documentation, Real Replay Regression, and Visual QA

**Files:**
- Modify: `DOTA-LENS-0.5.0-PLAYER-REPORT-PRODUCTIZATION-PRD.md`
- Modify: `docs/superpowers/plans/2026-07-27-global-reading-mode-and-full-simple-report.md`
- Test: local analysis for match `8894766243`

**Interfaces:**
- Consumes: complete implementation from Tasks 1-6.
- Produces: verified frontend build and recorded implementation status.

- [ ] **Step 1: Update the product PRD**

Add a dated implementation note that:

- full-coverage simple mode supersedes the former one-strength/one-problem cap;
- three key moments remain shortcuts, not total report coverage;
- standalone timeline and coverage tabs are removed;
- data coverage is available through professional audit.

- [ ] **Step 2: Run the full automated suite**

Run:

```powershell
npm test
npm run build
npm run player-report:validate -- 8894766243
```

Expected:

- all frontend, tools, and desktop tests pass;
- Vite production build succeeds;
- all ten player reports for `8894766243` pass protocol validation.

- [ ] **Step 3: Start local services and open the real Replay preview**

Verify Parser:

```powershell
Invoke-RestMethod 'http://127.0.0.1:5600/api/status'
```

Start Vite only if port 4173 is not already listening:

```powershell
npm run dev -- --port 4173
```

Open:

```text
http://127.0.0.1:4173/?preview=player-score&qaMatch=8894766243
```

- [ ] **Step 4: Verify simple mode content**

At `1024×720`, `1460×920`, and `1920×1080`:

- eight detail tabs are usable;
- maps and timelines are visible and interactive;
- all six report domains have a status;
- every eligible strength and improvement appears once;
- each conclusion jumps to the correct entity/time;
- no technical field appears in page text;
- secondary details are closed by default;
- there is no horizontal overflow or clipped text.

- [ ] **Step 5: Verify professional mode**

At the same viewports:

- secondary details open;
- complete tables remain readable;
- the source control opens data trust;
- technical audit opens only on demand;
- switching mode preserves player, view, time, selection, and scroll context;
- reloading preserves the selected reading mode.

- [ ] **Step 6: Record verification status in this plan**

Mark every completed checkbox and append a `## Verification Record` section containing the exact commands and pass counts, production-build result, ten-player `8894766243` result, all three viewport results, and only limitations observed during verification.

- [ ] **Step 7: Commit Task 7**

```powershell
git add DOTA-LENS-0.5.0-PLAYER-REPORT-PRODUCTIZATION-PRD.md docs/superpowers/plans/2026-07-27-global-reading-mode-and-full-simple-report.md
git commit -m "docs: record global reading mode verification"
```

---

## Final Verification

Run once more from a clean worktree:

```powershell
git status --short
npm test
npm run build
```

Expected:

- `git status --short` is empty.
- Every test passes.
- The production build succeeds.
- No Git push or release action has occurred.
