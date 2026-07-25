# Combat Contribution Chart And Drilldown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the combat page's ten-player numeric table with a current-fight-first mirrored comparison chart, full-match aggregation, and evidence-gated player responsibility drilldown.

**Architecture:** The Java Parser remains the only owner of position-specific responsibility scoring and emits auditable score components plus compact event references. Pure functions in `app-core.js` join the fixed ten-player roster, aggregate fights, and normalize chart/drilldown models. `app.js` renders two ECharts instances, reuses the existing combat inspector and event navigation, and keeps older analysis packages usable.

**Tech Stack:** Java 21, Gson, JUnit 5, JavaScript ES modules, Node test runner, ECharts, Lucide, Vite, Electron, PowerShell 7.

## Global Constraints

- Default scope is `current`; the user must explicitly switch to `all`.
- Current-fight scope always renders all ten players.
- A player missing from the effective participant set is visible but grey and unscored.
- Responsibility scores are visible only when `responsibility_gate.status == "passed"` and `role_confidence >= 65`.
- `blocked` and `insufficient_evidence` states never use negative red styling or definite criticism.
- Full-match scope uses all `COMBAT_SEGMENTS`, then applies the existing `all`, `important`, `critical`, or `teamfight` filter.
- Full-match scope must not inherit the left list's selected-player participation restriction.
- Percentages are recomputed from totals; per-fight percentages are never averaged.
- Arrival aggregation uses median and P75, not arithmetic mean.
- The frontend never reimplements the Parser responsibility formula.
- Older packages without `score_components` still render raw metrics and a clear upgrade state.
- Reuse ECharts; add no second chart dependency.
- Preserve the selected fight, map, phase, playback time, and event stream when switching chart scope.
- The shared working tree already contains unrelated edits. Never stage or revert them. Task commit steps are allowed only when feature-only staging can be proven; otherwise keep the task changes unstaged and report the checkpoint.

---

## File Map

### Parser scoring contract

- Create: `tools/replay-parser/src/main/java/opendota/FightResponsibilityScore.java`
  - Owns all five position score formulas and serializable score components.
- Create: `tools/replay-parser/src/test/java/opendota/FightResponsibilityScoreTest.java`
  - Verifies exact formulas, caps, penalties, and component sums.
- Modify: `tools/replay-parser/src/main/java/opendota/ProductAnalysis.java`
  - Calls the scorer and emits `score_model`, `score_components`, and compact `dimension_evidence`.
- Modify: `tools/replay-parser/src/test/java/opendota/ProductAnalysisTest.java`
  - Verifies the contribution JSON contract against parsed events.

### Frontend data model

- Modify: `app-core.js`
  - Adds pure roster, aggregation, display-state, metric, chart-model, and drilldown functions.
- Create: `tests/frontend/combat-contribution.test.js`
  - Verifies all current and all-match calculation rules without a browser.

### Frontend rendering

- Modify: `chart-runtime.js`
  - Registers ECharts bar and radar support.
- Modify: `index.html`
  - Adds scope/metric controls, chart shell, accessible roster, radar, component list, and dimension details.
- Modify: `app.js`
  - Owns chart lifecycle, rendering, selection, drilldown, and event navigation.
- Modify: `styles.css`
  - Implements mirrored layout, data states, responsive behavior, and readable drilldown.
- Create: `tests/frontend/combat-contribution-ui.test.js`
  - Guards required DOM contracts and event bindings.

### Verification artifacts

- Create: `.validation/combat-contribution-current-1460.png`
- Create: `.validation/combat-contribution-all-1460.png`
- Create: `.validation/combat-contribution-current-1024.png`

---

### Task 1: Emit Auditable Responsibility Score Components

**Files:**
- Create: `tools/replay-parser/src/main/java/opendota/FightResponsibilityScore.java`
- Create: `tools/replay-parser/src/test/java/opendota/FightResponsibilityScoreTest.java`
- Modify: `tools/replay-parser/src/main/java/opendota/ProductAnalysis.java:4321`
- Modify: `tools/replay-parser/src/test/java/opendota/ProductAnalysisTest.java:193`

**Interfaces:**
- Consumes: raw contribution facts already calculated by `ProductAnalysis.buildFightContributions`.
- Produces:
  - `FightResponsibilityScore.calculate(Input): Result`
  - `Result.score(): int`
  - `Result.toJson(boolean judgmentSuppressed): JsonObject`
  - contribution fields `score_model`, `score_components`, and `dimension_evidence`.

- [ ] **Step 1: Write exact scorer tests**

Create `FightResponsibilityScoreTest.java` with one exact fixture per position and explicit cap/penalty checks:

```java
package opendota;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;

class FightResponsibilityScoreTest {
    @Test
    void positionOneExposesEveryPointSourceAndMatchesRoundedTotal() {
        FightResponsibilityScore.Result result = FightResponsibilityScore.calculate(
                new FightResponsibilityScore.Input(
                        1, 0.278, 0.488, 0.414, 10, 6, 2.6, 300,
                        0, 0, 85, 34, 2));

        assertEquals(67, result.score());
        JsonObject components = result.toJson(false);
        assertEquals(24.0, components.getAsJsonObject("base").get("points").getAsDouble(), 0.001);
        assertEquals(27.8, components.getAsJsonObject("damage_share").get("points").getAsDouble(), 0.001);
        assertEquals(6.832, components.getAsJsonObject("kill_conversion").get("points").getAsDouble(), 0.001);
        assertEquals(10.0, components.getAsJsonObject("ability_casts").get("points").getAsDouble(), 0.001);
        assertEquals(11.9, components.getAsJsonObject("presence").get("points").getAsDouble(), 0.001);
        assertEquals(-14.0, components.getAsJsonObject("death_penalty").get("points").getAsDouble(), 0.001);
    }

    @Test
    void positionThreeCapsFrontlineAndControlComponents() {
        FightResponsibilityScore.Result result = FightResponsibilityScore.calculate(
                new FightResponsibilityScore.Input(
                        3, 0.50, 0.0, 0.60, 20, 2, 20.0, 0,
                        0, 0, 100, 0, 0));

        JsonObject components = result.toJson(false);
        assertEquals(24.0, components.getAsJsonObject("damage_share").get("points").getAsDouble(), 0.001);
        assertEquals(18.0, components.getAsJsonObject("damage_taken_share").get("points").getAsDouble(), 0.001);
        assertEquals(18.0, components.getAsJsonObject("control").get("points").getAsDouble(), 0.001);
        assertEquals(100, result.score());
    }

    @Test
    void suppressedResultMarksComponentsWithoutChangingHistoricalScore() {
        FightResponsibilityScore.Result result = FightResponsibilityScore.calculate(
                new FightResponsibilityScore.Input(
                        5, 0.0, 0.0, 0.0, 0, 0, 0.0, 0,
                        0, 0, 70, 4, 1));

        JsonObject components = result.toJson(true);
        assertTrue(components.getAsJsonObject("ability_casts").get("judgment_suppressed").getAsBoolean());
        assertTrue(components.getAsJsonObject("control").get("judgment_suppressed").getAsBoolean());
    }
}
```

