# Combat Timing Behavior Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate evidence-backed player-report findings for repeated late arrival, premature initiation, missed first rotation, and post-key-item combat activation, with rule B allowing one severe critical-event finding.

**Architecture:** Add a focused `PlayerCombatTimingAnalysis` Parser component that reads existing fight, snapshot, role, event, and purchase modules and emits auditable per-fight facts plus cross-fight patterns. `PlayerReportAnalysis` attaches this model before narrative generation; `PlayerReportNarrativeV3` converts eligible patterns into ordinary-mode insights, while the frontend renders occurrence-level comparisons and reuses the existing bounded Replay navigation.

**Tech Stack:** Java 21, Gson, JUnit 5, JavaScript ES modules, Node test runner, Vite, Electron-compatible DOM.

## Global Constraints

- Work in the current dirty shared branch; do not stage, commit, revert, or overwrite unrelated changes.
- Use PowerShell 7 for scripts and test commands.
- Follow RED-GREEN-REFACTOR for each production behavior.
- Use rule B: repeated patterns have priority; one severe critical objective/fight may enter ordinary mode under stricter gates.
- `harass` and `lane_trade` cannot create combat-timing criticism.
- Long-range or global actions cannot establish spatial arrival by themselves.
- Missing spatial, phase, role, or reachability evidence suppresses criticism.
- No new top-level Tab; ordinary mode and the existing deep `战斗时机`/combat section own the feature.
- Existing `player-report/3.0` remains compatible; advertise the new capability as `player-combat-timing/1.0`.

---

### Task 1: Per-Fight Spatial Timing Facts

**Files:**
- Create: `tools/replay-parser/src/main/java/opendota/PlayerCombatTimingAnalysis.java`
- Create: `tools/replay-parser/src/test/java/opendota/PlayerCombatTimingAnalysisTest.java`

**Interfaces:**
- Consumes: `JsonObject modules`, `int slot`, `int position`, `int roleConfidence`, `int duration`.
- Produces: `static JsonObject analyze(JsonObject modules, int slot, int position, int roleConfidence, int duration)`.
- Produces model fields: `model`, `coverage`, `fight_facts`, `patterns`.

- [x] **Step 1: Write failing tests for spatial arrival**

Create fixtures with `snapshots.fields`, `snapshots.by_slot`, one fight, phases, events, and contributions. Assert:

```java
JsonObject result = PlayerCombatTimingAnalysis.analyze(modules, 5, 4, 92, 1800);
JsonObject fact = result.getAsJsonArray("fight_facts").get(0).getAsJsonObject();
assertEquals(100, fact.get("team_engage_time").getAsInt());
assertEquals(109, fact.get("player_spatial_arrival_time").getAsInt());
assertEquals(9, fact.get("arrival_delta_seconds").getAsInt());
```

Add a second fixture where slot 5 deals remote damage at second 101 but remains outside the battle radius until 109. Assert spatial arrival remains 109.

- [x] **Step 2: Run the focused test and verify RED**

```powershell
$env:JAVA_HOME=(Resolve-Path 'tools\runtime\jdk-21').Path
& 'tools\runtime\apache-maven-3.9.12\bin\mvn.cmd' `
  -q -f 'tools\replay-parser\pom.xml' `
  '-Dtest=PlayerCombatTimingAnalysisTest' test
```

Expected: compilation failure because `PlayerCombatTimingAnalysis` does not exist.

- [x] **Step 3: Implement snapshot and fight adapters**

Implement:

```java
final class PlayerCombatTimingAnalysis {
    static final String MODEL = "player-combat-timing/1.0";

    static JsonObject analyze(JsonObject modules, int slot, int position,
            int roleConfidence, int duration) { ... }
}
```

Read snapshot field indexes by name instead of hardcoding array indexes. Parse only:

- `second`
- `x`
- `y`
- `region`
- `life_state`
- `move_speed`

Ignore malformed rows and preserve coverage counts.

- [x] **Step 4: Implement local engagement and spatial arrival**

For eligible `pickoff`, `skirmish`, `small_skirmish`, and `teamfight` rows:

