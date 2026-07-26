# Player Report Atomic Components and Replay Matrix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将玩家报告十个维度拆成可重算的原子指标，并建立 15 场全员协议体检与 15 名五位置 Golden 精查的固定 Replay 回归矩阵。

**Architecture:** Java 解析器负责产生带证据的原子指标，`PlayerReportScoringV4` 负责验证基础分并继续处理三路计分、去重与封顶。`app-core.js` 和 Node 验证器使用同一字段契约独立复算，PowerShell 7 运行器串行重解析 Replay、写检查点并调用 Golden 差异引擎。

**Tech Stack:** Java 21、Gson 2.8.9、JUnit 5.11.4、Node.js ESM、Node Test Runner、PowerShell 7、Electron/Vite。

## Global Constraints

- 完整玩家报告协议继续使用 `player-report/4.0`。
- 原子指标协议固定为 `player-report-base-components/1.0`。
- 维度基础分复算误差不得超过 `0.05`。
- 可用原子指标有效权重总和必须为 `100 ± 0.01`。
- 缺失或被职责门禁抑制的指标不得按 0 分处理。
- 新生成的当前协议报告中不得使用 `existing_dimension_model`。
- 旧分析包只读兼容可以保留聚合回退。
- 同一结果不得重复扣分，单根因综合扣分不得超过 6。
- Golden 差异只能人工批准，运行器不得静默覆盖 `expected`。
- Replay 默认串行解析，解析器最大堆保持 `-Xmx2g`。
- 所有 PowerShell 脚本要求 PowerShell 7 或更高版本。
- 不增加新的生产依赖。
- 保留工作区已有改动，不清理、不回退、不覆盖用户文件。
- 本阶段不执行 `git add`、`git commit`、`git push`、发版或 EXE 打包。

---

## File Structure

### 新建文件

| 文件 | 单一职责 |
|---|---|
| `tools/replay-parser/src/main/java/opendota/PlayerReportBaseComponents.java` | 原子指标类型、权重重算、JSON 序列化和协议校验 |
| `tools/replay-parser/src/test/java/opendota/PlayerReportBaseComponentsTest.java` | 原子指标通用公式单元测试 |
| `tools/replay-parser/src/test/java/opendota/PlayerReportAtomicTestFixture.java` | 为十维测试构造十名玩家、对线、发育、战斗和视野事实 |
| `tools/replay-parser/src/test/java/opendota/PlayerReportAnalysisAtomicComponentsTest.java` | 十维实际字段映射与五位置分支集成测试 |
| `tests/tools/player-report-fixtures.mjs` | Node 回归测试使用的确定性 V4 报告与 Golden fixture |
| `tests/tools/player-report-regression.test.js` | Golden 快照、漂移规则和矩阵汇总测试 |
| `tools/player-report-regression.mjs` | 纯 Node 验证、Golden 投影、差异和报告生成 |
| `tools/Invoke-PlayerReportRegression.ps1` | 解析器生命周期、Replay 串行导入、检查点与恢复 |
| `tests/player-report-regression/manifest.json` | 16 场候选、15 场正式矩阵、15 名 Golden 主体 |
| `tests/player-report-regression/expected/*.json` | 人工批准的 15 份 Golden 快照 |
| `tests/player-report-regression/README.md` | 样本用途、更新流程和失败解释 |

### 修改文件

| 文件 | 修改职责 |
|---|---|
| `tools/replay-parser/src/main/java/opendota/PlayerReportAnalysis.java` | 将十维聚合公式改为原子指标输入并输出协议字段 |
| `tools/replay-parser/src/main/java/opendota/PlayerReportScoringV4.java` | 保留和复核真实基础组件，仅对旧包使用兼容回退 |
| `tools/replay-parser/src/test/java/opendota/PlayerReportScoreFormulaV4Test.java` | 锁定 V4 原子组件保存、复算与兼容行为 |
| `app-core.js` | 前端纯函数复算原子指标和完整评分链 |
| `tests/frontend/app-core.test.js` | 原子组件前端复算、缺失和篡改测试 |
| `app.js` | 维度审计下钻展示原子事实、权重和贡献 |
| `styles.css` | 原子组件审计表的紧凑响应式布局 |
| `tools/Validate-PlayerReportV4.mjs` | 改为调用共享 Node 验证核心并保留单场 CLI |
| `tests/frontend/player-report-v4-validator.test.js` | 增加当前协议必须含真实原子指标的校验 |
| `package.json` | 增加工具测试和矩阵快速校验脚本 |
| `DOTA-LENS-0.5.0-PLAYER-REPORT-PRODUCTIZATION-PRD.md` | 回写实施状态、样本矩阵和验收证据 |

### 运行产物

以下内容写入 `tools/runtime/player-report-regression/`，不作为 Golden：

```text
latest/
reports/
checkpoints/
candidate-golden/
```

---

### Task 1: 建立原子指标计算内核

**Files:**
- Create: `tools/replay-parser/src/main/java/opendota/PlayerReportBaseComponents.java`
- Create: `tools/replay-parser/src/test/java/opendota/PlayerReportBaseComponentsTest.java`

**Interfaces:**
- Produces: `PlayerReportBaseComponents.MODEL`
- Produces: `ComponentInput`, `ComponentResult`, `Calculation`
- Produces: `calculate(List<ComponentInput>)`
- Produces: `available(...)`, `missing(...)`, `suppressed(...)`
- Produces: `toJson(Calculation)` and `fromJson(JsonArray)`

- [ ] **Step 1: 写权重重算失败测试**

```java
@Test
void renormalizesOnlyAvailableComponents() {
    var calculation = PlayerReportBaseComponents.calculate(List.of(
            PlayerReportBaseComponents.available(
                    "relative_gpm", "每分钟经济相对表现", 80, 60, 90,
                    new JsonObject(), new JsonObject(), List.of("player.slot.0.gpm")),
            PlayerReportBaseComponents.missing(
                    "relative_xpm", "每分钟经验相对表现", 40, 80,
                    "counterpart_xpm_missing", List.of())));

    assertTrue(calculation.available());
    assertEquals(80.0, calculation.score(), 0.05);
    assertEquals(100.0,
            calculation.components().get(0).effectiveLocalWeight(), 0.01);
    assertNull(calculation.components().get(1).weightedContribution());
}
```

- [ ] **Step 2: 写非法输入和全缺失失败测试**

```java
@Test
void rejectsDuplicateKeysAndNonFiniteScores() {
    var duplicate = List.of(
            PlayerReportBaseComponents.available(
                    "same", "A", 60, 50, 80,
                    new JsonObject(), new JsonObject(), List.of()),
            PlayerReportBaseComponents.available(
                    "same", "B", 70, 50, 80,
                    new JsonObject(), new JsonObject(), List.of()));

    assertThrows(IllegalArgumentException.class,
            () -> PlayerReportBaseComponents.calculate(duplicate));
}

@Test
void excludesDimensionWhenEveryComponentIsUnavailable() {
    var calculation = PlayerReportBaseComponents.calculate(List.of(
            PlayerReportBaseComponents.missing(
                    "relative_gpm", "每分钟经济相对表现", 100, 40,
                    "gpm_missing", List.of())));

    assertFalse(calculation.available());
    assertNull(calculation.score());
}
```

- [ ] **Step 3: 运行测试并确认失败**

Run:

```powershell
& '.\tools\runtime\apache-maven-3.9.12\bin\mvn.cmd' `
  -q -f '.\tools\replay-parser\pom.xml' `
  '-Dtest=PlayerReportBaseComponentsTest' test
```

Expected: FAIL because `PlayerReportBaseComponents` does not exist.

- [ ] **Step 4: 实现类型与工厂接口**

