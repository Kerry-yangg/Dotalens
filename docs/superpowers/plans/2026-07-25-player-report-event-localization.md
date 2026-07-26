# Player Report Event Localization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every ordinary-mode player-report strength and problem locate a concrete Replay window, select the corresponding fight, farm diagnostic, ward, lane checkpoint, or timeline entity, and preserve a return path to the report.

**Architecture:** Add a focused Parser localization builder that emits a stable `player-report-localization/1.0` capability and enriched `jump_target` objects without changing the existing `player-report/3.0` scoring semantics. Normalize and validate those targets in `app-core.js`, use them to admit only event-level strengths/problems into the ordinary report, and let `app.js` drive module selection, entity focus, bounded playback, and return-state restoration.

**Tech Stack:** Java 21, Gson, JUnit 5, JavaScript ES modules, Node test runner, Vite, Electron-compatible DOM.

## Global Constraints

- Work in the current `codex/trusted-replay-import-0.4.5` branch because the feature depends on uncommitted player-report and map changes.
- Do not stage, commit, revert, or overwrite unrelated dirty-worktree changes.
- Use PowerShell 7 commands.
- Follow TDD for every production behavior.
- Keep `player-report/3.0` backward compatible in this slice; advertise localization through `localization_model`.
- Ordinary-mode explicit strengths/problems require L2 or L3 localization.
- L0/L1 aggregate conclusions remain available in deep mode but cannot become ordinary-mode explicit praise or criticism.
- Use existing Parser map-percent coordinates as the single coordinate source; do not invent a second frontend transform.
- Existing reports without localization must continue rendering with a conservative compatibility message.

---

### Task 1: Parser Localization Protocol

**Files:**
- Create: `tools/replay-parser/src/main/java/opendota/PlayerReportLocalization.java`
- Modify: `tools/replay-parser/src/main/java/opendota/PlayerReportNarrativeV3.java`
- Test: `tools/replay-parser/src/test/java/opendota/PlayerReportNarrativeV3Test.java`

**Interfaces:**
- Consumes: fight, farm diagnostic, lane review, and aggregate insight JSON already available in `PlayerReportNarrativeV3`.
- Produces: `PlayerReportLocalization.forFight`, `forFarm`, `forLane`, `aggregate`, and `ordinaryEligible`.
- Produces report capability: `"localization_model": "player-report-localization/1.0"`.

- [x] **Step 1: Write failing Parser tests**

Add tests that assert a combat strength and combat problem contain:

```java
JsonObject jump = insight.getAsJsonObject("jump_target");
assertEquals("combat", jump.get("module").getAsString());
assertEquals("fight", jump.get("entity_type").getAsString());
assertEquals("fight-passed", jump.get("entity_id").getAsString());
assertTrue(jump.get("range_start").getAsInt() < jump.get("time").getAsInt());
assertTrue(jump.get("range_end").getAsInt() >= jump.get("time").getAsInt());
assertTrue(Set.of("L2", "L3").contains(jump.get("location_level").getAsString()));
assertTrue(insight.get("ordinary_eligible").getAsBoolean());
```

Add a separate assertion that aggregate strengths are L0 and not ordinary eligible.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```powershell
$env:JAVA_HOME=(Resolve-Path 'tools\runtime\jdk-21').Path
$env:Path="$env:JAVA_HOME\bin;$env:Path"
& 'tools\runtime\apache-maven-3.9.12\bin\mvn.cmd' `
  -q -f 'tools\replay-parser\pom.xml' `
  '-Dtest=PlayerReportNarrativeV3Test' test
```

Expected: failure because `entity_type`, `range_start`, `location_level`, or `ordinary_eligible` is missing.

- [x] **Step 3: Implement the localization builder**

Implement package-private methods:

```java
static JsonObject forFight(JsonObject fight, int slot)
static JsonObject forFarm(JsonObject diagnostic, int slot)
static JsonObject forLane(JsonObject review, int checkpointTime, String evidenceRef, int slot)
static JsonObject aggregate(String module, int time, int slot)
static boolean ordinaryEligible(JsonObject jumpTarget)
```

Required behavior:

- Fight range starts at `review_start` and ends at `contact_end + 5`.
- Farm range starts at `time - 10` and ends at `end + 5`.
- Lane range starts at `checkpointTime - 20` and ends at `checkpointTime + 20`.
- L3 requires `coordinate_valid=true` with finite `x` and `y` inside the `0-100` map-percent range.
- L2 requires a non-empty, non-unknown region and an entity ID.
- L1 has a time and entity but no reliable location.
- L0 is aggregate only.
- `map_focus` copies existing `x`, `y`, `region`, coordinate version/source, and location confidence when present.

- [x] **Step 4: Attach targets to concrete insights**

In `PlayerReportNarrativeV3`:

- Combat improvement and strength use `forFight`.
- Farm improvement uses `forFarm`.
- Lane improvement and strength use `forLane`.
- Aggregate strength uses `aggregate`.
- Each insight stores `ordinary_eligible`.
- Report stores `localization_model`.

- [x] **Step 5: Run focused Parser tests and verify GREEN**