Add two more table-driven cases in the same file for position 2 and position 4. Use these exact formulas:

| Position | Components |
| --- | --- |
| 1 | `24 + min(38, damageShare*100) + min(12, conversionShare*14) + min(10, abilityCasts*2.5) + presencePct*0.14 - deaths*7` |
| 2 | `24 + min(34, damageShare*100) + min(14, abilityCasts*3) + min(10, controlSeconds*2) + max(0, 10-arrivalDelay*2) + presencePct*0.12 - deaths*6` |
| 3 | `24 + min(24, damageShare*100) + min(18, damageTakenShare*100) + min(18, controlSeconds*3) + min(8, abilityCasts*2) + presencePct*0.12 - deaths*4` |
| 4 | `26 + min(20, abilityCasts*4) + min(20, controlSeconds*3) + min(10, healing/220) + min(10, wardCount*5) + min(8, itemUses*2) + presencePct*0.10 - deaths*5` |
| 5 | `26 + min(18, abilityCasts*4) + min(18, controlSeconds*3) + min(16, healing/180) + min(12, wardCount*6) + min(8, itemUses*2) + presencePct*0.10 - deaths*5` |

- [ ] **Step 2: Run the scorer test and verify red**

Run:

```powershell
$env:JAVA_HOME = "$PWD\tools\runtime\jdk-21"
$mvn = "$PWD\tools\runtime\apache-maven-3.9.12\bin\mvn.cmd"
& $mvn -q -f tools/replay-parser/pom.xml -Dtest=FightResponsibilityScoreTest test
```

Expected: compilation failure because `FightResponsibilityScore` does not exist.

- [ ] **Step 3: Implement the scorer as a package-private value object**

Create `FightResponsibilityScore.java` with:

```java
package opendota;

import com.google.gson.JsonObject;
import java.util.LinkedHashMap;
import java.util.Map;

final class FightResponsibilityScore {
    record Input(
            int position,
            double damageShare,
            double killConversionShare,
            double damageTakenShare,
            int abilityCasts,
            int itemUses,
            double controlSeconds,
            int healing,
            int setupObservers,
            int setupSentries,
            int presencePct,
            int arrivalDelay,
            int deaths) {}

    record Component(double points, double maxPoints, double rawValue, String rawUnit) {
        JsonObject toJson(boolean judgmentSuppressed) {
            JsonObject row = new JsonObject();
            row.addProperty("points", round3(points));
            row.addProperty("max_points", round3(maxPoints));
            row.addProperty("raw_value", round3(rawValue));
            row.addProperty("raw_unit", rawUnit);
            row.addProperty("status", "applicable");
            row.addProperty("judgment_suppressed", judgmentSuppressed);
            return row;
        }
    }

    record Result(int score, Map<String, Component> components) {
        JsonObject toJson(boolean judgmentSuppressed) {
            JsonObject row = new JsonObject();
            components.forEach((key, value) -> row.add(key, value.toJson(judgmentSuppressed)));
            return row;
        }
    }

    static Result calculate(Input input) {
        Map<String, Component> components = new LinkedHashMap<>();
        int wards = input.setupObservers() + input.setupSentries();
        double base = input.position() <= 3 ? 24 : 26;
        put(components, "base", base, base, base, "points");

        switch (input.position()) {
            case 1 -> {
                put(components, "damage_share", Math.min(38, input.damageShare() * 100), 38,
                        input.damageShare() * 100, "percent");
                put(components, "kill_conversion", Math.min(12, input.killConversionShare() * 14), 12,
                        input.killConversionShare() * 100, "percent");
                put(components, "ability_casts", Math.min(10, input.abilityCasts() * 2.5), 10,
                        input.abilityCasts(), "casts");
                put(components, "presence", input.presencePct() * 0.14, 14,
                        input.presencePct(), "percent");
                put(components, "death_penalty", -input.deaths() * 7.0, 0,
                        input.deaths(), "deaths");
            }
            case 2 -> {
                put(components, "damage_share", Math.min(34, input.damageShare() * 100), 34,
                        input.damageShare() * 100, "percent");
                put(components, "ability_casts", Math.min(14, input.abilityCasts() * 3.0), 14,
                        input.abilityCasts(), "casts");
                put(components, "control", Math.min(10, input.controlSeconds() * 2.0), 10,
                        input.controlSeconds(), "seconds");
                put(components, "arrival", Math.max(0, 10 - input.arrivalDelay() * 2.0), 10,
                        input.arrivalDelay(), "seconds");
                put(components, "presence", input.presencePct() * 0.12, 12,
                        input.presencePct(), "percent");
                put(components, "death_penalty", -input.deaths() * 6.0, 0,
                        input.deaths(), "deaths");
            }
            case 3 -> {
                put(components, "damage_share", Math.min(24, input.damageShare() * 100), 24,
                        input.damageShare() * 100, "percent");
                put(components, "damage_taken_share", Math.min(18, input.damageTakenShare() * 100), 18,
                        input.damageTakenShare() * 100, "percent");
                put(components, "control", Math.min(18, input.controlSeconds() * 3.0), 18,
                        input.controlSeconds(), "seconds");
                put(components, "ability_casts", Math.min(8, input.abilityCasts() * 2.0), 8,
                        input.abilityCasts(), "casts");
                put(components, "presence", input.presencePct() * 0.12, 12,
                        input.presencePct(), "percent");
                put(components, "death_penalty", -input.deaths() * 4.0, 0,
                        input.deaths(), "deaths");
            }
            case 4 -> addSupportComponents(components, input, wards, 20, 20, 10, 10, 8, 220.0, 5.0);
            default -> addSupportComponents(components, input, wards, 18, 18, 16, 12, 8, 180.0, 6.0);
        }

        double total = components.values().stream().mapToDouble(Component::points).sum();
        return new Result((int) Math.round(Math.max(0, Math.min(100, total))), components);
    }

    private static void addSupportComponents(
            Map<String, Component> components, Input input, int wards,
            double castMax, double controlMax, double healMax, double wardMax,
            double itemMax, double healDivisor, double wardMultiplier) {
        put(components, "ability_casts", Math.min(castMax, input.abilityCasts() * 4.0), castMax,
                input.abilityCasts(), "casts");
        put(components, "control", Math.min(controlMax, input.controlSeconds() * 3.0), controlMax,
                input.controlSeconds(), "seconds");
        put(components, "healing", Math.min(healMax, input.healing() / healDivisor), healMax,
                input.healing(), "health");
        put(components, "vision_setup", Math.min(wardMax, wards * wardMultiplier), wardMax,
                wards, "wards");
        put(components, "item_uses", Math.min(itemMax, input.itemUses() * 2.0), itemMax,
                input.itemUses(), "uses");
        put(components, "presence", input.presencePct() * 0.10, 10,
                input.presencePct(), "percent");
        put(components, "death_penalty", -input.deaths() * 5.0, 0,
                input.deaths(), "deaths");
    }

    private static void put(Map<String, Component> target, String key, double points,
            double maxPoints, double rawValue, String rawUnit) {
        target.put(key, new Component(points, maxPoints, rawValue, rawUnit));
    }

    private static double round3(double value) {
        return Math.round(value * 1000.0) / 1000.0;
    }
}
```