```java
package opendota;

import java.util.List;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

final class PlayerReportBaseComponents {
    static final String MODEL = "player-report-base-components/1.0";
    static final double SCORE_TOLERANCE = 0.05;
    static final double WEIGHT_TOLERANCE = 0.01;

    record ComponentInput(
            String key,
            String label,
            boolean available,
            Double normalizedScore,
            double localWeight,
            int confidence,
            JsonObject comparison,
            JsonObject rawMetrics,
            List<String> evidenceRefs,
            String missingReason,
            String suppressionReason) {
    }

    record ComponentResult(
            ComponentInput input,
            double effectiveLocalWeight,
            Double weightedContribution) {
    }

    record Calculation(
            boolean available,
            Double score,
            List<ComponentResult> components) {
    }

    static ComponentInput available(String key, String label, double score,
            double weight, int confidence, JsonObject comparison,
            JsonObject rawMetrics, List<String> evidenceRefs) {
        return new ComponentInput(key, label, true, score, weight, confidence,
                comparison, rawMetrics, List.copyOf(evidenceRefs), null, null);
    }

    static ComponentInput missing(String key, String label, double weight,
            int confidence, String reason, List<String> evidenceRefs) {
        return new ComponentInput(key, label, false, null, weight, confidence,
                new JsonObject(), new JsonObject(), List.copyOf(evidenceRefs),
                reason, null);
    }

    static ComponentInput suppressed(String key, String label, double weight,
            int confidence, String reason, List<String> evidenceRefs) {
        return new ComponentInput(key, label, false, null, weight, confidence,
                new JsonObject(), new JsonObject(), List.copyOf(evidenceRefs),
                null, reason);
    }
}
```

- [ ] **Step 5: 实现确定性权重重算**

```java
static Calculation calculate(List<ComponentInput> inputs) {
    validateInputs(inputs);
    double denominator = inputs.stream()
            .filter(ComponentInput::available)
            .mapToDouble(ComponentInput::localWeight)
            .sum();
    if (denominator <= 0) {
        return new Calculation(false, null, inputs.stream()
                .map(input -> new ComponentResult(input, 0, null))
                .toList());
    }
    List<ComponentResult> results = inputs.stream().map(input -> {
        if (!input.available()) return new ComponentResult(input, 0, null);
        double effectiveWeight = input.localWeight() * 100.0 / denominator;
        double contribution = clampScore(input.normalizedScore())
                * effectiveWeight / 100.0;
        return new ComponentResult(input, round4(effectiveWeight),
                round4(contribution));
    }).toList();
    double score = results.stream()
            .map(ComponentResult::weightedContribution)
            .filter(java.util.Objects::nonNull)
            .mapToDouble(Double::doubleValue)
            .sum();
    return new Calculation(true, round2(score), List.copyOf(results));
}
```

`validateInputs` 必须拒绝空 key、重复 key、非正权重、非有限分数和非有限权重；`normalizedScore` 在计算时限制到 0 至 100。

- [ ] **Step 6: 实现稳定 JSON 往返**

`toJson` 必须按输入顺序输出：

```json
{
  "key": "relative_gpm",
  "label": "每分钟经济相对表现",
  "available": true,
  "normalized_score": 80.0,
  "local_weight": 60.0,
  "effective_local_weight": 100.0,
  "weighted_contribution": 80.0,
  "confidence": 90,
  "comparison": {},
  "raw_metrics": {},
  "evidence_refs": ["player.slot.0.gpm"],
  "missing_reason": null,
  "suppression_reason": null
}
```

`fromJson` 必须重新计算有效权重和贡献，不信任存储值。

- [ ] **Step 7: 运行原子内核测试**

Run:

```powershell
& '.\tools\runtime\apache-maven-3.9.12\bin\mvn.cmd' `
  -q -f '.\tools\replay-parser\pom.xml' `
  '-Dtest=PlayerReportBaseComponentsTest' test
```

Expected: PASS.

- [ ] **Step 8: 检查点审阅**

Run:

```powershell
git diff --check -- `
  'tools/replay-parser/src/main/java/opendota/PlayerReportBaseComponents.java' `
  'tools/replay-parser/src/test/java/opendota/PlayerReportBaseComponentsTest.java'
```

Expected: no whitespace errors. Do not stage or commit.

---

### Task 2: 拆分对线、发育和资源决策

**Files:**
- Create: `tools/replay-parser/src/test/java/opendota/PlayerReportAtomicTestFixture.java`
- Create: `tools/replay-parser/src/test/java/opendota/PlayerReportAnalysisAtomicComponentsTest.java`
- Modify: `tools/replay-parser/src/main/java/opendota/PlayerReportAnalysis.java:38-113`
- Modify: `tools/replay-parser/src/main/java/opendota/PlayerReportAnalysis.java:192-294`
- Modify: `tools/replay-parser/src/main/java/opendota/PlayerReportAnalysis.java:1061-1101`

**Interfaces:**
- Consumes: `PlayerReportBaseComponents.ComponentInput`
- Produces: `DimensionScore.components()`
- Produces: report-level `base_component_model`
- Produces: dimension-level `base_components`
- Test helper: `PlayerReportAtomicTestFixture.completeModulesForPosition(int position)`
- Test helper: `PlayerReportAtomicTestFixture.player(JsonObject modules, int slot)`
- Test helper: `PlayerReportAtomicTestFixture.blockEveryFightDutyGate(JsonObject modules)`

- [ ] **Step 1: 建立确定性测试事实**

`completeModulesForPosition(position)` 固定主体为 slot 0、同位置对手为 slot 5，并为十人写入：

```java
facts.addProperty("position", assignedPosition);
facts.addProperty("role_confidence", 96);
facts.addProperty("confidence", 92);
facts.addProperty("lane_score", slot == 0 ? 24 : 0);
facts.addProperty("lane_confidence", 90);
facts.addProperty("gpm", 500 + slot * 10);
facts.addProperty("xpm", 550 + slot * 10);
facts.addProperty("networth", 15_000 + slot * 300);
facts.addProperty("hero_damage", 12_000 + slot * 500);
facts.addProperty("damage_taken", 10_000 + slot * 400);
facts.addProperty("tower_damage", 1_500 + slot * 100);
facts.addProperty("deaths", 2 + slot % 3);
facts.addProperty("dead_seconds", 80 + slot * 5);
facts.addProperty("actions_per_min", 120 + slot);
facts.addProperty("ability_casts", 80 + slot);
facts.addProperty("item_uses", 40 + slot);
facts.addProperty("teleport_uses", 5 + slot % 2);
facts.addProperty("aggregate_rune_pickups", 4 + slot % 3);
facts.addProperty("teamfight_participation", 0.68);
```

fixture 同时写入：

```text
lane_opportunity_summary: recommendation_enabled=true, secured=18, reviewable_misses=6
laning.reviews_by_slot.<slot>.support_route: score=20
farm.diagnostics_by_slot.<slot>: 1 个匹配窗口、1 个存在收益损失的窗口
farm.lane_jungle_cycles_by_slot.<slot>: 2 个确认循环
stack_value_summary: stacked_camps=2, created_gold_estimate=240
combat.fights: 1 场 reviewable teamfight，十人都有 contribution
responsibility_gate.status: passed
vision.wards: 主体至少 1 个含 detections、duration 和 score 的眼位
module_evidence: players/laning/farm/combat/vision/objectives/timeline confidence=90
```

测试辅助函数固定为：

```java
import static opendota.PlayerReportAtomicTestFixture.blockEveryFightDutyGate;
import static opendota.PlayerReportAtomicTestFixture.completeModulesForPosition;
import static opendota.PlayerReportAtomicTestFixture.player;

private static JsonObject report(JsonObject modules, int slot) {
    return PlayerReportAtomicTestFixture.player(modules, slot)
            .getAsJsonObject("report");
}

private static JsonObject dimension(JsonObject report, String key) {
    for (JsonElement element : report.getAsJsonArray("dimensions")) {
        JsonObject row = element.getAsJsonObject();
        if (key.equals(row.get("key").getAsString())) return row;
    }
    throw new AssertionError("Missing dimension " + key);
}

private static JsonObject component(JsonObject dimension, String key) {
    for (JsonElement element : dimension.getAsJsonArray("base_components")) {
        JsonObject row = element.getAsJsonObject();
        if (key.equals(row.get("key").getAsString())) return row;
    }
    throw new AssertionError("Missing component " + key);
}

private static void assertComponentKeys(JsonObject report, String dimensionKey,
        String... expectedKeys) {
    JsonArray rows = dimension(report, dimensionKey)
            .getAsJsonArray("base_components");
    List<String> actual = new ArrayList<>();
    for (JsonElement element : rows) {
        actual.add(element.getAsJsonObject().get("key").getAsString());
    }
    assertEquals(List.of(expectedKeys), actual);
}

private static void assertNoComponent(JsonObject report, String dimensionKey,
        String componentKey) {
    assertThrows(AssertionError.class,
            () -> component(dimension(report, dimensionKey), componentKey));
}

private static void assertDimensionRecomputes(JsonObject report,
        String dimensionKey) {
    JsonObject row = dimension(report, dimensionKey);
    var calculation = PlayerReportBaseComponents.fromJson(
            row.getAsJsonArray("base_components"));
    assertTrue(calculation.available());
    assertEquals(row.get("score").getAsDouble(),
            calculation.score(), 0.05);
}
```