Run the command from Step 2.

Expected: `PlayerReportNarrativeV3Test` passes with zero failures.

---

### Task 2: Ordinary Report Localization Gate

**Files:**
- Modify: `app-core.js`
- Modify: `tests/frontend/app-core.test.js`

**Interfaces:**
- Consumes: raw Parser `jump_target`.
- Produces: `normalizePlayerReportJumpTarget(value)`.
- Produces: `ordinaryPlayerReportInsightEligible(insight)`.
- Extends: `selectOrdinaryPlayerReportContent`.

- [x] **Step 1: Write failing frontend tests**

Import the new helpers and add:

```js
test("ordinary explicit conclusions require a locatable Replay window", () => {
  const located = {
    id: "good",
    ordinaryEligible: true,
    jumpTarget: {
      module: "combat",
      entityType: "fight",
      entityId: "fight-1",
      rangeStart: 100,
      rangeEnd: 130,
      locationLevel: "L2",
    },
  };
  const aggregate = { id: "aggregate", ordinaryEligible: false };
  const selected = selectOrdinaryPlayerReportContent({
    stories: [],
    strengths: [aggregate, located],
    priorities: [aggregate],
    training: [],
  });
  assert.equal(selected.strength.id, "good");
  assert.equal(selected.priority, null);
});
```

Add normalization assertions for snake_case Parser fields.

- [x] **Step 2: Run frontend tests and verify RED**

Run:

```powershell
npm run test:frontend
```

Expected: import or assertion failure because the localization helpers do not exist.

- [x] **Step 3: Implement normalization and eligibility**

Implement:

```js
export function normalizePlayerReportJumpTarget(value = {}) {
  return {
    module: String(value.module || "timeline"),
    entityType: String(value.entity_type || value.entityType || ""),
    entityId: String(value.entity_id || value.entityId || ""),
    time: finiteOrNull(value.time),
    rangeStart: finiteOrNull(value.range_start ?? value.rangeStart),
    rangeEnd: finiteOrNull(value.range_end ?? value.rangeEnd),
    locationLevel: String(value.location_level || value.locationLevel || "L0"),
    mapFocus: value.map_focus || value.mapFocus || null,
  };
}
```

Eligibility requires:

- L2 or L3.
- Entity type and entity ID.
- Finite range start and range end.
- End not before start.

Update `selectOrdinaryPlayerReportContent` to select the first eligible strength/problem, while preserving old behavior when `brief.localizationStrict !== true`.

- [x] **Step 4: Run frontend tests and verify GREEN**

Run `npm run test:frontend`.

Expected: all frontend tests pass.

---

### Task 3: Frontend Report Model and Copy

**Files:**
- Modify: `app.js`
- Modify: `tests/frontend/app-core.test.js`

**Interfaces:**
- Consumes: normalization helper from Task 2.
- Produces insight model fields: `jumpTarget`, `ordinaryEligible`, `localizationLevel`.
- Produces ordinary brief flag: `localizationStrict`.

- [x] **Step 1: Add a failing static integration test**

Assert the ordinary player-report renderer contains:

```js
assert.match(briefRenderer, /查看这一波/);
assert.match(briefRenderer, /data-player-score-review/);
assert.doesNotMatch(briefRenderer, />查看片段</);
```

- [x] **Step 2: Run frontend tests and verify RED**

Run `npm run test:frontend`.

Expected: failure because the renderer still uses “查看片段/查看证据”.

- [x] **Step 3: Normalize insight targets in `playerScoreBriefV3Insights`**

For each insight:

- Normalize `insight.jump_target`.
- Keep `module` from the normalized target.
- Store `ordinaryEligible`.
- Set `model.report.localization_model === "player-report-localization/1.0"` as strict mode.
- Do not use aggregate score fallback as an explicit ordinary-mode strength in strict mode.

- [x] **Step 4: Update ordinary cards**

Each located strength/problem renders:

- Time range and location.
- Concrete fact.
- Result or impact.
- Primary button labeled `查看这一波`.
- Secondary evidence button labeled `查看评分依据`.

The primary button carries `data-player-score-review="<insight id>"`.

- [x] **Step 5: Run frontend tests and verify GREEN**

Run `npm run test:frontend`.

Expected: all frontend tests pass.

---

### Task 4: Review Navigation State

**Files:**
- Modify: `app-core.js`
- Modify: `tests/frontend/app-core.test.js`
- Modify: `app.js`

**Interfaces:**
- Produces pure helper: `resolvePlayerReportReviewNavigation(jumpTarget)`.
- Consumes normalized target from Task 2.
- Mutates UI state only in `app.js`.

- [x] **Step 1: Write failing navigation tests**

Add:

```js
test("player report review navigation selects the target entity and preroll", () => {
  assert.deepEqual(resolvePlayerReportReviewNavigation({
    module: "combat",
    entityType: "fight",
    entityId: "fight-4",
    time: 605,
    rangeStart: 595,
    rangeEnd: 630,
  }), {
    view: "combat",
    selectedStateKey: "selectedCombatId",
    selectedId: "fight-4",
    seekTime: 595,
    rangeStart: 595,
    rangeEnd: 630,
  });
});
```