- use observed `contact_start`;
- derive the phase center from `initiation`, then `clash`, then fight center;
- calculate a bounded local radius from `scatter_radius_pct`;
- require the player to be inside for two of three samples, or inside with a local meaningful action;
- store team engagement, spatial arrival, first meaningful action, and arrival delta;
- remote actions outside the radius remain evidence but do not establish arrival.

- [x] **Step 5: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: all `PlayerCombatTimingAnalysisTest` tests pass.

---

### Task 2: First Rotation and Join-Feasibility Gates

**Files:**
- Modify: `tools/replay-parser/src/main/java/opendota/PlayerCombatTimingAnalysis.java`
- Modify: `tools/replay-parser/src/test/java/opendota/PlayerCombatTimingAnalysisTest.java`

**Interfaces:**
- Extends each fact with: `first_rotation_end`, `missed_first_rotation`, `join_feasibility`, `expected_arrival_seconds`, `actual_arrival_seconds`, `role_expectation`, `confidence`, `suppressed_reasons`.

- [x] **Step 1: Write failing first-rotation tests**

Assert a player arriving after the initiation phase:

```java
assertEquals(106, fact.get("first_rotation_end").getAsInt());
assertTrue(fact.get("missed_first_rotation").getAsBoolean());
assertEquals("reachable", fact.get("join_feasibility").getAsString());
```

Add fixtures proving dead, unresolved-coordinate, low-role-confidence, and physically unreachable players are not negative-eligible.

- [x] **Step 2: Run focused tests and verify RED**

Expected: missing fields or incorrect eligibility assertions.

- [x] **Step 3: Implement first-rotation evidence**

- Prefer reliable `initiation.end`.
- Fall back to `team_engage_time + 8`.
- Count distinct allied ability/control actions before arrival.
- Emit `first_rotation_evidence="phase_only"` or `"phase_plus_actions"`.
- Permit strong copy about allied skills only for `phase_plus_actions`; otherwise retain conservative phase wording.

- [x] **Step 4: Implement reachability**

At review/contact lead-in:

- require alive state;
- calculate movement ETA from calibrated distance and `move_speed`;
- detect completed nearby TP support when present;
- apply position-specific late thresholds: P1 8s, P2/P3 5s, P4/P5 4s;
- suppress when snapshot coverage is below 80%, coordinates are invalid, role confidence is below 65, or arrival was physically impossible before first rotation.

- [x] **Step 5: Run focused tests and verify GREEN**

Expected: all timing and feasibility tests pass.

---

### Task 3: Cross-Fight Patterns, Rule B, and Key Items

**Files:**
- Modify: `tools/replay-parser/src/main/java/opendota/PlayerCombatTimingAnalysis.java`
- Modify: `tools/replay-parser/src/test/java/opendota/PlayerCombatTimingAnalysisTest.java`

**Interfaces:**
- Produces `patterns[]` with `pattern_type`, `kind`, structured copy fields, `occurrences`, `item_context`, evidence references, dimension impacts, and primary jump target.

- [x] **Step 1: Write failing repeated-pattern tests**

Create two consecutive reachable late fights and assert one `late_arrival_sequence`:

```java
JsonObject pattern = result.getAsJsonArray("patterns").get(0).getAsJsonObject();
assertEquals("late_arrival_sequence", pattern.get("pattern_type").getAsString());
assertEquals(2, pattern.getAsJsonArray("occurrences").size());
assertTrue(pattern.get("ordinary_eligible").getAsBoolean());
assertTrue(pattern.get("what_happened").getAsString().contains("两次"));
```

Add an on-time comparable fight between them and assert the wording cannot say `连续两次`.

- [x] **Step 2: Write failing rule-B tests**

- one routine occurrence: not ordinary eligible;
- one critical Roshan/high-ground occurrence with adverse result and confidence at least 85: ordinary eligible;
- single-event title must contain `关键时机` and must not contain `习惯` or `连续`.

- [x] **Step 3: Write failing key-item tests**

Add a real `blink` purchase and two occurrences in the next 300 seconds. Assert:

```java
assertEquals("blink", pattern.getAsJsonObject("item_context").get("key").getAsString());
assertTrue(pattern.get("next_action").getAsString().contains("闪烁匕首"));
```

Without the purchase, assert the action uses a role/state trigger and does not mention Blink.

- [x] **Step 4: Implement pattern aggregation**

Aggregate:

- `late_arrival_sequence`
- `premature_initiation_sequence`
- `missed_first_rotation_sequence`
- `key_item_activation_gap`
- `on_time_follow_up_sequence`

Repeated admission requires two comparable occurrences, no on-time occurrence between them, aggregate confidence at least 78, and at least one adverse consequence. Rule-B single admission requires critical/objective context and confidence at least 85.

- [x] **Step 5: Implement item context and occurrence jump targets**

Use actual purchase rows for Blink/upgrades, BKB, Force Staff, Glimmer Cape, and Lotus Orb. Store each occurrence with a fight jump target from `PlayerReportLocalization.forFight`.

- [x] **Step 6: Run focused tests and verify GREEN**

Expected: pattern, rule-B, and key-item tests all pass.

---

### Task 4: Player Report Narrative and Root-Cause Integration

**Files:**
- Modify: `tools/replay-parser/src/main/java/opendota/PlayerReportAnalysis.java`
- Modify: `tools/replay-parser/src/main/java/opendota/PlayerReportNarrativeV3.java`
- Modify: `tools/replay-parser/src/test/java/opendota/PlayerReportNarrativeV3Test.java`

**Interfaces:**
- Attaches `report.combat_timing`.
- Converts eligible patterns into `insights[]`.
- Preserves occurrence data and primary jump target.

- [x] **Step 1: Write a failing narrative test**

Construct modules containing a timing pattern and assert:

```java
JsonObject insight = findInsightByCategory(report, "combat_timing");
assertEquals("improvement", insight.get("kind").getAsString());
assertEquals(2, insight.getAsJsonArray("occurrences").size());
assertTrue(insight.get("fact").getAsString().contains("分别晚于"));
assertTrue(insight.get("ordinary_eligible").getAsBoolean());
```

Assert the generic `4号位在这场有效战斗中的职责完成不足` insight is absent when the specific pattern covers the same primary fight.

- [x] **Step 2: Run focused tests and verify RED**

Expected: `combat_timing` is absent or generic combat insight remains.

- [x] **Step 3: Invoke timing analysis before narrative generation**

In `PlayerReportAnalysis.enrich`, call:

```java
JsonObject combatTiming = PlayerCombatTimingAnalysis.analyze(
        modules, slot, position, intValue(facts, "role_confidence", 0), duration);
report.add("combat_timing", combatTiming);
```

- [x] **Step 4: Convert patterns into insights**

Map:

- `what_happened -> fact`
- `why_it_matters -> judgment`
- `result -> impact`
- `next_action -> action`
- `occurrences` retained
- root cause ID `combat-timing:<pattern id>`
- dimension impacts preserved
- primary jump target preserved

Insert specific timing insights before generic combat insights and suppress generic problems for covered fight IDs.

- [x] **Step 5: Run narrative and full Parser tests**

```powershell
$env:JAVA_HOME=(Resolve-Path 'tools\runtime\jdk-21').Path
& 'tools\runtime\apache-maven-3.9.12\bin\mvn.cmd' `
  -q -f 'tools\replay-parser\pom.xml' test