- [ ] **Step 2: 写核心位三维失败测试**

```java
@Test
void emitsCoreLaneEconomyAndResourceAtomicComponents() {
    JsonObject modules = completeModulesForPosition(1);
    PlayerReportAnalysis.enrich(modules, null, 1800);

    JsonObject report = report(modules, 0);
    assertEquals(PlayerReportBaseComponents.MODEL,
            report.get("base_component_model").getAsString());
    assertComponentKeys(report, "lane_execution",
            "lane_model_score", "core_lane_opportunity_conversion");
    assertComponentKeys(report, "farm_efficiency",
            "relative_gpm", "relative_xpm", "relative_net_worth");
    assertComponentKeys(report, "resource_decision",
            "secured_lane_opportunity_ratio",
            "hard_gated_route_match",
            "confirmed_lane_jungle_cycles");
    assertDimensionRecomputes(report, "lane_execution");
    assertDimensionRecomputes(report, "farm_efficiency");
    assertDimensionRecomputes(report, "resource_decision");
}
```

- [ ] **Step 3: 写辅助位分支和缺失重算失败测试**

```java
@Test
void usesSupportComponentsWithoutCoreResourceClaims() {
    JsonObject modules = completeModulesForPosition(5);
    PlayerReportAnalysis.enrich(modules, null, 1800);

    JsonObject report = report(modules, 0);
    assertComponentKeys(report, "lane_execution",
            "lane_model_score", "support_route_outcome");
    assertComponentKeys(report, "resource_decision",
            "support_route_outcome", "stack_team_value");
    assertNoComponent(report, "resource_decision",
            "secured_lane_opportunity_ratio");
}

@Test
void missingXpmIsExcludedInsteadOfScoredAsZero() {
    JsonObject modules = completeModulesForPosition(1);
    player(modules, 0).remove("xpm");
    PlayerReportAnalysis.enrich(modules, null, 1800);

    JsonObject economy = dimension(report(modules, 0), "farm_efficiency");
    JsonObject xpm = component(economy, "relative_xpm");
    assertFalse(xpm.get("available").getAsBoolean());
    assertEquals("counterpart_or_subject_xpm_missing",
            xpm.get("missing_reason").getAsString());
    assertEquals(50.0, component(economy, "relative_gpm")
            .get("effective_local_weight").getAsDouble(), 0.01);
    assertEquals(50.0, component(economy, "relative_net_worth")
            .get("effective_local_weight").getAsDouble(), 0.01);
}
```

- [ ] **Step 4: 运行测试并确认失败**

Run:

```powershell
& '.\tools\runtime\apache-maven-3.9.12\bin\mvn.cmd' `
  -q -f '.\tools\replay-parser\pom.xml' `
  '-Dtest=PlayerReportAnalysisAtomicComponentsTest' test
```

Expected: FAIL because reports do not expose real base components.

- [ ] **Step 5: 扩展 `DimensionScore`**

```java
private record DimensionScore(
        double score,
        int confidence,
        boolean available,
        String evidenceLevel,
        List<String> missing,
        PlayerReportBaseComponents.Calculation baseCalculation) {
}
```

增加 `dimensionFromComponents(...)`：

```java
private static DimensionScore dimensionFromComponents(
        List<PlayerReportBaseComponents.ComponentInput> inputs,
        int confidence,
        String evidenceLevel,
        List<String> missing) {
    var calculation = PlayerReportBaseComponents.calculate(inputs);
    int normalizedConfidence = clamp(confidence, 0, 100);
    boolean available = calculation.available() && normalizedConfidence >= 55;
    return new DimensionScore(
            calculation.score() == null ? 50 : calculation.score(),
            normalizedConfidence,
            available,
            available ? evidenceLevel : "partial",
            List.copyOf(missing),
            calculation);
}
```

同时更新旧辅助方法，避免任何构造路径缺少 `baseCalculation`：

```java
private static DimensionScore missing(int confidence, List<String> missing) {
    List<String> reasons = missing.isEmpty()
            ? List.of("minimum_evidence_not_met")
            : List.copyOf(missing);
    return new DimensionScore(
            50,
            clamp(confidence, 0, 54),
            false,
            "missing",
            reasons,
            new PlayerReportBaseComponents.Calculation(false, null, List.of()));
}

private record BaseScores(Map<String, DimensionScore> values) {
    int score(String key) {
        DimensionScore dimension = values.get(key);
        return dimension == null || !dimension.available()
                ? 50
                : clamp((int) Math.round(dimension.score()), 0, 100);
    }
}
```

- [ ] **Step 6: 输出协议和组件**

在 report 创建后写入：

```java
report.addProperty("base_component_model", PlayerReportBaseComponents.MODEL);
```

十人模块在设置 `schema` 时同步写入：

```java
playerModule.addProperty("base_component_model",
        PlayerReportBaseComponents.MODEL);
```

每个维度写入：

```java
row.add("base_components",
        PlayerReportBaseComponents.toJson(result.score.baseCalculation()));
```

将 `weightedScore` 改为 `double`，排名改用 `Comparator.comparingDouble`；传给只接受整数的旧叙事逻辑时使用 `Math.round`，不提前截断维度基础分。

- [ ] **Step 7: 将三维公式改为原子输入**

对线、发育和资源决策必须使用设计稿中的稳定 key 与权重。比较对象示例：

```java
private static JsonObject comparison(double subject, double reference, String unit) {
    JsonObject result = new JsonObject();
    result.addProperty("subject", round2(subject));
    result.addProperty("reference", round2(reference));
    result.addProperty("unit", unit);
    return result;
}
```

`raw_metrics` 必须保留公式需要的数字，例如路线匹配组件：

```json
{
  "enabled_windows": 4,
  "matched_windows": 3,
  "missed_windows": 1,
  "estimated_loss": 240,
  "confirmed_cycles": 2
}
```

- [ ] **Step 8: 运行三维和旧叙事回归测试**

Run:

```powershell
& '.\tools\runtime\apache-maven-3.9.12\bin\mvn.cmd' `
  -q -f '.\tools\replay-parser\pom.xml' `
  '-Dtest=PlayerReportAnalysisAtomicComponentsTest,PlayerReportNarrativeV3Test' test
```

Expected: PASS.

- [ ] **Step 9: 检查点审阅**

确认：

```text
核心位 lane_execution: 75/25
辅助位 lane_execution: 65/35
farm_efficiency: 三项可用时 33.3333/33.3333/33.3334
核心位 resource_decision: 35/50/15
辅助位 resource_decision: 65/35
```

Do not stage or commit.

---

### Task 3: 拆分战斗输出、战斗职责和视野团队

**Files:**
- Modify: `tools/replay-parser/src/test/java/opendota/PlayerReportAnalysisAtomicComponentsTest.java`
- Modify: `tools/replay-parser/src/main/java/opendota/PlayerReportAnalysis.java:296-361`

**Interfaces:**
- Consumes: Task 1 component calculator
- Produces: six stable component keys across three dimensions

- [ ] **Step 1: 写战斗和视野失败测试**

```java
@Test
void emitsCombatDutyAndVisionComponentsWithRoleTargets() {
    JsonObject modules = completeModulesForPosition(4);
    PlayerReportAnalysis.enrich(modules, null, 1800);

    JsonObject report = report(modules, 0);
    assertComponentKeys(report, "combat_output",
            "team_damage_share_vs_role_target",
            "fight_damage_share_vs_role_target",
            "kill_conversion");
    assertComponentKeys(report, "combat_duty",
            "hard_gated_duty_average",
            "team_utility_share_vs_role_target");
    assertComponentKeys(report, "vision_team",
            "team_vision_share_vs_role_target",
            "own_ward_average_score");
    assertEquals(0.14, component(dimension(report, "combat_output"),
            "team_damage_share_vs_role_target")
            .getAsJsonObject("raw_metrics")
            .get("role_target_share").getAsDouble(), 0.0001);
}
```