- [ ] **Step 4: Run the scorer test and verify green**

Run the command from Step 2.

Expected: all `FightResponsibilityScoreTest` cases pass.

- [ ] **Step 5: Write the Parser JSON contract test**

Extend `buildsFightVisionAndRoleResponsibilityEvidence`:

```java
assertEquals("position-responsibility/1.1", support.get("score_model").getAsString());
assertTrue(support.getAsJsonObject("score_components").has("base"));
assertTrue(support.getAsJsonObject("score_components").has("control"));
assertEquals(
        support.get("responsibilityScore").getAsInt(),
        Math.round(sumComponentPoints(support.getAsJsonObject("score_components"))));

JsonObject evidence = support.getAsJsonObject("dimension_evidence");
assertTrue(evidence.getAsJsonArray("damage").size() >= 1);
assertTrue(evidence.getAsJsonArray("control").size() >= 1);
assertTrue(evidence.getAsJsonArray("healing").size() >= 1);
assertTrue(evidence.getAsJsonArray("vision_setup").size() >= 1);
assertTrue(evidence.getAsJsonArray("damage").get(0).getAsJsonObject().has("game_time_ms"));
```

Add this exact test helper:

```java
private static double sumComponentPoints(JsonObject components) {
    double total = 0;
    for (String key : components.keySet()) {
        total += components.getAsJsonObject(key).get("points").getAsDouble();
    }
    return Math.max(0, Math.min(100, total));
}
```

- [ ] **Step 6: Run the ProductAnalysis test and verify red**

Run:

```powershell
$env:JAVA_HOME = "$PWD\tools\runtime\jdk-21"
$mvn = "$PWD\tools\runtime\apache-maven-3.9.12\bin\mvn.cmd"
& $mvn -q -f tools/replay-parser/pom.xml -Dtest=ProductAnalysisTest#buildsFightVisionAndRoleResponsibilityEvidence test
```

Expected: failure because the new JSON fields are absent.

- [ ] **Step 7: Replace the inline score formula and emit compact evidence**

In `buildFightContributions`:

1. Build `FightResponsibilityScore.Input` from the already calculated local variables.
2. Replace the switch-assigned `score` with `scoreResult.score()`.
3. Preserve existing issue gates and status behavior.
4. Add:

```java
row.addProperty("responsibility_model", "position-responsibility/1.1");
row.addProperty("score_model", "position-responsibility/1.1");
row.add("score_components", scoreResult.toJson(
        !responsibilityStatus.equals("passed") || roleConfidence < 65));
row.add("dimension_evidence", buildContributionDimensionEvidence(
        slot, fightDamage, fightHeals, fightControls, fightUsages, wardRows, start, end));
```

Implement `buildContributionDimensionEvidence` with arrays named:

- `damage`
- `damage_taken`
- `control`
- `healing`
- `ability_casts`
- `item_uses`
- `vision_setup`
- `arrival`

Each reference contains only:

```json
{
  "event_seq": 9980,
  "game_time_ms": 43067,
  "kind": "damage",
  "key": "shadow_shaman_shackles",
  "value": 320
}
```

Use `EventStamp.annotate` to preserve event identity. Keep at most 12 references per dimension and add `<dimension>_total_count` when more exist. Do not duplicate full event payloads.

`arrival` is a compact derived reference with `game_time_ms = (start + arrivalDelay) * 1000`, `kind = "spatial_arrival_legacy"`, `value = arrivalDelay`, and no fabricated `event_seq`. The frontend replaces this with `player-combat-timing/1.0` evidence when that module is already available.

- [ ] **Step 8: Run focused and full Parser tests**

Run:

```powershell
$env:JAVA_HOME = "$PWD\tools\runtime\jdk-21"
$mvn = "$PWD\tools\runtime\apache-maven-3.9.12\bin\mvn.cmd"
& $mvn -q -f tools/replay-parser/pom.xml "-Dtest=FightResponsibilityScoreTest,ProductAnalysisTest" test
& $mvn -q -f tools/replay-parser/pom.xml test
```

Expected: both commands exit `0`.

- [ ] **Step 9: Create a safe task checkpoint**

Run:

```powershell
git diff -- tools/replay-parser/src/main/java/opendota/FightResponsibilityScore.java `
  tools/replay-parser/src/main/java/opendota/ProductAnalysis.java `
  tools/replay-parser/src/test/java/opendota/FightResponsibilityScoreTest.java `
  tools/replay-parser/src/test/java/opendota/ProductAnalysisTest.java
git status --short
```

If and only if those paths contain no unrelated pre-existing edits, commit:

```powershell
git add -- tools/replay-parser/src/main/java/opendota/FightResponsibilityScore.java `
  tools/replay-parser/src/main/java/opendota/ProductAnalysis.java `
  tools/replay-parser/src/test/java/opendota/FightResponsibilityScoreTest.java `
  tools/replay-parser/src/test/java/opendota/ProductAnalysisTest.java
git commit -m "feat: expose combat responsibility score components"
```

Otherwise leave them unstaged.

---

### Task 2: Build The Ten-Player And Full-Match Data Model

**Files:**
- Modify: `app-core.js`
- Create: `tests/frontend/combat-contribution.test.js`

**Interfaces:**
- Consumes: ten heroes, one current fight, filtered full-match fights, optional combat-timing facts.
- Produces:
  - `buildCombatContributionRoster({ heroes, fight }): CombatContributionRow[]`
  - `aggregateCombatContributions({ heroes, fights, timingFacts }): CombatContributionRow[]`
  - `combatContributionDisplayStatus(row): DisplayStatus`
  - `combatContributionMetric(row, metric): MetricDisplay`
  - `combatContributionDrilldown({ row, opponent, metric, scope }): DrilldownModel`
  - `combatContributionChartModel({ rows, metric }): ChartModel`

- [ ] **Step 1: Write current-fight roster tests**

Create `tests/frontend/combat-contribution.test.js`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateCombatContributions,
  buildCombatContributionRoster,
  combatContributionDisplayStatus,
  combatContributionDrilldown,
  combatContributionMetric,
} from "../../app-core.js";

const heroes = Array.from({ length: 10 }, (_, slot) => ({
  slot,
  team: slot < 5 ? "radiant" : "dire",
  position: slot % 5 + 1,
  name: `英雄${slot}`,
  player: `玩家${slot}`,
  token: `hero_${slot}`,
}));