```

Expected: zero failures.

---

### Task 5: Ordinary Report Occurrence Rendering

**Files:**
- Modify: `app-core.js`
- Modify: `app.js`
- Modify: `styles.css`
- Modify: `tests/frontend/app-core.test.js`

**Interfaces:**
- Extends normalized insight model with `occurrences`.
- Reuses `reviewPlayerScoreInsight` through an optional occurrence target.

- [x] **Step 1: Write failing frontend tests**

Assert:

```js
const insight = normalizePlayerReportInsight({
  occurrences: [
    { id: "fight-25", label: "15:47 中路 +9秒", jump_target: { /* L3 fight target */ } },
    { id: "fight-29", label: "18:04 河道 +11秒", jump_target: { /* L3 fight target */ } },
  ],
});
assert.equal(insight.occurrences.length, 2);
```

Add static integration assertions for `data-player-score-review-occurrence`.

- [x] **Step 2: Run frontend tests and verify RED**

Expected: missing normalizer/export or missing occurrence markup.

- [x] **Step 3: Add occurrence normalization**

Add a pure helper in `app-core.js` that:

- validates each occurrence's jump target;
- drops malformed occurrences;
- keeps time, location, arrival delta, first-rotation status, label, and fight ID.

- [x] **Step 4: Render ordinary occurrence buttons**

Under the primary problem text, render at most three buttons:

```text
15:47 中路 +9秒
18:04 河道 +11秒
```

The main `查看这一波` continues to use the primary occurrence.

- [x] **Step 5: Route occurrence clicks**

Pass the selected occurrence jump target into the existing navigation flow, select the correct fight, center the list, start at its review range, and retain the pattern ID in return context.

- [x] **Step 6: Run frontend tests and verify GREEN**

Run `npm run test:frontend`. Expected: all tests pass.

---

### Task 6: Deep Combat-Timing Evidence

**Files:**
- Modify: `app.js`
- Modify: `styles.css`
- Modify: `tests/frontend/app-core.test.js`

**Interfaces:**
- Reads `model.report.combat_timing.fight_facts`.
- Adds a combat-timing table to `renderPlayerScoreCombat`.

- [x] **Step 1: Write a failing rendering test**

Assert the combat renderer contains:

- `战斗时机`
- `队伍接触`
- `你的到场`
- `首次行动`
- `首轮交战`
- `到场条件`

- [x] **Step 2: Run frontend tests and verify RED**

Expected: labels are absent.

- [x] **Step 3: Normalize combat timing in `playerScoreModel`**

Expose:

```js
combatTiming: {
  model,
  coverage,
  facts,
  patterns,
}
```

- [x] **Step 4: Render the deep evidence table**

Render only facts for the selected player. Each row displays comparison values and opens the corresponding fight. Suppressed rows show their reason instead of a negative label.

- [x] **Step 5: Run tests and production build**

```powershell
npm test
npm run build
```

Expected: all frontend and desktop tests pass; Vite exits 0.

---

### Task 7: Real Replay Regression and Documentation

**Files:**
- Modify: `DOTA-LENS-PLAYER-ANALYSIS-REPORT-V3-PRD.md`
- Modify: `DOTA-LENS-0.5.0-PLAYER-REPORT-PRODUCTIZATION-PRD.md`
- Modify: this plan

**Interfaces:**
- Produces implementation evidence and remaining-gap record.

- [x] **Step 1: Rebuild and restart the Parser**

Verify no active job, shut down the current Parser gracefully, run:

```powershell
pwsh -NoProfile -File .\tools\Build-DotaLensParser.ps1
pwsh -NoProfile -File .\tools\Start-DotaLens.ps1 -FrontendPort 4173
```

- [x] **Step 2: Reparse a real Replay**

Use `8894766243.dem` and verify:

- remote action no longer forces arrival delay to zero;
- timing facts exist for eligible fights;
- generic combat problem is replaced only when a specific eligible pattern exists;
- all ordinary findings have valid occurrence jump targets;
- uncertain findings remain deep-mode facts.

- [x] **Step 3: Browser QA**

At 1440x900 and 1024x768:

- ordinary problem text remains readable;
- occurrence buttons do not overflow;
- each occurrence selects the correct fight and centers it;
- bounded playback stops at the selected occurrence end;
- returning restores the report and selected pattern;
- deep timing table does not cause horizontal page overflow.

- [x] **Step 4: Update PRD implementation records**

Record exact Parser/frontend/desktop test totals, real Replay findings, suppressed cases, known limitations, and whether strong first-skill wording was available.

- [x] **Step 5: Final verification without committing**

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors. Do not stage or commit shared-worktree changes.

#### Task 7 Evidence

- Parser: 120 tests passed, 1 optional offline E2E skipped.
- Frontend: 36 tests passed; desktop: 3 tests passed; Vite production build passed.
- Replay `8894766243`: 40.581 s, 10 reports, 190 timing facts, 22 patterns, 10 ordinary patterns, 112 suppressed facts, 36 remote-action-before-arrival facts, 0 invalid occurrence targets.
- Browser QA: 1440x900 and 1024x768 have no horizontal page or timing-table overflow. Occurrence jumps select and center `06:49-07:12` and `11:33-11:56`; the first bounded playback stops at `07:18.017`, 17 ms after its target end.
- Responsive regression: `.app-main` is explicitly placed in grid column 2, preventing an expanded fixed sidebar from collapsing the workspace into the 64px sidebar track.