- [ ] **Step 2: 写职责硬门禁失败测试**

```java
@Test
void excludesCombatDutyWhenNoFightPassesResponsibilityGate() {
    JsonObject modules = completeModulesForPosition(4);
    blockEveryFightDutyGate(modules);
    PlayerReportAnalysis.enrich(modules, null, 1800);

    JsonObject duty = dimension(report(modules, 0), "combat_duty");
    assertFalse(duty.get("available").getAsBoolean());
    assertEquals("no_passed_responsibility_gate_fights",
            component(duty, "hard_gated_duty_average")
                    .get("missing_reason").getAsString());
}
```

- [ ] **Step 3: 运行测试并确认失败**

Run:

```powershell
& '.\tools\runtime\apache-maven-3.9.12\bin\mvn.cmd' `
  -q -f '.\tools\replay-parser\pom.xml' `
  '-Dtest=PlayerReportAnalysisAtomicComponentsTest' test
```

Expected: FAIL on missing atomic keys.

- [ ] **Step 4: 实现三维原子映射**

固定权重：

```text
combat_output: 55/25/20
combat_duty: 75/25
vision_team: 65/35
```

职责组件只有 `passedDutyFights > 0` 才可用；眼位质量组件只有存在个人眼位生命周期事实时才可用。没有眼位不等于数据缺失：模块完整且玩家确实未插眼时，按照位置职责目标计算；模块缺失时才排除组件。

- [ ] **Step 5: 保留职责目标和证据**

每个相对占比组件在 `raw_metrics` 中保存：

```json
{
  "subject_value": 12840,
  "team_total": 67210,
  "subject_share": 0.1910,
  "role_target_share": 0.1400
}
```

每场战斗聚合组件的 `evidence_refs` 至少指向 `combat.fights` 和玩家 slot。

- [ ] **Step 6: 运行定向测试**

Run:

```powershell
& '.\tools\runtime\apache-maven-3.9.12\bin\mvn.cmd' `
  -q -f '.\tools\replay-parser\pom.xml' `
  '-Dtest=PlayerReportAnalysisAtomicComponentsTest,FightResponsibilityScoreTest' test
```

Expected: PASS.

- [ ] **Step 7: 检查点审阅**

确认低置信度职责维度仍可展示事实，但不进入综合分；确认辅助与核心使用各自角色目标。Do not stage or commit.

---

### Task 4: 拆分生存、目标、地图节奏和可观察操作

**Files:**
- Modify: `tools/replay-parser/src/test/java/opendota/PlayerReportAnalysisAtomicComponentsTest.java`
- Modify: `tools/replay-parser/src/main/java/opendota/PlayerReportAnalysis.java:363-461`

**Interfaces:**
- Consumes: Task 1 component calculator
- Produces: nine stable component keys across four dimensions

- [ ] **Step 1: 写四维失败测试**

```java
@Test
void emitsSurvivalObjectiveTempoAndExecutionComponents() {
    JsonObject modules = completeModulesForPosition(2);
    PlayerReportAnalysis.enrich(modules, null, 1800);
    JsonObject report = report(modules, 0);

    assertComponentKeys(report, "survival_risk",
            "deaths_vs_same_position", "dead_time_percentage_score");
    assertComponentKeys(report, "objective_conversion",
            "team_tower_damage_share_vs_role_target",
            "tower_roshan_finish_contribution");
    assertComponentKeys(report, "map_tempo",
            "team_tempo_share_vs_role_target",
            "tp_rune_activation_relative_score",
            "fight_presence_vs_role_target");
    assertComponentKeys(report, "observable_execution",
            "action_continuity_apm",
            "observable_uses_per_minute_vs_opponent");
}
```

- [ ] **Step 2: 写对手操作数据缺失失败测试**

```java
@Test
void doesNotTurnActionContinuityIntoPerfectScoreWhenOpponentUsesAreMissing() {
    JsonObject modules = completeModulesForPosition(2);
    JsonObject counterpart = player(modules, 5);
    counterpart.remove("ability_casts");
    counterpart.remove("item_uses");
    PlayerReportAnalysis.enrich(modules, null, 1800);

    JsonObject execution = dimension(report(modules, 0), "observable_execution");
    JsonObject continuity = component(execution, "action_continuity_apm");
    JsonObject relativeUses = component(execution,
            "observable_uses_per_minute_vs_opponent");
    assertFalse(relativeUses.get("available").getAsBoolean());
    assertEquals(100.0,
            continuity.get("effective_local_weight").getAsDouble(), 0.01);
    assertTrue(continuity.get("normalized_score").getAsDouble() < 100);
}
```

- [ ] **Step 3: 运行测试并确认失败**

Run:

```powershell
& '.\tools\runtime\apache-maven-3.9.12\bin\mvn.cmd' `
  -q -f '.\tools\replay-parser\pom.xml' `
  '-Dtest=PlayerReportAnalysisAtomicComponentsTest' test
```

Expected: FAIL on missing component keys.

- [ ] **Step 4: 实现四维原子映射**

固定权重：

```text
survival_risk: 65/35
objective_conversion: 75/25
map_tempo: 45/25/30
observable_execution: 60/40
```

TP 与神符可以先在一个激活组件内部取可用项平均，但 `raw_metrics` 必须分别保留 TP 和神符主体值、同位置参照值及各自子分。

- [ ] **Step 5: 运行定向测试**

Run:

```powershell
& '.\tools\runtime\apache-maven-3.9.12\bin\mvn.cmd' `
  -q -f '.\tools\replay-parser\pom.xml' `
  '-Dtest=PlayerReportAnalysisAtomicComponentsTest,PlayerReportNarrativeV3Test' test
```

Expected: PASS.

- [ ] **Step 6: 运行十维组件契约测试**

在测试中增加统一断言：

```java
for (JsonObject dimension : objects(report.getAsJsonArray("dimensions"))) {
    if (!dimension.get("available").getAsBoolean()) continue;
    assertTrue(dimension.getAsJsonArray("base_components").size() > 0);
    assertDimensionRecomputes(report, dimension.get("key").getAsString());
}
```

Run the same Maven command and expect PASS.

- [ ] **Step 7: 检查点审阅**

确认十维没有中文 label 作为程序 key，且每个比较类组件都包含主体、参照和单位。Do not stage or commit.

---

### Task 5: 让 V4 计分器保留并验证真实基础组件

**Files:**
- Modify: `tools/replay-parser/src/test/java/opendota/PlayerReportScoreFormulaV4Test.java`
- Modify: `tools/replay-parser/src/main/java/opendota/PlayerReportScoringV4.java:15-122`
- Modify: `tools/replay-parser/src/main/java/opendota/PlayerReportScoringV4.java:183-214`

**Interfaces:**
- Consumes: dimension `base_components`
- Produces: dimension `recomputation.base_component_valid`
- Produces: score-card audit `base_component_model`
- Preserves: legacy aggregate fallback when model is absent
- Test helper: `component(String key, double score, double weight)`
- Test helper: `components(JsonObject... rows)`

测试类中增加：

```java
private static JsonObject component(String key, double score, double weight) {
    JsonObject row = new JsonObject();
    row.addProperty("key", key);
    row.addProperty("label", key);
    row.addProperty("available", true);
    row.addProperty("normalized_score", score);
    row.addProperty("local_weight", weight);
    row.addProperty("effective_local_weight", weight);
    row.addProperty("weighted_contribution", score * weight / 100.0);
    row.addProperty("confidence", 90);
    row.add("comparison", new JsonObject());
    row.add("raw_metrics", new JsonObject());
    row.add("evidence_refs", new JsonArray());
    return row;
}

private static JsonArray components(JsonObject... rows) {
    JsonArray result = new JsonArray();
    for (JsonObject row : rows) result.add(row);
    return result;
}
```

- [ ] **Step 1: 写真实组件保留失败测试**