Cover `farm_diagnostic`, `ward`, `lane_checkpoint`, and legacy module/time fallback.

- [x] **Step 2: Run frontend tests and verify RED**

Run `npm run test:frontend`.

Expected: import failure for `resolvePlayerReportReviewNavigation`.

- [x] **Step 3: Implement pure navigation resolution**

Map:

```text
fight -> selectedCombatId
farm_diagnostic -> selectedFarmDiagnosticId
ward -> selectedWardId
lane_checkpoint -> development lane view
purchase -> build
death/objective/teleport -> timeline
```

Seek to `rangeStart` when available, otherwise `time`.

- [x] **Step 4: Implement stateful navigation in `app.js`**

Before leaving the report, save:

- Selected player.
- Brief/deep mode.
- Section.
- Selected evidence.
- Scroll position.

Then:

- Set the selected entity ID.
- Set detail view.
- Seek to review start.
- Render the destination.
- Center selected combat/farm/ward rows.
- Focus the selected ward with the existing zoom-safe map transform.

- [x] **Step 5: Run frontend tests and verify GREEN**

Run `npm run test:frontend`.

Expected: all frontend tests pass.

---

### Task 5: Review Bar and Bounded Playback

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `app.js`
- Test: `tests/frontend/app-core.test.js`

**Interfaces:**
- Consumes: `state.playerReportReviewWindow`.
- Produces DOM element `#player-report-review-bar`.
- Produces actions `data-player-report-review-play` and `data-player-report-review-return`.

- [x] **Step 1: Add failing markup and behavior tests**

Assert:

```js
assert.match(html, /id="player-report-review-bar"/);
assert.match(app, /playerReportReviewWindow/);
assert.match(app, /data-player-report-review-return/);
assert.match(app, /rangeEnd/);
```

- [x] **Step 2: Run frontend tests and verify RED**

Run `npm run test:frontend`.

Expected: missing review-bar markup and state handling.

- [x] **Step 3: Add the review bar markup and restrained styling**

Place the bar between the detail tabs and detail workspace. It contains:

- Player-report origin label.
- Insight title.
- Time range and location.
- Play button.
- Return button.

Keep it one row on desktop and two compact rows at 1024 px.

- [x] **Step 4: Implement bounded playback**

When play starts:

- Seek to `rangeStart`.
- Set `state.isPlaying=true`.
- Stop and set `state.isPlaying=false` when `playheadMs >= rangeEnd * 1000`.
- Keep normal playback unchanged when there is no review window.

When return is clicked:

- Set view back to `player-score`.
- Restore report mode, section, evidence, and scroll position.
- Clear the review window.

- [x] **Step 5: Run frontend tests and production build**

Run:

```powershell
npm run test:frontend
npm run build
```

Expected: all frontend tests pass and Vite exits 0.

---

### Task 6: Parser and Product Regression

**Files:**
- Modify: `DOTA-LENS-PLAYER-ANALYSIS-REPORT-V3-PRD.md`
- Modify: `DOTA-LENS-0.5.0-PLAYER-REPORT-PRODUCTIZATION-PRD.md`
- Test: existing Java and Node suites

**Interfaces:**
- Consumes all previous tasks.
- Produces verified implementation record.

- [x] **Step 1: Run complete relevant tests**

```powershell
$env:JAVA_HOME=(Resolve-Path 'tools\runtime\jdk-21').Path
$env:Path="$env:JAVA_HOME\bin;$env:Path"
& 'tools\runtime\apache-maven-3.9.12\bin\mvn.cmd' `
  -q -f 'tools\replay-parser\pom.xml' test
npm test
npm run build
```

Expected: all suites exit 0.

- [x] **Step 2: Inspect the real cached report**

Reparse or load the available real Replay (`8894766243` in this implementation run) and verify:

- Combat strength/problem has L2/L3 target.
- Aggregate strength is not ordinary eligible.
- Ordinary strength/problem button selects a concrete event.
- No ordinary explicit conclusion uses an L0/L1 target.

- [x] **Step 3: Update implementation records**

Document:

- Added localization capability.
- Existing reports use compatibility mode.
- New reports require L2/L3 for explicit ordinary conclusions.
- Exact test counts and any remaining real-Replay gap.

- [x] **Step 4: Review the diff without committing**

Run:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors. Do not stage or commit in the shared dirty worktree.

## Execution Record

- Real Replay: `8894766243`, 267,683 events, 10/10 player reports with the localization capability.
- Localization totals: L3 14, L2 8, L1 4; 22 ordinary-mode eligible conclusions.
- Parser regression: 106 tests passed, 1 optional offline E2E test skipped.
- Frontend regression: 33 tests passed; desktop regression: 3 tests passed.
- Production build passed. The existing Vite warning for chunks over 500 kB remains a separate performance task.
- Browser QA passed at 1440x900 and 1024x768 with no review-bar overflow, control overlap, or console errors.
- Shared worktree was reviewed with `git diff --check`; no changes were staged or committed.
