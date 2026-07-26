# Dota Lens player-report/4.0 评分协议设计

日期：2026-07-26

## 1. 目标

阶段 A 只解决评分协议可信度，不改普通报告的信息架构：

- 每个有效维度输出基础分、行为修正和最终分。
- 综合分可以只依赖协议字段重新计算。
- 每个根因影响明确进入 `embedded`、`modifier` 或 `context_only`。
- 同一比赛结果不能因多个根因或多个模块重复扣分。
- 单根因对综合分的负向影响不超过 6 分。
- 前端能下钻综合分和维度分，并显示服务端值与本地重算值是否一致。

## 2. 兼容策略

- 新协议：`player-report/4.0`。
- V3 已有维度 `score` 作为 V4 的 `base_score` 输入。
- V4 完成计算后，兼容字段 `score` 和 `overall_score` 指向最终分。
- V3 报告仍可读取，但标记为需要重新解析，不能伪装成 V4 可审计报告。
- 阶段 A 不改现有事实、叙事、定位和根因生成器，只在它们完成后运行独立计分器。

## 3. 维度协议

每个维度至少输出：

```json
{
  "key": "combat_duty",
  "available": true,
  "weight": 20,
  "effective_weight": 20.0,
  "base_score": 68.0,
  "behavior_modifier": -2.4,
  "final_score": 65.6,
  "score": 65.6,
  "base_components": [],
  "scoring_components": [],
  "comparison": {},
  "recomputation": {}
}
```

公式：

```text
final_dimension_score =
  clamp(base_score + sum(scoring_components.applied_delta), 0, 100)
```

阶段 A 的 V3 基础评分器尚未全部拆出子指标贡献，因此 `base_components` 先保存一个
`existing_dimension_model` 聚合组件。它准确重算基础分，不虚构不可得的子指标贡献。

## 4. 三种计分路径

### 4.1 embedded

该事实或结果已被基础维度指标吸收，只解释，不再修正：

- 对线模型和补刀机会结果。
- 发育与路线复核结果。
- 团战输出和职责分。
- 阵亡、目标、视野等已进入对应基础维度的结果。

`overlap_factor = 0`，`applied_delta = 0`。

### 4.2 modifier

只有独立于基础指标、具备个人归责和足够置信度的上下文行为可以修正。阶段 A 首批开放：

- `combat_timing`：到场、首轮行动、可达条件和连续同类时机模式。

计算：

```text
candidate_delta =
  raw_delta
  * confidence_factor
  * responsibility_factor
  * overlap_factor
```

其中：

- `confidence_factor = confidence / 100`。
- `personal = 1.0`。
- `shared = 0.5`。
- `team_context = 0`。
- `independent = 1.0`。

### 4.3 context_only

以下情况不进入最终分：

- 只有团队背景，无法归责当前玩家。
- 目标维度不存在或缺失。
- 独立行为置信度低于 70。
- 未列入阶段 A 白名单的未知行为类型。

`applied_delta = 0`，但保留事实、原因和跳转。

## 5. 去重

每个影响生成稳定 `dedupe_key`：

1. 优先使用显式 `dedupe_key`。
2. 其次使用维度、后果 ID 集合。
3. 再使用维度、事件证据引用集合。
4. 最后回退为维度和根因 ID。

同一 `dedupe_key` 的多个 `modifier` 只保留绝对候选影响最大者；再按置信度和根因 ID
稳定决胜。其余组件保留在审计中，但：

```json
{
  "dedupe_status": "suppressed_duplicate",
  "applied_delta": 0
}
```

## 6. 封顶顺序

1. 单根因、单维度原始影响限制为 `[-25, +25]`。
2. 单根因加权综合负向影响不超过 `6`。
3. 单场单维度行为修正限制为 `[-15, +10]`。
4. 单场综合行为修正限制为 `[-12, +8]`。

封顶只能缩小影响，不能放大。最终写入的 `applied_delta` 必须能逐项相加重算维度分。

## 7. 综合分协议

`score_card` 和报告顶层均输出：

```json
{
  "base_score": 66.4,
  "behavior_modifier": -2.1,
  "final_score": 64.3,
  "overall_score": 64.3
}
```

综合公式：

```text
base_score =
  sum(base_dimension_score * effective_weight)
  / sum(effective_weight)

final_score =
  sum(final_dimension_score * effective_weight)
  / sum(effective_weight)

behavior_modifier = final_score - base_score
```

缺失维度从权重分母移除。JSON 数值允许重算误差不超过 `0.05`。

## 8. 审计字段

每个根因的每个维度影响保存：

- `dimension`
- `raw_delta`
- `score_path`
- `overlap_reason`
- `confidence_factor`
- `responsibility_factor`
- `overlap_factor`
- `candidate_delta`
- `dedupe_key`
- `dedupe_status`
- `root_cap_factor`
- `dimension_cap_factor`
- `overall_cap_factor`
- `applied_delta`
- `suppression_reason`

综合审计保存公式版本、四级上限、路径数量、权重分母和服务端重算结果。

## 9. 前端

- 综合分改为可点击命令，打开“综合分审计”。
- 显示基础综合分、行为修正、最终综合分和“重算一致/不一致”。
- 按十维显示基础分、修正、最终分、有效权重和综合贡献。
- 维度下钻显示三段分数、基础组件、三路根因、各系数、去重状态和实际应用分。
- `embedded` 使用“已计入基础分”，`context_only` 使用“仅作上下文”，重复项使用“同结果已去重”。

## 10. 回归门槛

单元测试必须覆盖：

- 三种路径。
- 可重算维度分和综合分。
- 同一结果只应用一次。
- 单根因综合负向影响不超过 6。
- 单维度与全场行为修正封顶。
- 缺失维度不进入分母。
- V3 被提示重算，V4 被识别为当前协议。

真实 Replay `8894766243` 必须验证：

- 10 名玩家均输出 `player-report/4.0`。
- 每名玩家 10 个维度键顺序稳定。
- 每个有效维度重算误差不超过 `0.05`。
- 每名玩家综合分重算误差不超过 `0.05`。
- 没有重复应用的 `dedupe_key`。
- 每个根因综合负向实际影响不超过 6。