```java
@Test
void preservesAtomicBaseComponentsAndRecomputesBaseScore() {
    JsonObject lane = dimension("lane_execution", "lane", 100, 70, true);
    lane.add("base_components", components(
            component("lane_model_score", 80, 75),
            component("core_lane_opportunity_conversion", 40, 25)));
    JsonObject report = report(lane);
    report.addProperty("base_component_model",
            PlayerReportBaseComponents.MODEL);

    PlayerReportScoringV4.apply(report);

    JsonObject scored = findDimension(report, "lane_execution");
    assertEquals(2, scored.getAsJsonArray("base_components").size());
    assertEquals(70.0, scored.get("base_score").getAsDouble(), EPSILON);
    assertTrue(scored.getAsJsonObject("recomputation")
            .get("base_component_valid").getAsBoolean());
}
```

- [ ] **Step 2: 写篡改和兼容失败测试**

```java
@Test
void marksCurrentAtomicModelInvalidWhenStoredBaseDoesNotRecompute() {
    JsonObject lane = dimension("lane_execution", "lane", 100, 99, true);
    lane.add("base_components", components(
            component("lane_model_score", 80, 75),
            component("core_lane_opportunity_conversion", 40, 25)));
    JsonObject report = report(lane);
    report.addProperty("base_component_model",
            PlayerReportBaseComponents.MODEL);

    PlayerReportScoringV4.apply(report);

    assertFalse(report.getAsJsonObject("score_card")
            .getAsJsonObject("audit")
            .get("recomputation_valid").getAsBoolean());
}

@Test
void retainsAggregateFallbackOnlyForLegacyInput() {
    JsonObject report = report(
            dimension("lane_execution", "lane", 100, 70, true));
    PlayerReportScoringV4.apply(report);

    assertEquals("existing_dimension_model",
            findDimension(report, "lane_execution")
                    .getAsJsonArray("base_components")
                    .get(0).getAsJsonObject().get("key").getAsString());
}
```

- [ ] **Step 3: 运行测试并确认失败**

Run:

```powershell
& '.\tools\runtime\apache-maven-3.9.12\bin\mvn.cmd' `
  -q -f '.\tools\replay-parser\pom.xml' `
  '-Dtest=PlayerReportScoreFormulaV4Test' test
```

Expected: FAIL because `prepareDimension` replaces `base_components`.

- [ ] **Step 4: 修改 `prepareDimension`**

行为顺序固定为：

```text
1. 读取输入 base_components。
2. 当前原子模型存在时，用 fromJson 复算。
3. 比较复算基础分与输入基础分，误差上限 0.05。
4. 保留规范化后的真实组件。
5. 只有未声明原子模型的旧输入才生成 existing_dimension_model。
6. 再进入三路计分、去重和封顶。
```

不得先执行：

```java
row.add("base_components", new JsonArray());
```

- [ ] **Step 5: 扩展服务端审计**

维度 `recomputation` 增加：

```json
{
  "base_component_model": "player-report-base-components/1.0",
  "base_component_valid": true,
  "base_component_recomputed_score": 70.0,
  "base_component_weight_sum": 100.0
}
```

综合审计增加：

```json
{
  "atomic_dimension_count": 10,
  "aggregate_fallback_count": 0
}
```

- [ ] **Step 6: 运行 V4 和分析集成测试**

Run:

```powershell
& '.\tools\runtime\apache-maven-3.9.12\bin\mvn.cmd' `
  -q -f '.\tools\replay-parser\pom.xml' `
  '-Dtest=PlayerReportScoreFormulaV4Test,PlayerReportAnalysisAtomicComponentsTest' test
```

Expected: PASS.

- [ ] **Step 7: 运行完整解析器测试**

Run:

```powershell
& '.\tools\runtime\apache-maven-3.9.12\bin\mvn.cmd' `
  -q -f '.\tools\replay-parser\pom.xml' test
```

Expected: all non-optional tests pass; optional Replay E2E may remain skipped only when its fixture gate is not enabled.

- [ ] **Step 8: 检查点审阅**

确认现有三路计分、重复结果抑制和单根因 6 分封顶测试未改变预期。Do not stage or commit.

---

### Task 6: 扩展前端纯函数复算

**Files:**
- Modify: `tests/frontend/app-core.test.js`
- Modify: `app-core.js:1178-1331`

**Interfaces:**
- Produces: `recomputePlayerReportBaseComponents(components)`
- Extends: `recomputePlayerReportScoreAudit(report).rows[].baseComponentAudit`

- [ ] **Step 1: 增加确定性前端 fixture**

将新函数加入 `app-core.js` 的测试 import，并在测试文件中增加：

```javascript
function atomicReportFixture() {
  const baseComponents = [
    {
      key: "lane_model_score",
      label: "对线模型结果",
      available: true,
      normalized_score: 80,
      local_weight: 75,
      effective_local_weight: 75,
      weighted_contribution: 60,
      confidence: 90,
      comparison: {},
      raw_metrics: {},
      evidence_refs: ["laning.slot.0"],
    },
    {
      key: "core_lane_opportunity_conversion",
      label: "核心对线资源转化",
      available: true,
      normalized_score: 40,
      local_weight: 25,
      effective_local_weight: 25,
      weighted_contribution: 10,
      confidence: 90,
      comparison: {},
      raw_metrics: {},
      evidence_refs: ["players.slot.0.lane_opportunity_summary"],
    },
  ];
  const dimension = {
    key: "lane_execution",
    available: true,
    weight: 100,
    effective_weight: 100,
    base_score: 70,
    behavior_modifier: 0,
    final_score: 70,
    score: 70,
    base_components: baseComponents,
    scoring_components: [],
  };
  return {
    model: "player-report/4.0",
    base_component_model: "player-report-base-components/1.0",
    root_causes: [],
    score_card: {
      model: "player-report/4.0",
      base_score: 70,
      behavior_modifier: 0,
      final_score: 70,
      dimensions: [dimension],
      audit: { recomputation_tolerance: 0.05 },
    },
  };
}
```

- [ ] **Step 2: 写正常复算失败测试**

```javascript
test("recomputePlayerReportBaseComponents renormalizes available weights", () => {
  const audit = recomputePlayerReportBaseComponents([
    {
      key: "relative_gpm",
      available: true,
      normalized_score: 80,
      local_weight: 60,
      effective_local_weight: 100,
      weighted_contribution: 80,
    },
    {
      key: "relative_xpm",
      available: false,
      normalized_score: null,
      local_weight: 40,
      effective_local_weight: 0,
      weighted_contribution: null,
      missing_reason: "counterpart_or_subject_xpm_missing",
    },
  ]);

  assert.equal(audit.valid, true);
  assert.equal(audit.recomputedScore, 80);
  assert.equal(audit.rows[0].recomputedEffectiveWeight, 100);
});
```

- [ ] **Step 3: 写篡改、重复 key 和聚合回退测试**

```javascript
test("player report audit rejects tampered atomic contributions", () => {
  const report = atomicReportFixture();
  report.score_card.dimensions[0].base_components[0].weighted_contribution = 99;

  const audit = recomputePlayerReportScoreAudit(report);

  assert.equal(audit.valid, false);
  assert.ok(audit.rows[0].issues.includes("base_component_contribution_mismatch"));
});