test("current combat roster always contains ten players and greys absences", () => {
  const fight = {
    id: "fight-1",
    participants: [0, 1, 5, 6],
    contributions: [
      {
        slot: 0,
        position: 1,
        role_confidence: 96,
        damage: 1000,
        responsibilityScore: 80,
        responsibility_gate: { status: "passed" },
      },
      {
        slot: 5,
        position: 1,
        role_confidence: 96,
        damage: 700,
        responsibilityScore: 62,
        responsibility_gate: { status: "blocked" },
      },
    ],
  };

  const rows = buildCombatContributionRoster({ heroes, fight });
  assert.equal(rows.length, 10);
  assert.equal(rows.find((row) => row.slot === 0).displayStatus, "passed");
  assert.equal(rows.find((row) => row.slot === 1).displayStatus, "participant_no_events");
  assert.equal(rows.find((row) => row.slot === 2).displayStatus, "not_participant");
  assert.equal(rows.find((row) => row.slot === 5).displayStatus, "blocked");
});

test("unpassed gate and uncertain role never expose a score", () => {
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
  assert.equal(uncertain.available, false);
});
```

- [ ] **Step 2: Write aggregation tests**

Add:

```js
test("full-match shares are recomputed from totals instead of averaged", () => {
  const fights = [
    {
      id: "a",
      contact_start: 10,
      contact_end: 20,
      participants: [0, 1, 5],
      contributions: [
        { slot: 0, damage: 900, teamDamageShare: 90, presencePct: 100, arrivalDelay: 1,
          responsibilityScore: 80, role_confidence: 96, responsibility_gate: { status: "passed" } },
        { slot: 1, damage: 100, teamDamageShare: 10, presencePct: 100, arrivalDelay: 2,
          responsibilityScore: 70, role_confidence: 96, responsibility_gate: { status: "passed" } },
        { slot: 5, damage: 500, teamDamageShare: 100, presencePct: 100, arrivalDelay: 3,
          responsibilityScore: 60, role_confidence: 96, responsibility_gate: { status: "passed" } },
      ],
    },
    {
      id: "b",
      contact_start: 30,
      contact_end: 60,
      participants: [0, 1, 5],
      contributions: [
        { slot: 0, damage: 100, teamDamageShare: 10, presencePct: 50, arrivalDelay: 9,
          responsibilityScore: 60, role_confidence: 96, responsibility_gate: { status: "passed" } },
        { slot: 1, damage: 900, teamDamageShare: 90, presencePct: 50, arrivalDelay: 4,
          responsibilityScore: 80, role_confidence: 96, responsibility_gate: { status: "passed" } },
        { slot: 5, damage: 500, teamDamageShare: 100, presencePct: 50, arrivalDelay: 5,
          responsibilityScore: 60, role_confidence: 96, responsibility_gate: { status: "passed" } },
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
  assert.equal(row.passedGateCount, 2);
});

test("full-match responsibility excludes blocked and insufficient fights", () => {
  const fights = [{
    id: "gates",
    contact_start: 0,
    contact_end: 10,
    participants: [0, 5],
    contributions: [
      { slot: 0, responsibilityScore: 90, role_confidence: 96,
        responsibility_gate: { status: "blocked" } },
      { slot: 5, responsibilityScore: 75, role_confidence: 96,
        responsibility_gate: { status: "passed" } },
    ],
  }];

  const rows = aggregateCombatContributions({ heroes, fights, timingFacts: [] });
  assert.equal(rows.find((row) => row.slot === 0).responsibilityScore, null);
  assert.equal(rows.find((row) => row.slot === 5).responsibilityScore, 75);
});
```

Use nearest-rank P75, so sorted `[1, 9]` produces `9`.

- [ ] **Step 3: Run the frontend test and verify red**

Run:

```powershell
node --test tests/frontend/combat-contribution.test.js
```

Expected: module export failure for `buildCombatContributionRoster`.

- [ ] **Step 4: Implement normalized row and aggregation helpers**

Use this row contract:

```js
{
  slot: 0,
  team: "radiant",
  position: 1,
  hero: {},
  displayStatus: "passed",
  participantCount: 1,
  fightCount: 1,
  passedGateCount: 1,
  blockedGateCount: 0,
  insufficientCount: 0,
  damage: 1000,
  teamDamageShare: 50,
  damageTaken: 500,
  teamDamageTakenShare: 25,
  abilityCasts: 4,
  itemUses: 2,
  controlSeconds: 1.5,
  healing: 0,
  presencePct: 80,
  arrivalMedianSeconds: 3,
  arrivalP75Seconds: 3,
  setupObservers: 0,
  setupSentries: 0,
  responsibilityScore: 76,
  score_components: {},
  dimension_evidence: {}
}
```

Implementation rules:

1. Normalize slots with `Number`.
2. Join by slot, never by array index.
3. Sort each team by position, then slot.
4. Recompute team shares from summed player and team totals.
5. Weight presence by `max(1, contact_end - contact_start)`.
6. Use timing facts matching both `fight_id` and `player_slot` before falling back to `arrivalDelay`.
7. Aggregate score and score components only from passed gates and role-ready rows. Use `weight = clamp(contact_end - contact_start, 5, 30) * importanceFactor`, where `routine = 1.0`, `important = 1.25`, and `critical = 1.5`; round the final score to one decimal place.
8. Full-match display status is:
   - `passed` when at least one passed sample exists;
   - `blocked` when there are only blocked samples;
   - `insufficient_evidence` when there are contribution samples but none passed;
   - `not_participant` when the player has no participant sample.

Define metric metadata exactly:

```js
const COMBAT_CONTRIBUTION_METRICS = Object.freeze({
  responsibility: { label: "职责评分", field: "responsibilityScore", unit: "score", higherIsBetter: true },
  damage: { label: "伤害", field: "damage", unit: "number", higherIsBetter: null },
  damage_taken: { label: "承伤", field: "damageTaken", unit: "number", higherIsBetter: null },
  control: { label: "控制", field: "controlSeconds", unit: "seconds", higherIsBetter: null },
  healing: { label: "治疗", field: "healing", unit: "number", higherIsBetter: null },
  presence: { label: "在场", field: "presencePct", unit: "percent", higherIsBetter: true },
  arrival: { label: "到场", field: "arrivalMedianSeconds", unit: "delay", higherIsBetter: false },
  vision: { label: "视野准备", field: "visionSetup", unit: "wards", higherIsBetter: null },
});
```

- [ ] **Step 5: Implement chart and drilldown models**

`combatContributionChartModel` returns:

```js
{
  metric: "damage",
  label: "伤害",
  maxValue: 1000,
  radiant: [{ slot: 0, position: 1, value: 1000, available: true }],
  dire: [{ slot: 5, position: 1, value: 700, available: true }],
  positions: [1, 2, 3, 4, 5]
}
```

`combatContributionDrilldown` returns:

```js
{
  slot: 0,
  scope: "current",
  metric: "damage",
  status: "passed",
  score: 76,
  gate: {},
  roleAxes: [
    { key: "damage_share", label: "输出占比", value: 73, applicable: true }
  ],
  components: [
    { key: "damage_share", label: "输出占比", points: 27.8, maxPoints: 38,
      rawValue: 27.8, rawUnit: "percent", judgmentSuppressed: false }
  ],
  selectedDimension: {
    key: "damage",
    value: 1000,
    teamShare: 50,
    opponentValue: 700,
    evidence: []
  }
}
```

Map role axes using the exact role lists from the approved design. If a component does not exist, return `applicable: false` instead of zero.

Normalize applicable radar axes with these exact rules:

| Position | Axis | Component calculation |
| --- | --- | --- |
| 1 | 输出占比 | `ratio(damage_share)` |
| 1 | 减员转化 | `ratio(kill_conversion)` |
| 1 | 技能执行 | `ratio(ability_casts)` |
| 1 | 在场输出 | `ratio(presence)` |
| 1 | 生存代价 | `survival(death_penalty, 21)` |
| 2 | 输出占比 | `ratio(damage_share)` |
| 2 | 技能执行 | `ratio(ability_casts)` |
| 2 | 控制价值 | `ratio(control)` |
| 2 | 到场时机 | `ratio(arrival)` |
| 2 | 在场率 | `ratio(presence)` |
| 3 | 承伤价值 | `ratio(damage_taken_share)` |
| 3 | 先手或控制 | `ratio(control)` |
| 3 | 输出补充 | `ratio(damage_share)` |
| 3 | 技能执行 | `ratio(ability_casts)` |
| 3 | 在场率 | `ratio(presence)` |
| 4 | 技能执行 | `ratio(ability_casts)` |
| 4 | 控制价值 | `ratio(control)` |
| 4 | 治疗或功能 | `max(ratio(healing), ratio(item_uses))` |
| 4 | 视野准备 | `ratio(vision_setup)` |
| 4 | 在场率 | `ratio(presence)` |
| 5 | 救人或治疗 | `max(ratio(healing), ratio(item_uses))` |
| 5 | 控制价值 | `ratio(control)` |
| 5 | 道具执行 | `ratio(item_uses)` |
| 5 | 视野准备 | `ratio(vision_setup)` |
| 5 | 在场率 | `ratio(presence)` |

Use:

```js
const ratio = (component) => component && component.max_points > 0
  ? Math.max(0, Math.min(100, component.points / component.max_points * 100))
  : null;
const survival = (component, threeDeathPenalty) => component
  ? Math.max(0, 100 - Math.abs(component.points) / threeDeathPenalty * 100)
  : null;
```

- [ ] **Step 6: Run focused and full frontend tests**

Run:

```powershell
node --test tests/frontend/combat-contribution.test.js
npm run test:frontend
```

Expected: both commands exit `0`.

- [ ] **Step 7: Create a safe task checkpoint**

Run:

```powershell
git diff -- app-core.js tests/frontend/combat-contribution.test.js
git status --short
```

Commit only if `app-core.js` has no unrelated unstaged edits:

```powershell
git add -- app-core.js tests/frontend/combat-contribution.test.js
git commit -m "feat: model ten-player combat contributions"
```

Otherwise leave both paths unstaged.

---

### Task 3: Render Current-Fight And Full-Match Mirrored Charts

**Files:**
- Modify: `chart-runtime.js`
- Modify: `index.html:522`
- Modify: `app.js:839`
- Modify: `app.js:4141`
- Create: `tests/frontend/combat-contribution-ui.test.js`

**Interfaces:**
- Consumes: Task 2 chart models.
- Produces:
  - `selectedCombatFight(): CombatFight | null`
  - `renderCombatContributionWorkspace(fight, contributions)`
  - `renderCombatContributionChart(rows)`
  - `setCombatContributionScope(scope)`
  - `setCombatContributionMetric(metric)`
  - ECharts click events containing `data.slot`.

- [ ] **Step 1: Write the DOM contract test**

Create `tests/frontend/combat-contribution-ui.test.js`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
const chartRuntime = readFileSync(new URL("../../chart-runtime.js", import.meta.url), "utf8");

test("combat contribution workspace exposes scope metric chart and accessible roster contracts", () => {
  assert.match(html, /id="combat-contribution-scope"/);
  assert.match(html, /data-combat-contribution-scope="current"/);
  assert.match(html, /data-combat-contribution-scope="all"/);
  assert.match(html, /id="combat-contribution-metrics"/);
  assert.match(html, /id="combat-contribution-chart"/);
  assert.match(html, /id="combat-contribution-labels"/);
  assert.match(html, /id="combat-contribution-accessible"/);
});

test("combat contribution renderer binds chart clicks to player selection", () => {
  assert.match(app, /combatContributionChart\.on\("click"/);
  assert.match(app, /selectedCombatPlayerSlot = Number\(params\.data\.slot\)/);
  assert.match(app, /combatContributionScope: "current"/);
  assert.match(app, /combatContributionMetric: "responsibility"/);
});

test("chart runtime registers bar and radar charts", () => {
  assert.match(chartRuntime, /BarChart/);
  assert.match(chartRuntime, /RadarChart/);
  assert.match(chartRuntime, /RadarComponent/);
});
```

- [ ] **Step 2: Run the UI contract test and verify red**

Run:

```powershell
node --test tests/frontend/combat-contribution-ui.test.js
```

Expected: assertions fail because the new IDs and chart registrations do not exist.

- [ ] **Step 3: Replace the table markup**

Replace the current table head/table inside `.combat-contribution-panel` with:

```html
<header class="panel-header combat-contribution-header">
  <div>
    <span class="panel-kicker">按职责核对</span>
    <h2>十人贡献与责任审计</h2>
    <small id="combat-contribution-sample" class="combat-contribution-sample">当前团战</small>
  </div>
  <div id="combat-contribution-scope" class="segmented-control mini" aria-label="贡献统计范围">
    <button class="active" data-combat-contribution-scope="current" type="button">当前团战</button>
    <button data-combat-contribution-scope="all" type="button">全场累计</button>
  </div>
</header>
<div id="combat-contribution-metrics" class="combat-contribution-metrics" role="tablist" aria-label="贡献维度">
  <button class="active" data-combat-contribution-metric="responsibility" type="button">职责评分</button>
  <button data-combat-contribution-metric="damage" type="button">伤害</button>
  <button data-combat-contribution-metric="damage_taken" type="button">承伤</button>
  <button data-combat-contribution-metric="control" type="button">控制</button>
  <button data-combat-contribution-metric="healing" type="button">治疗</button>
  <button data-combat-contribution-metric="presence" type="button">在场</button>
  <button data-combat-contribution-metric="arrival" type="button">到场</button>
  <button data-combat-contribution-metric="vision" type="button">视野准备</button>
</div>
<div class="combat-contribution-chart-shell">
  <div id="combat-contribution-chart" class="combat-contribution-chart" aria-hidden="true"></div>
  <div id="combat-contribution-labels" class="combat-contribution-labels"></div>
</div>
<div id="combat-contribution-accessible" class="sr-only" aria-live="polite"></div>
```

- [ ] **Step 4: Register chart modules**

Update `chart-runtime.js` imports and `use`:

```js
import { BarChart, LineChart, RadarChart } from "echarts/charts";
import {
  DataZoomComponent,
  GridComponent,
  MarkAreaComponent,
  MarkLineComponent,
  RadarComponent,
  TooltipComponent,
} from "echarts/components";

use([
  LineChart,
  BarChart,
  RadarChart,
  GridComponent,
  RadarComponent,
  TooltipComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkAreaComponent,
  CanvasRenderer,
]);
```

- [ ] **Step 5: Add state and scope selection**

Add to `state`:

```js
combatContributionScope: "current",
combatContributionMetric: "responsibility",
combatContributionChart: null,
combatResponsibilityRadar: null,
selectedCombatContributionDimension: "responsibility",
combatContributionRenderToken: 0,
```

Import the Task 2 helpers from `app-core.js`.

Implement `combatContributionScopeFights` so `all` starts from `COMBAT_SEGMENTS`, applies only the explicit existing filter, and does not call the selected-player `related` filtering used by `renderCombat`.

Implement `selectedCombatFight` as the single lookup used by chart click and rerender paths:

```js
function selectedCombatFight() {
  return COMBAT_SEGMENTS.find((fight) => fight.id === state.selectedCombatId) || null;
}
```

- [ ] **Step 6: Implement the mirrored ECharts option**

Use two aligned grids:

```js
function combatContributionChartOption(model) {
  const max = Math.max(1, Number(model.maxValue) || 1);
  const commonYAxis = {
    type: "category",
    data: model.positions.map(String),
    inverse: true,
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { show: false },
  };
  return {
    animationDuration: 180,
    tooltip: {
      trigger: "item",
      confine: true,
      backgroundColor: "#24292d",
      borderColor: "#495158",
      textStyle: { color: "#f2f0e9", fontSize: 12 },
      formatter: combatContributionTooltip,
    },
    grid: [
      { left: 190, right: "52%", top: 16, bottom: 16, containLabel: false },
      { left: "52%", right: 190, top: 16, bottom: 16, containLabel: false },
    ],
    xAxis: [
      { type: "value", inverse: true, min: 0, max, show: false },
      { type: "value", min: 0, max, show: false, gridIndex: 1 },
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
        data: model.radiant.map(combatContributionSeriesDatum),
        itemStyle: { borderRadius: [3, 0, 0, 3] },
      },
      {
        name: "夜魇",
        type: "bar",
        xAxisIndex: 1,
        yAxisIndex: 1,
        barWidth: 18,
        data: model.dire.map(combatContributionSeriesDatum),
        itemStyle: { borderRadius: [0, 3, 3, 0] },
      },
    ],
  };
}
```

`combatContributionSeriesDatum` must place `slot`, `status`, `display`, and `secondary` directly on each data item. Use grey for absent/evidence states, amber for blocked, and team color only for passed factual data.

`combatContributionTooltip` reads those fields and returns player, hero, metric value, secondary value, and explicit evidence state. It must return “未进入主战场” for `not_participant` and must not show a numeric responsibility score when `available == false`.

- [ ] **Step 7: Render clickable external labels and accessible rows**

Render five left labels, five center position labels, and five right labels in `#combat-contribution-labels`. Every player label is a `<button data-combat-player-slot>`. Include:

- hero image with existing fallback;
- player and hero name;
- raw value;
- explicit status text;
- active selection state.

Render an equivalent textual ten-row summary in `#combat-contribution-accessible`.

- [ ] **Step 8: Bind scope, metric, label, and chart events**

Use event delegation for the scope and metric controls. On scope or metric change:

1. update state;
2. update active button classes;
3. rerender only contribution workspace and inspector;
4. preserve selected fight/map/time.

On chart click:

```js
state.combatContributionChart.on("click", (params) => {
  if (params.data?.slot == null) return;
  state.selectedCombatPlayerSlot = Number(params.data.slot);
  state.selectedCombatContributionDimension = state.combatContributionMetric;
  state.combatInspectorView = "audit";
  renderCombatContributionWorkspace(selectedCombatFight(), fightContributions(selectedCombatFight()));
  if (window.innerWidth < 1280) setCombatCompactView("audit");
});
```

Use `state.combatContributionRenderToken` to ignore a dynamic ECharts import that resolves after the selected fight changed.

- [ ] **Step 9: Run frontend tests and build**

Run:

```powershell
node --test tests/frontend/combat-contribution-ui.test.js
npm run test:frontend
npm run build
```

Expected: all commands exit `0`.

- [ ] **Step 10: Create a safe task checkpoint**

Inspect:

```powershell
git diff -- chart-runtime.js index.html app.js tests/frontend/combat-contribution-ui.test.js
git status --short
```

Do not stage `index.html` or `app.js` if their existing unrelated changes cannot be separated safely.

---

### Task 4: Add Single-Player Radar, Score Breakdown, And Event Drilldown

**Files:**
- Modify: `index.html:533`
- Modify: `app.js:4161`
- Modify: `styles.css:8680`
- Modify: `tests/frontend/combat-contribution.test.js`
- Modify: `tests/frontend/combat-contribution-ui.test.js`

**Interfaces:**
- Consumes: Task 2 `combatContributionDrilldown`.
- Produces:
  - `renderCombatResponsibilityRadar(model)`
  - `renderCombatScoreComponents(model)`
  - `renderCombatDimensionDetail(model)`
  - evidence buttons with `data-combat-evidence-time-ms` and `data-combat-evidence-seq`.

- [ ] **Step 1: Add failing drilldown model assertions**

Add to `combat-contribution.test.js`:

```js
test("drilldown keeps unavailable role axes distinct from zero performance", () => {
  const model = combatContributionDrilldown({
    row: {
      slot: 3,
      position: 5,
      displayStatus: "passed",
      responsibilityScore: 75,
      score_components: {
        healing: {
          points: 8,
          max_points: 16,
          raw_value: 1440,
          raw_unit: "health",
          judgment_suppressed: false,
        },
      },
      dimension_evidence: { healing: [{ game_time_ms: 100000, event_seq: 3, value: 400 }] },
    },
    opponent: null,
    metric: "healing",
    scope: "current",
  });

  assert.equal(model.roleAxes.find((axis) => axis.key === "healing").applicable, true);
  assert.equal(model.roleAxes.find((axis) => axis.key === "vision_setup").applicable, false);
  assert.equal(model.selectedDimension.evidence[0].event_seq, 3);
});

test("legacy contribution keeps raw metrics and marks score components unavailable", () => {
  const model = combatContributionDrilldown({
    row: {
      slot: 0,
      position: 1,
      displayStatus: "passed",
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
```

- [ ] **Step 2: Add failing UI contract assertions**

Add:

```js
assert.match(html, /id="combat-responsibility-radar"/);
assert.match(html, /id="combat-score-components"/);
assert.match(html, /id="combat-dimension-detail"/);
assert.match(app, /data-combat-evidence-time-ms/);
assert.match(app, /renderCombatResponsibilityRadar/);
```

- [ ] **Step 3: Run both focused tests and verify red**

Run:

```powershell
node --test tests/frontend/combat-contribution.test.js
node --test tests/frontend/combat-contribution-ui.test.js
```

Expected: missing model behavior and missing DOM IDs.

- [ ] **Step 4: Extend the audit pane**

Inside `#combat-audit-pane`, place:

```html
<div class="combat-audit-visuals">
  <div id="combat-responsibility-radar" class="combat-responsibility-radar"></div>
  <div id="combat-score-components" class="combat-score-components"></div>
</div>
<div id="combat-dimension-detail" class="combat-dimension-detail"></div>
```

Keep `#combat-player-audit` and `#damage-breakdown` below as raw-data compatibility sections.

- [ ] **Step 5: Render one-player role radar**

Use one ECharts radar series only:

```js
function combatResponsibilityRadarOption(model) {
  const axes = model.roleAxes.filter((axis) => axis.applicable);
  return {
    animationDuration: 180,
    tooltip: {
      trigger: "item",
      confine: true,
      backgroundColor: "#24292d",
      borderColor: "#495158",
      textStyle: { color: "#f2f0e9", fontSize: 12 },
    },
    radar: {
      triggerEvent: true,
      radius: "68%",
      splitNumber: 4,
      indicator: axes.map((axis) => ({ name: axis.label, max: 100, key: axis.key })),
      axisName: { color: "#aeb6bb", fontSize: 11 },
      splitLine: { lineStyle: { color: "#343a3f" } },
      splitArea: { areaStyle: { color: ["#15191b", "#181d20"] } },
      axisLine: { lineStyle: { color: "#343a3f" } },
    },
    series: [{
      type: "radar",
      data: [{
        value: axes.map((axis) => axis.value),
        areaStyle: { color: "rgba(94,159,214,.18)" },
        lineStyle: { color: "#5e9fd6", width: 2 },
        itemStyle: { color: "#5e9fd6" },
      }],
    }],
  };
}
```

When no score components exist, dispose or clear the radar and render the old-package message. Never synthesize axes from raw values.

- [ ] **Step 6: Render score components as clickable rows**

Each component row shows:

- Chinese component name;
- points and max points;
- raw value and unit;
- positive/negative/neutral tone;
- “门禁抑制” state;
- progress bar based on `abs(points) / max(1, maxPoints)`.

Use `<button data-combat-contribution-dimension="damage_share">` so every component can select a detail dimension.

- [ ] **Step 7: Render selected dimension evidence**

Display:

- current raw value;
- team share;
- same-position opponent value;
- score points and cap;
- gate label and confidence;
- up to 12 compact evidence events.

Evidence button:

```html
<button type="button"
  data-combat-evidence-time-ms="43067"
  data-combat-evidence-seq="9980">
  <time>00:43.067</time>
  <span>枷锁造成 320 伤害</span>
</button>
```

On click:

1. call `updatePlayheadMs`;
2. set inspector view to `events`;
3. locate `[data-event-seq]`;
4. call `scrollIntoView({ block: "center", behavior: "smooth" })`;
5. add a temporary `.evidence-highlight` class.

Update `combatEventRows` markup to include `data-event-seq` when available.

- [ ] **Step 8: Support full-match drilldown**

In `all` scope:

- radar uses weighted aggregated passed-gate components;
- score header shows `通过 X/Y 场`;
- evidence rows include fight title and time;
- clicking evidence first updates `selectedCombatId`, then renders the selected combat and jumps to its event;
- the scope remains `all` after the jump, but map and event stream show the referenced fight.

- [ ] **Step 9: Run focused and full frontend tests**

Run:

```powershell
node --test tests/frontend/combat-contribution.test.js
node --test tests/frontend/combat-contribution-ui.test.js
npm run test:frontend
npm run build
```

Expected: all commands exit `0`.

- [ ] **Step 10: Create a safe task checkpoint**

Inspect:

```powershell
git diff -- index.html app.js styles.css tests/frontend/combat-contribution.test.js tests/frontend/combat-contribution-ui.test.js
git status --short
```

Leave shared dirty files unstaged unless feature-only staging is demonstrably safe.

---

### Task 5: Make The Chart Readable And Responsive

**Files:**
- Modify: `styles.css:8618`
- Modify: `tests/frontend/combat-contribution-ui.test.js`

**Interfaces:**
- Consumes: Task 3 and Task 4 DOM classes.
- Produces: stable layouts at 1460x920, 1280x800, and 1024x720.

- [ ] **Step 1: Add source-level responsive contract assertions**

Add:

```js
const css = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

assert.match(css, /\.combat-contribution-chart-shell/);
assert.match(css, /\.combat-contribution-player-label\.not-participant/);
assert.match(css, /\.combat-contribution-player-label\.insufficient/);
assert.match(css, /\.combat-contribution-player-label\.blocked/);
assert.match(css, /@media \(max-width: 959px\)/);
assert.match(css, /\.combat-responsibility-radar/);
```

- [ ] **Step 2: Run the UI contract test and verify red**

Run:

```powershell
node --test tests/frontend/combat-contribution-ui.test.js
```

Expected: missing class assertions.

- [ ] **Step 3: Implement stable desktop dimensions**

Use:

```css
.combat-contribution-chart-shell {
  position: relative;
  min-height: 300px;
  height: clamp(300px, 34vh, 390px);
  overflow: hidden;
}

.combat-contribution-chart {
  position: absolute;
  inset: 0;
}

.combat-contribution-labels {
  position: absolute;
  inset: 16px 0;
  display: grid;
  grid-template-columns: 182px minmax(0, 1fr) 48px minmax(0, 1fr) 182px;
  grid-template-rows: repeat(5, minmax(48px, 1fr));
  pointer-events: none;
}

.combat-contribution-player-label {
  min-width: 0;
  pointer-events: auto;
}
```

Keep player names at 12px or larger and primary values at 13px or larger. Do not use viewport-based font scaling.

- [ ] **Step 4: Implement explicit data-state styles**

States must combine color, text, and pattern:

- `not-participant`: 45% opacity plus “未进入主战场”.
- `participant-no-events`: grey dotted border.
- `insufficient`: grey diagonal stripe.
- `blocked`: amber border and “客观条件阻断”.
- `passed`: team color bar.
- `role-uncertain`: question-circle icon and “位置待确认”.

Do not use red for absent, blocked, or insufficient states.

- [ ] **Step 5: Implement compact layout**

At `max-width: 959px`:

- hide the mirrored central axis;
- show two stacked team groups of five rows;
- keep each player row at least 48px high;
- keep the metric selector horizontally scrollable;
- keep the chart and audit pane as separate compact tabs;
- do not truncate the raw numeric value.

At `960px` to `1279px`, retain the mirror chart and switch the inspector through existing compact tabs.

- [ ] **Step 6: Add chart resize handling**

Reuse the page resize handler or add one bounded `ResizeObserver` for the combat contribution panel. Resize both ECharts instances only when connected and visible:

```js
state.combatContributionChart?.resize();
state.combatResponsibilityRadar?.resize();
```

Disconnect observers when the app unloads. Do not create a new observer on every render.

- [ ] **Step 7: Run frontend tests and build**

Run:

```powershell
node --test tests/frontend/combat-contribution-ui.test.js
npm run test:frontend
npm run build
```

Expected: all commands exit `0`.

---

### Task 6: Build Parser, Reanalyse A Real Replay, And Verify The Product

**Files:**
- Generated: `tools/replay-parser/target/stats-0.1.0.jar`
- Create: `.validation/combat-contribution-current-1460.png`
- Create: `.validation/combat-contribution-all-1460.png`
- Create: `.validation/combat-contribution-current-1024.png`

**Interfaces:**
- Consumes: completed Tasks 1 through 5.
- Produces: a fresh analysis package with `position-responsibility/1.1` and visual evidence that the UI works against real data.

- [ ] **Step 1: Run the complete automated suite**

Run:

```powershell
npm test
npm run build
$env:JAVA_HOME = "$PWD\tools\runtime\jdk-21"
$mvn = "$PWD\tools\runtime\apache-maven-3.9.12\bin\mvn.cmd"
& $mvn -q -f tools/replay-parser/pom.xml test
```

Expected: every command exits `0`.

- [ ] **Step 2: Build the Parser jar**

Run:

```powershell
$env:JAVA_HOME = "$PWD\tools\runtime\jdk-21"
$mvn = "$PWD\tools\runtime\apache-maven-3.9.12\bin\mvn.cmd"
& $mvn -q -f tools/replay-parser/pom.xml -DskipTests package
Get-Item tools/replay-parser/target/stats-0.1.0.jar | Select-Object Length,LastWriteTime
```

Expected: jar exists and its timestamp matches the current run.

- [ ] **Step 3: Restart the local Parser with the new jar**

Stop only the process that owns port `5600`, then use the repository's existing background-start script:

```powershell
$owner = Get-NetTCPConnection -LocalPort 5600 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 1 -ExpandProperty OwningProcess
if ($owner) { Stop-Process -Id $owner }
pwsh -NoProfile -File .\tools\Start-DotaLens.ps1
```

Expected within 30 seconds:

```powershell
Invoke-RestMethod http://127.0.0.1:5600/api/health
```

returns a ready status.

- [ ] **Step 4: Reanalyse match `8911632470`**

Start a forced local-cache parse and poll the returned job:

```powershell
$body = @{ account_id = 139766850; force = $true } | ConvertTo-Json
$job = Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:5600/api/matches/8911632470/parse" `
  -ContentType "application/json" `
  -Body $body
while ($job.status -notin @("completed", "failed", "canceled")) {
  Start-Sleep -Milliseconds 1200
  $job = Invoke-RestMethod "http://127.0.0.1:5600/api/jobs/$($job.id)"
}
if ($job.status -ne "completed") {
  throw "Replay parse ended with $($job.status): $($job.message)"
}
```

Then inspect:

```powershell
$combat = Invoke-RestMethod `
  "http://127.0.0.1:5600/api/matches/8911632470/analysis/modules/combat"
$row = $combat.fights |
  Where-Object { @($_.contributions).Count -eq 10 } |
  Select-Object -First 1 -ExpandProperty contributions |
  Select-Object -First 1
[pscustomobject]@{
  score_model = $row.score_model
  component_count = @($row.score_components.PSObject.Properties).Count
  damage_refs = @($row.dimension_evidence.damage).Count
  gate = $row.responsibility_gate.status
}
```

Expected:

- `score_model` is `position-responsibility/1.1`.
- `component_count` is greater than `0`.
- `damage_refs` is greater than `0` for a damage contributor.

- [ ] **Step 5: Verify current-fight scope at 1460x920**

Open the local app, load match `8911632470`, select a ten-player teamfight, and verify:

- current-fight scope is active by default;
- all ten players appear in five paired rows;
- same-position players align;
- changing all eight metrics preserves row positions;
- clicking either side updates the audit player;
- gate states match the raw API;
- score component sum matches the displayed total;
- an evidence click moves the playhead and highlights the event.

Capture `.validation/combat-contribution-current-1460.png`.

- [ ] **Step 6: Verify full-match scope at 1460x920**

Switch to full-match scope and verify:

- label shows actual filter and fight sample count;
- switching left-list selected player does not change aggregate population;
- `teamDamageShare` matches totals from the API;
- responsibility header shows passed count;
- evidence jump selects the referenced fight without resetting scope.

Capture `.validation/combat-contribution-all-1460.png`.

- [ ] **Step 7: Verify compact layout at 1024x720**

Verify:

- two team groups remain readable;
- no names or values overlap;
- metric tabs scroll horizontally;
- clicking a player switches to personal responsibility;
- radar, score components, and evidence rows fit without clipping.

Capture `.validation/combat-contribution-current-1024.png`.

- [ ] **Step 8: Run console, overflow, and canvas checks**

Record:

- browser console errors;
- failed requests;
- horizontal overflow for the combat detail root;
- nonblank pixel bounds for both ECharts canvases;
- selected player identity before and after chart clicks.

Expected:

- zero console errors;
- zero failed local requests;
- `scrollWidth <= clientWidth + 1`;
- both canvases have non-background pixels;
- selected slot matches the clicked chart datum.

- [ ] **Step 9: Perform final verification**

Run once more:

```powershell
npm test
npm run build
$env:JAVA_HOME = "$PWD\tools\runtime\jdk-21"
$mvn = "$PWD\tools\runtime\apache-maven-3.9.12\bin\mvn.cmd"
& $mvn -q -f tools/replay-parser/pom.xml test
git diff --check
git status --short
```

Expected: tests and build pass, `git diff --check` reports no whitespace errors, and unrelated workspace changes remain untouched.

---

## Plan Self-Review Checklist

- [x] Every approved scope decision is covered by Tasks 2 and 3.
- [x] All ten-player and absent-player behavior is tested before UI rendering.
- [x] Full-match aggregation bypasses the selected-player list restriction.
- [x] Percentage, weighted presence, median arrival, P75 arrival, and gate-only score rules have explicit tests.
- [x] Parser owns every score component and the frontend does not copy formulas.
- [x] Event references are compact and bounded to protect JSON size.
- [x] Old packages remain readable.
- [x] Both current and full scopes have real Replay validation.
- [x] Desktop and compact layouts have screenshots and overflow checks.
- [x] No second chart library or new runtime dependency is introduced.
- [x] No task instructs the implementer to stage unrelated dirty files.