test("current atomic reports reject existing_dimension_model", () => {
  const report = atomicReportFixture();
  report.score_card.dimensions[0].base_components[0].key =
    "existing_dimension_model";

  const audit = recomputePlayerReportScoreAudit(report);

  assert.ok(audit.issues.includes("aggregate_component_in_current_report"));
});
```

- [ ] **Step 4: 运行测试并确认失败**

Run:

```powershell
node --test '.\tests\frontend\app-core.test.js'
```

Expected: FAIL because the base component function is not exported.

- [ ] **Step 5: 实现纯函数**

函数返回：

```javascript
{
  supported: true,
  rows: [{
    key,
    available,
    storedEffectiveWeight,
    recomputedEffectiveWeight,
    storedContribution,
    recomputedContribution,
    issues,
    valid,
  }],
  storedScore,
  recomputedScore,
  weightSum,
  issues,
  valid,
}
```

计算规则与 Java 完全一致，使用现有 `finiteNumberOrNull`，容差为 `0.05`，权重和容差为 `0.01`。

- [ ] **Step 6: 接入完整评分审计**

每个维度先复算基础组件，再复算行为修正：

```javascript
const baseComponentAudit = recomputePlayerReportBaseComponents(
  Array.isArray(dimension?.base_components) ? dimension.base_components : [],
);
if (atomicModel && !baseComponentAudit.valid) {
  issues.push(...baseComponentAudit.issues);
}
```

当前原子模型报告必须检查 `existing_dimension_model`；旧包仍可显示但 `supported` 只表示旧 V4 总分链可复算，不伪装成原子协议完整。

- [ ] **Step 7: 运行前端纯函数测试**

Run:

```powershell
node --test '.\tests\frontend\app-core.test.js'
```

Expected: PASS.

- [ ] **Step 8: 检查点审阅**

逐项比较 Java 和 JavaScript 字段名、舍入位数、缺失规则及错误 key。Do not stage or commit.

---

### Task 7: 更新玩家评分审计下钻

**Files:**
- Modify: `tests/frontend/app-core.test.js`
- Modify: `app.js:4904-4956`
- Modify: `app.js:6515-6625`
- Modify: `styles.css:6233-6310`

**Interfaces:**
- Consumes: `scoreAudit.rows[].baseComponentAudit`
- Produces: clickable dimension audit rows and readable component details

- [ ] **Step 1: 写页面契约失败测试**

```javascript
test("player score evidence renders atomic component audit fields", () => {
  assert.match(appSource, /effective_local_weight/);
  assert.match(appSource, /weighted_contribution/);
  assert.match(appSource, /missing_reason/);
  assert.match(appSource, /suppression_reason/);
  assert.match(appSource, /基础分重算/);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```powershell
node --test '.\tests\frontend\app-core.test.js'
```

Expected: FAIL because the current component row only shows local weight and score.

- [ ] **Step 3: 扩展组件展示**

每个组件行展示：

```text
名称
主体值 / 参照值
原子分
有效权重
对维度贡献
可信度
缺失或职责门禁原因
```

组件可用时示例：

```html
<div class="player-score-base-component valid">
  <span class="identity">
    <strong>每分钟经济相对表现</strong>
    <small>612 GPM / 同位置 570 GPM</small>
  </span>
  <span><small>原子分</small><b>74.25</b></span>
  <span><small>有效权重</small><b>33.33%</b></span>
  <span><small>贡献</small><b>24.75</b></span>
</div>
```

不可用时显示“未计分”和原因，不显示红色 0 分。

- [ ] **Step 4: 增加维度基础分重算状态**

维度抽屉增加：

```text
基础分重算 74.25
服务端基础分 74.25
允许误差 ±0.05
状态 一致
```

存在差异时使用错误色并列出结构化错误的中文映射。

- [ ] **Step 5: 完成响应式样式**

桌面使用：

```css
.player-score-base-component {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) repeat(3, minmax(72px, 92px));
  align-items: center;
  gap: 8px;
}
```

窄屏改为两行，名称占满首行；文字允许换行，不截断缺失原因。不得新增卡片嵌套。

- [ ] **Step 6: 运行前端测试与构建**

Run:

```powershell
npm run test:frontend
npm run build
```

Expected: all frontend tests pass; build succeeds. Existing bundle-size warning may记录但不得新增 build error.

- [ ] **Step 7: 浏览器人工检查**

使用 `8894766243` 打开玩家评分页，检查：

```text
综合分审计可打开
十个维度可以逐项下钻
原子分、有效权重和贡献不溢出
缺失项显示原因而非 0 分
1024×720 与 1460×920 均可阅读
```

- [ ] **Step 8: 检查点审阅**

确认这一步只扩展审计信息，没有改变普通模式的主要报告结构。Do not stage or commit.

---

### Task 8: 提取单场 V4 验证核心

**Files:**
- Create: `tools/player-report-regression.mjs`
- Create: `tests/tools/player-report-fixtures.mjs`
- Modify: `tools/Validate-PlayerReportV4.mjs`
- Create: `tests/tools/player-report-regression.test.js`
- Modify: `tests/frontend/player-report-v4-validator.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `validatePlayerReportBundle(players, options)`
- Produces: `projectGoldenReport({ matchId, slot, report })`
- Produces: `compareGolden(expected, actual, policy)`
- Produces: CLI subcommand `validate-analysis`
- Test fixture: `atomicReportFixture(options)`
- Test fixture: `bundleFixture({ slots, atomic })`
- Test fixture: `goldenFixture({ finalScore })`

- [ ] **Step 1: 增加工具测试入口**

修改 scripts：

```json
{
  "test": "npm run test:frontend && npm run test:tools && npm run test:desktop",
  "test:tools": "node --test \"tests/tools/*.test.js\"",
  "player-report:validate": "node tools/player-report-regression.mjs validate-analysis"
}
```

- [ ] **Step 2: 增加 Node fixture**

`atomicReportFixture` 使用十个 70 分维度，确保完整协议校验不会被测试数据自身误伤：

```javascript
const DIMENSION_COMPONENTS = [
  ["lane_execution", "lane_model_score"],
  ["farm_efficiency", "relative_gpm"],
  ["resource_decision", "secured_lane_opportunity_ratio"],
  ["map_tempo", "team_tempo_share_vs_role_target"],
  ["combat_output", "team_damage_share_vs_role_target"],
  ["combat_duty", "hard_gated_duty_average"],
  ["survival_risk", "deaths_vs_same_position"],
  ["objective_conversion", "team_tower_damage_share_vs_role_target"],
  ["vision_team", "team_vision_share_vs_role_target"],
  ["observable_execution", "action_continuity_apm"],
];

const atomicDimensions = DIMENSION_COMPONENTS.map(([dimensionKey, componentKey]) => ({
  key: dimensionKey,
  available: true,
  weight: 10,
  effective_weight: 10,
  base_score: 70,
  behavior_modifier: 0,
  final_score: 70,
  score: 70,
  scoring_components: [],
  base_components: [{
    key: componentKey,
    label: componentKey,
    available: true,
    normalized_score: 70,
    local_weight: 100,
    effective_local_weight: 100,
    weighted_contribution: 70,
    confidence: 90,
    comparison: {},
    raw_metrics: {},
    evidence_refs: [`fixture.${dimensionKey}`],
  }],
}));

const ATOMIC_REPORT_TEMPLATE = {
  model: "player-report/4.0",
  base_component_model: "player-report-base-components/1.0",
  root_causes: [],
  score_card: {
    model: "player-report/4.0",
    base_score: 70,
    behavior_modifier: 0,
    final_score: 70,
    overall_score: 70,
    audit: { recomputation_tolerance: 0.05 },
    dimensions: atomicDimensions,
  },
};

export function atomicReportFixture({
  slot = 0,
  position = (slot % 5) + 1,
} = {}) {
  const report = structuredClone(ATOMIC_REPORT_TEMPLATE);
  report.slot = slot;
  report.position = position;
  report.role_code = `position_${position}`;
  report.role_confidence = 96;
  report.dimension_coverage = 10;
  report.semantic = {
    strength_ids: ["strength:lane_execution"],
    main_issue_id: "issue:combat_timing",
    training_target_id: "training:arrive-first-window",
  };
  report.root_causes = [{
    id: "root:combat_timing",
    scoring_impacts: [],
    scoring_summary: { applied_negative_overall: 0 },
  }];
  return report;
}

export function bundleFixture({ slots = 10, atomic = true } = {}) {
  const bySlot = {};
  for (let slot = 0; slot < slots; slot += 1) {
    const report = atomicReportFixture({ slot });
    if (!atomic) delete report.base_component_model;
    bySlot[String(slot)] = { report };
  }
  return {
    schema: "player-report/4.0",
    base_component_model: atomic
      ? "player-report-base-components/1.0"
      : undefined,
    by_slot: bySlot,
  };
}

export function goldenFixture({ finalScore = 70 } = {}) {
  return {
    schema: "player-report-golden/1.0",
    match_id: "fixture",
    slot: 0,
    position: 1,
    role_confidence: 96,
    dimension_coverage: 1,
    score_card: {
      base_score: 70,
      behavior_modifier: finalScore - 70,
      final_score: finalScore,
    },
    dimensions: [],
    semantic: {
      strength_ids: ["strength:lane_execution"],
      main_issue_id: "issue:combat_timing",
      training_target_id: "training:arrive-first-window",
      root_cause_ids: ["root:combat_timing"],
    },
    jump_targets: [],
  };
}
```

`ATOMIC_REPORT_TEMPLATE` 必须与 Task 6 fixture 的字段值一致，测试通过 JSON 深拷贝避免跨用例污染。

- [ ] **Step 3: 写 10 人协议失败测试**

```javascript
test("validatePlayerReportBundle checks all ten slots", () => {
  const players = bundleFixture({ slots: 10, atomic: true });
  const result = validatePlayerReportBundle(players, {
    requireAtomic: true,
  });

  assert.equal(result.playerReports, 10);
  assert.equal(result.validReports, 10);
  assert.deepEqual(result.errors, []);
});

test("current bundle rejects aggregate fallback", () => {
  const players = bundleFixture({ slots: 10, atomic: true });
  players.by_slot["3"].report.score_card.dimensions[0]
    .base_components[0].key = "existing_dimension_model";

  const result = validatePlayerReportBundle(players, {
    requireAtomic: true,
  });

  assert.ok(result.errors.some((error) =>
    error.includes("slot 3") &&
    error.includes("aggregate_component_in_current_report")));
});
```

- [ ] **Step 4: 写 Golden 投影和漂移失败测试**

```javascript
test("golden projection excludes unstable prose", () => {
  const projected = projectGoldenReport({
    matchId: "8894766243",
    slot: 0,
    report: atomicReportFixture(),
  });

  assert.equal(projected.schema, "player-report-golden/1.0");
  assert.equal("summary_text" in projected, false);
  assert.ok(projected.semantic.main_issue_id);
});

test("score drift over policy threshold needs approval", () => {
  const expected = goldenFixture({ finalScore: 70 });
  const actual = goldenFixture({ finalScore: 74 });
  const diff = compareGolden(expected, actual, {
    scoreTolerance: 3,
    componentTolerance: 5,
  });

  assert.equal(diff.valid, false);
  assert.ok(diff.approvalRequired.some((item) =>
    item.path === "score_card.final_score"));
});
```

- [ ] **Step 5: 运行工具测试并确认失败**

Run:

```powershell
npm run test:tools
```

Expected: FAIL because the module and script do not exist.

- [ ] **Step 6: 实现协议验证器**

`validatePlayerReportBundle` 必须输出：

```javascript
{
  schema: "player-report-regression-validation/1.0",
  playerReports: 10,
  validReports: 10,
  positionCounts: { "1": 2, "2": 2, "3": 2, "4": 2, "5": 2 },
  aggregateFallbackCount: 0,
  duplicateAppliedKeyCount: 0,
  maxRootNegativeOverall: 1.29,
  reports: [],
  errors: [],
}
```

从 `tools/Validate-PlayerReportV4.mjs` 搬入现有维度顺序、三路计分、去重和根因封顶校验，再增加原子组件校验。单场 CLI 保留原来的调用方式：

```powershell
node '.\tools\Validate-PlayerReportV4.mjs' 8894766243
```

- [ ] **Step 7: 实现 Golden 投影**

Golden 只保存稳定字段：

```json
{
  "schema": "player-report-golden/1.0",
  "match_id": "8894766243",
  "slot": 0,
  "position": 1,
  "role_confidence": 96,
  "dimension_coverage": 10,
  "score_card": {
    "base_score": 71.2,
    "behavior_modifier": -2.1,
    "final_score": 69.1
  },
  "dimensions": [],
  "semantic": {
    "strength_ids": [],
    "main_issue_id": "",
    "training_target_id": "",
    "root_cause_ids": []
  },
  "jump_targets": []
}
```

不得保存完整自然语言段落。

- [ ] **Step 8: 实现漂移规则**

硬失败：

```text
协议或 key 改变
公式误差 > 0.05
有效权重和误差 > 0.01
职责模板串位
跳转目标丢失
重复结果扣分
单根因综合扣分 > 6
当前报告出现 existing_dimension_model
```

人工批准：

```text
综合分或维度最终分漂移 > 3
原子指标分漂移 > 5
主语义 ID 改变
可用维度数量改变
位置置信度跨过 75
```

- [ ] **Step 9: 运行工具和单场验证测试**

Run:

```powershell
npm run test:tools
node --test '.\tests\frontend\player-report-v4-validator.test.js'
node '.\tools\Validate-PlayerReportV4.mjs' 8894766243
```

Expected: tests pass. The existing analysis may report `aggregate_component_in_current_report` until Task 10 reparses it; that CLI failure is expected at this checkpoint and must be recorded, not suppressed.

- [ ] **Step 10: 检查点审阅**

确认现有单场验证输出字段仍保留，避免破坏既有诊断流程。Do not stage or commit.

---

### Task 9: 建立可恢复的 Replay 矩阵运行器

**Files:**
- Create: `tools/Invoke-PlayerReportRegression.ps1`
- Create: `tests/player-report-regression/manifest.json`
- Create: `tests/player-report-regression/README.md`
- Modify: `tests/tools/player-report-regression.test.js`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: parser API at `http://127.0.0.1:5600/api`
- Consumes: `manifest.json`
- Produces: per-match checkpoint and aggregate JSON/Markdown report
- Supports: `ValidateExisting`, `ReparseChanged`, `ReparseAll`

- [ ] **Step 1: 写 manifest 契约失败测试**

```javascript
function readManifestFixture() {
  const ids = [
    "8893373471", "8893461215", "8894766243", "8902638530",
    "8902709946", "8903960010", "8904119291", "8904187926",
    "8904265149", "8904318329", "8904432250", "8908349474",
    "8908420184", "8909845275", "8911632470", "8912957512",
  ];
  return {
    schema: "player-report-regression-manifest/1.0",
    matches: ids.map((matchId, index) => ({
      match_id: matchId,
      matrix_enabled: index < 15,
      reserve: index === 15,
      golden_subject: index < 15
        ? {
            player_slot: index % 10,
            expected_position: (index % 5) + 1,
            scenario_tags: ["contract-fixture"],
          }
        : null,
    })),
  };
}

test("candidate manifest contains sixteen unique replay IDs", () => {
  const manifest = readManifestFixture();
  assert.equal(manifest.schema, "player-report-regression-manifest/1.0");
  assert.equal(new Set(manifest.matches.map((row) => row.match_id)).size, 16);
  assert.equal(manifest.matches.filter((row) => row.matrix_enabled).length, 15);
  assert.equal(manifest.matches.filter((row) => row.reserve).length, 1);
});

test("golden subjects contain exactly three samples per position", () => {
  const manifest = readManifestFixture();
  const counts = manifest.matches
    .filter((row) => row.golden_subject)
    .reduce((result, row) => {
      const key = String(row.golden_subject.expected_position);
      result[key] = (result[key] || 0) + 1;
      return result;
    }, {});
  assert.deepEqual(counts, { "1": 3, "2": 3, "3": 3, "4": 3, "5": 3 });
});
```

该测试先使用测试内存 fixture；真实 manifest 在 Task 10 冻结后切换为读取真实文件。

- [ ] **Step 2: 实现 PowerShell 参数契约**

```powershell
[CmdletBinding()]
param(
    [ValidateSet('ValidateExisting', 'ReparseChanged', 'ReparseAll')]
    [string]$Mode = 'ValidateExisting',
    [string]$ManifestPath = (
        Join-Path (Split-Path -Parent $PSScriptRoot) `
            'tests\player-report-regression\manifest.json'
    ),
    [int]$TimeoutSeconds = 1200,
    [switch]$KeepParser,
    [switch]$IncludeCandidates
)

if ($PSVersionTable.PSVersion.Major -lt 7) {
    throw 'This script requires PowerShell 7 or newer.'
}
```

- [ ] **Step 3: 实现 Replay 解析决策**

`ReparseChanged` 只有以下任一值变化时重解析：

```text
Replay SHA-256
parser status.version
base_component_model
分析包不存在
上次检查点未完成
```

`ReparseAll` 强制串行重解析；`ValidateExisting` 不上传 Replay。

- [ ] **Step 4: 实现检查点与恢复**

每场完成后原子写入：

```json
{
  "schema": "player-report-regression-checkpoint/1.0",
  "match_id": "8894766243",
  "replay_sha256": "...",
  "parser_version": "1.6.0",
  "base_component_model": "player-report-base-components/1.0",
  "status": "validated",
  "completed_at": "2026-07-26T00:00:00Z"
}
```

先写同目录临时文件，再使用 `Move-Item -LiteralPath` 替换正式检查点；不得删除其他运行产物。

- [ ] **Step 5: 实现失败聚合**

单场失败时捕获错误并继续下一场，最终输出：

```json
{
  "schema": "player-report-regression-run/1.0",
  "mode": "ValidateExisting",
  "matches_total": 15,
  "matches_passed": 14,
  "reports_total": 150,
  "reports_valid": 149,
  "position_counts": {},
  "failures": []
}
```

存在任何硬失败时脚本退出码为 1，但报告必须完整写出。

- [ ] **Step 6: 写候选 manifest**

候选池必须包含以下 16 个唯一 ID：

```text
8893373471
8893461215
8894766243
8902638530
8902709946
8903960010
8904119291
8904187926
8904265149
8904318329
8904432250
8908349474
8908420184
8909845275
8911632470
8912957512
```

每项保存相对 Replay 候选路径，不写绝对路径。正式 `matrix_enabled`、`reserve` 和 `golden_subject` 在 Task 10 根据最新解析结果一次性冻结。

- [ ] **Step 7: 忽略运行产物**

`.gitignore` 增加：

```gitignore
tools/runtime/player-report-regression/
```

不得忽略 `tests/player-report-regression/expected/`。

- [ ] **Step 8: 运行快速脚本验证**

Run:

```powershell
pwsh -NoProfile -File '.\tools\Invoke-PlayerReportRegression.ps1' `
  -Mode ValidateExisting -IncludeCandidates
```

Expected: script visits all candidate analyses, writes aggregate report, continues after old-package failures, and exits 1 until current atomic analyses exist.

- [ ] **Step 9: 检查点审阅**

确认脚本没有并发解析、没有自动覆盖 Golden、没有写工作区外路径。Do not stage or commit.

---

### Task 10: 重解析候选池并冻结双层矩阵

**Files:**
- Modify: `tests/player-report-regression/manifest.json`
- Create: `tests/player-report-regression/expected/<match_id>-slot-<slot>.json` for 15 subjects
- Modify: `tests/player-report-regression/README.md`
- Runtime output: `tools/runtime/player-report-regression/reports/candidates.md`

**Interfaces:**
- Consumes: Tasks 1-9
- Produces: 15 enabled matches, 1 reserve, 15 reviewed Golden snapshots

- [ ] **Step 1: 构建最新解析器**

Run:

```powershell
& '.\tools\runtime\apache-maven-3.9.12\bin\mvn.cmd' `
  -q -f '.\tools\replay-parser\pom.xml' package
```

Expected: JAR build succeeds.

- [ ] **Step 2: 串行重解析 16 场候选**

Run:

```powershell
pwsh -NoProfile -File '.\tools\Invoke-PlayerReportRegression.ps1' `
  -Mode ReparseAll -IncludeCandidates -TimeoutSeconds 1200 -KeepParser
```

Expected: 16 match checkpoints reach `validated` or a complete failure report identifies the exact Replay.

- [ ] **Step 3: 生成候选玩家表**

Run:

```powershell
node '.\tools\player-report-regression.mjs' candidates `
  '.\tests\player-report-regression\manifest.json'
```

输出每场十名玩家的：

```text
slot
position
role_confidence
dimension_coverage
base/final score
main strength ID
main issue ID
scenario tags
missing dimensions
```

- [ ] **Step 4: 固定 15 场与 1 场候补**

按以下顺序选择：

```text
1. 分析包协议和原子模型完整。
2. Replay SHA-256 可重复验证。
3. 五位置报告可用。
4. 覆盖长短局、胜负、缺失和根因合并场景。
5. 未被选中的一场标记 reserve=true。
```

正式矩阵必须恰好 15 场。

- [ ] **Step 5: 固定 15 名重点玩家**

每场选一人，默认满足：

```text
role_confidence >= 75
dimension_coverage >= 8
每场只选 1 人
位置 1/2/3/4/5 各 3 人
```

低位置置信度只作为明确测试场景例外，并在 `scenario_tags` 中写入 `role-confidence-low`。

- [ ] **Step 6: 生成候选 Golden**

Run:

```powershell
node '.\tools\player-report-regression.mjs' propose-golden `
  '.\tests\player-report-regression\manifest.json'
```

Expected: writes 15 files to `tools/runtime/player-report-regression/candidate-golden/`; does not touch `expected`.

- [ ] **Step 7: 人工审核并批准 Golden**

逐份确认：

```text
玩家与位置正确
原子指标 key 和权重符合位置职责
基础分可重算
主优点和主问题有真实证据
训练目标没有串位
跳转目标存在
同一根因没有重复扣分
单根因综合扣分不超过 6
```

审核通过后运行显式批准命令：

```powershell
node '.\tools\player-report-regression.mjs' approve-golden `
  '.\tests\player-report-regression\manifest.json' `
  '--reviewed'
```

缺少 `--reviewed` 时命令必须拒绝写入。

- [ ] **Step 8: 切换真实 manifest 契约测试**

将 Task 9 的 manifest 测试改为直接读取：

```javascript
const manifest = JSON.parse(readFileSync(
  resolve("tests/player-report-regression/manifest.json"),
  "utf8",
));
```

Run:

```powershell
npm run test:tools
```

Expected: 16 unique candidates, 15 enabled, 1 reserve, five positions each have 3 Golden subjects.

- [ ] **Step 9: 运行双层矩阵**

Run:

```powershell
pwsh -NoProfile -File '.\tools\Invoke-PlayerReportRegression.ps1' `
  -Mode ValidateExisting
```

Expected:

```text
15/15 matches pass
150/150 reports pass protocol invariants
15/15 Golden reports pass
30 reports per position, unless a role-assignment anomaly is explicitly reported
0 aggregate fallback components
0 duplicate applied result keys
max root negative overall <= 6
```

- [ ] **Step 10: 检查点审阅**

保存运行报告路径和耗时，不提交或发布 Git。

---

### Task 11: 全量验证与 PRD 回写

**Files:**
- Modify: `DOTA-LENS-0.5.0-PLAYER-REPORT-PRODUCTIZATION-PRD.md`
- Modify: `tests/player-report-regression/README.md`

**Interfaces:**
- Consumes: all preceding tasks
- Produces: final verification evidence and current completion status

- [ ] **Step 1: 运行解析器全量测试**

Run:

```powershell
& '.\tools\runtime\apache-maven-3.9.12\bin\mvn.cmd' `
  -q -f '.\tools\replay-parser\pom.xml' test
```

Expected: all required tests pass.

- [ ] **Step 2: 运行前端、工具和桌面测试**

Run:

```powershell
npm test
```

Expected: frontend, tools, and desktop suites pass.

- [ ] **Step 3: 运行生产构建**

Run:

```powershell
npm run build
```

Expected: Vite build succeeds.

- [ ] **Step 4: 再跑固定 Replay 矩阵**

Run:

```powershell
pwsh -NoProfile -File '.\tools\Invoke-PlayerReportRegression.ps1' `
  -Mode ValidateExisting
```

Expected: 150/150 protocol checks and 15/15 Golden checks pass.

- [ ] **Step 5: 回写 PRD**

记录：

```text
原子指标协议版本
十维拆分完成状态
测试通过数量
15 场正式 Replay 和候补 ID
五位置 Golden 分布
公式最大误差
最大单根因综合扣分
完整矩阵耗时
仍存在的数据缺口
```

- [ ] **Step 6: 最终差异检查**

Run:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors. Existing unrelated worktree changes remain untouched.

- [ ] **Step 7: 形成验收摘要**

摘要必须明确区分：

```text
已验证事实
跳过的可选测试
仍存在的风险
未执行的 Git、EXE 和发布操作
```

Do not stage, commit, push, package, or release.
