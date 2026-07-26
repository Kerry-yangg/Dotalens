# Dota Lens 玩家报告原子指标与双层 Replay 回归矩阵设计

日期：2026-07-26  
状态：待产品审核  
目标版本：0.5.0  
关联协议：`player-report/4.0`

## 1. 背景

当前玩家报告已经具备十个维度、行为修正、根因合并和最终分，但每个维度的基础分仍以一个聚合结果写入：

```text
existing_dimension_model = 78
```

这种结构只能证明“维度结果是 78 分”，不能解释：

- 78 分由哪些事实组成；
- 哪个原始指标拉高或拉低了分数；
- 某项数据缺失后，剩余指标如何重新分配权重；
- 修改公式后，分数变化来自数据、权重还是代码错误。

同时，单场 Replay 验证只能证明一个样本可用，无法防止五个位置串用模板、同一根因重复扣分、部分比赛协议缺字段等全局回归。

本阶段同时解决两个问题：

1. 将十个维度的聚合基础分拆成可重算、可解释的原子指标。
2. 建立“15 场全员协议体检 + 15 名五位置 Golden 精查”的双层固定 Replay 回归矩阵。

## 2. 目标

### 2.1 原子指标

- 每个基础维度都可以从其原子指标重新计算。
- 前端能够展示“原始事实 → 原子得分 → 权重贡献 → 维度基础分”。
- 缺失数据不会被当成 0 分。
- 同一份分析包在 Java、前端和验证脚本中重算结果一致。
- 新生成报告不再使用 `existing_dimension_model` 作为唯一基础分来源。

### 2.2 双层回归矩阵

- 固定 15 场 Replay，对每场全部 10 名玩家进行协议级检查，共约 150 份报告。
- 从这 15 场中固定 15 名重点玩家，1/2/3/4/5 号位各 3 名，进行精细 Golden 对比。
- 同时覆盖胜负、长短局、缺失数据、低位置置信度和不同职责场景。
- 测试失败时能够指出具体比赛、玩家、维度、原子指标和不一致原因。
- 第 16 场本机 Replay 作为候补样本，不直接进入 Golden。

## 3. 非目标

本阶段不处理：

- 重新训练机器学习模型；
- 修改十个维度的产品含义；
- 大规模重写玩家报告页面；
- 用完整中文文案逐字快照锁死报告；
- 自动批准或自动覆盖 Golden；
- 发布 GitHub 版本或打包 EXE。

## 4. 原子指标协议

### 4.1 协议版本

完整玩家报告继续使用：

```json
{
  "protocol": "player-report/4.0",
  "base_component_model": "player-report-base-components/1.0"
}
```

本次是向 `player-report/4.0` 增加可解释字段，不改变现有计分语义，因此不提升完整协议大版本。原子指标结构单独声明 `base_component_model`，以后调整原子指标语义时可独立升级。

### 4.2 原子指标结构

每个维度的 `base_components` 至少包含：

```json
[
  {
    "key": "relative_gpm",
    "label": "每分钟经济相对表现",
    "available": true,
    "normalized_score": 74.25,
    "local_weight": 33.3333,
    "effective_local_weight": 33.3333,
    "weighted_contribution": 24.75,
    "confidence": 92,
    "comparison": {
      "subject": 612,
      "reference": 570,
      "unit": "gpm"
    },
    "raw_metrics": {
      "gpm": 612,
      "reference_gpm": 570
    },
    "evidence_refs": [
      "player.slot.1.gpm",
      "opponent.position.1.gpm"
    ],
    "missing_reason": null,
    "suppression_reason": null
  }
]
```

字段规则：

| 字段 | 规则 |
|---|---|
| `key` | 同一维度内稳定且唯一，不使用展示文案作为标识 |
| `label` | 面向专业模式的中文名称 |
| `available` | 计算所需事实是否齐全 |
| `normalized_score` | 归一化到 0 至 100 |
| `local_weight` | 公式定义的原始权重 |
| `effective_local_weight` | 排除不可用指标后重新归一化的实际权重 |
| `weighted_contribution` | `normalized_score × effective_local_weight / 100` |
| `confidence` | 原始事实和推导链路的可信度，0 至 100 |
| `comparison` | 主体值、参照值和单位 |
| `raw_metrics` | 支持复算的结构化事实，不放中文句子 |
| `evidence_refs` | 指向分析包事实路径或事件锚点 |
| `missing_reason` | 数据不可用的结构化原因 |
| `suppression_reason` | 数据存在但因职责门禁等原因不参与计分的原因 |

### 4.3 计算规则

设可用原子指标集合为 `A`：

```text
effective_weight(i) =
  local_weight(i) / sum(local_weight(j), j in A) × 100

weighted_contribution(i) =
  normalized_score(i) × effective_weight(i) / 100

dimension_base_score =
  sum(weighted_contribution(i), i in A)
```

硬性规则：

1. 不可用原子指标不按 0 分处理。
2. 可用指标的 `effective_local_weight` 总和必须为 `100 ± 0.01`。
3. 维度基础分与原子指标复算结果误差不得超过 `0.05`。
4. `normalized_score`、权重、贡献和维度分都必须是有限数值。
5. 分数统一限制在 0 至 100。
6. 若一个维度没有任何可用原子指标，则该维度必须标记为不可用，不生成伪分数。
7. 基础分只承载已有聚合公式的事实输入，不混入行为修正、根因扣分或上下文提示。

### 4.4 十个维度的原子拆分

#### 对线执行 `lane_execution`

核心位 1/2/3：

| 原子指标 | 权重 |
|---|---:|
| 对线模型结果 `lane_model_score` | 75 |
| 核心对线资源转化 `core_lane_opportunity_conversion` | 25 |

辅助位 4/5：

| 原子指标 | 权重 |
|---|---:|
| 对线模型结果 `lane_model_score` | 65 |
| 辅助路线结果 `support_route_outcome` | 35 |

#### 发育效率 `farm_efficiency`

| 原子指标 | 默认权重 |
|---|---:|
| 相对 GPM `relative_gpm` | 33.3333 |
| 相对 XPM `relative_xpm` | 33.3333 |
| 相对净值 `relative_net_worth` | 33.3334 |

缺失其中一项时，只在剩余可用项之间重新分配权重。

#### 资源决策 `resource_decision`

核心位 1/2/3：

| 原子指标 | 权重 |
|---|---:|
| 安全兵线机会兑现率 `secured_lane_opportunity_ratio` | 35 |
| 路线匹配得分 `hard_gated_route_match` | 50 |
| 已确认线野循环 `confirmed_lane_jungle_cycles` | 15 |

辅助位 4/5：

| 原子指标 | 权重 |
|---|---:|
| 辅助路线结果 `support_route_outcome` | 65 |
| 叠野团队价值 `stack_team_value` | 35 |

#### 战斗输出 `combat_output`

| 原子指标 | 权重 |
|---|---:|
| 团队伤害占比对职责目标 `team_damage_share_vs_role_target` | 55 |
| 平均团战伤害占比对职责目标 `fight_damage_share_vs_role_target` | 25 |
| 击杀转化 `kill_conversion` | 20 |

#### 战斗职责 `combat_duty`

| 原子指标 | 权重 |
|---|---:|
| 硬门禁职责执行均分 `hard_gated_duty_average` | 75 |
| 团队功能贡献占比 `team_utility_share_vs_role_target` | 25 |

#### 视野与团队 `vision_team`

| 原子指标 | 权重 |
|---|---:|
| 团队视野贡献占比 `team_vision_share_vs_role_target` | 65 |
| 个人眼位平均质量 `own_ward_average_score` | 35 |

#### 生存与风险 `survival_risk`

| 原子指标 | 权重 |
|---|---:|
| 相对同位置死亡表现 `deaths_vs_same_position` | 65 |
| 死亡时间占比 `dead_time_percentage_score` | 35 |

#### 目标转化 `objective_conversion`

| 原子指标 | 权重 |
|---|---:|
| 团队建筑伤害占比 `team_tower_damage_share_vs_role_target` | 75 |
| 防御塔与肉山终结参与 `tower_roshan_finish_contribution` | 25 |

#### 地图节奏 `map_tempo`

| 原子指标 | 权重 |
|---|---:|
| 团队节奏贡献占比 `team_tempo_share_vs_role_target` | 45 |
| TP 与神符激活表现 `tp_rune_activation_relative_score` | 25 |
| 战斗到场率 `fight_presence_vs_role_target` | 30 |

#### 可观察操作 `observable_execution`

| 原子指标 | 权重 |
|---|---:|
| 操作连续性与 APM `action_continuity_apm` | 60 |
| 每分钟技能与物品使用 `observable_uses_per_minute_vs_opponent` | 40 |

对手使用次数不可用时，第二项标记为不可用，第一项实际权重重算为 100；不得伪造第二项，也不得把第一项直接写成满分。

## 5. 后端职责边界

### 5.1 `PlayerReportAnalysis`

负责：

- 产生原始指标；
- 按位置选择正确的原子指标集合；
- 计算 `normalized_score` 和原始权重；
- 标记缺失、门禁与证据；
- 计算维度基础分。

### 5.2 `PlayerReportScoringV4`

负责：

- 保留并验证后端产生的原子指标；
- 复算有效权重、贡献和基础分；
- 在基础分之后接入 `embedded`、`modifier`、`context_only`；
- 继续执行根因去重和单根因综合扣分上限；
- 仅对旧分析包或测试构造数据保留 `existing_dimension_model` 兼容回退。

新解析的当前协议报告若仍只有 `existing_dimension_model`，视为回归失败。

### 5.3 前端

负责：

- 使用同一公式重算基础分和最终分；
- 在审计下钻中展示原子指标；
- 清楚区分“不可用”“因职责不参与”和真实 0 分；
- 不根据中文标签判断指标身份；
- 不在前端重新推断位置职责。

## 6. 双层 Replay 回归矩阵

### 6.1 候选池

本机目前有 16 个唯一 Replay：

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

流程先使用当前解析器重跑 16 场，再从中固定 15 场进入正式矩阵，剩余 1 场作为候补。不得仅因旧分析包缺少 V4 字段就淘汰 Replay。

### 6.2 第一层：15 场全员协议体检

范围：

```text
15 场 × 每场 10 名玩家 = 150 份玩家报告
```

这一层不锁死中文文案，主要发现协议和计算错误。

每份报告必须检查：

- 协议为 `player-report/4.0`；
- 原子模型为 `player-report-base-components/1.0`；
- 十个维度存在且顺序稳定；
- 位置与职责模板一致；
- 每个可用维度都可以从原子指标复算；
- 不可用指标未被当作 0 分；
- 基础分、行为修正和最终分链路一致；
- `embedded`、`modifier`、`context_only` 路径合法；
- 同一结果不重复扣分；
- 单根因综合扣分不超过 6；
- 时间和地图跳转目标合法；
- 所有数值无 `NaN`、无无穷值、无越界；
- 新报告不使用聚合占位指标；
- 每个位置至少出现约 30 份广度样本，异常位置分配单独报告。

矩阵执行遇到单场失败时继续检查其余比赛，最终汇总所有错误并以非零状态退出。

### 6.3 第二层：15 名重点玩家 Golden 精查

从正式 15 场中每场选择 1 名重点玩家，共 15 名：

| 位置 | 数量 |
|---|---:|
| 1 号位 | 3 |
| 2 号位 | 3 |
| 3 号位 | 3 |
| 4 号位 | 3 |
| 5 号位 | 3 |

默认选择条件：

- `role_confidence >= 75`；
- 十维可用覆盖不低于 8 个；
- 该样本能补足一个明确场景；
- 同一场只选择 1 名重点玩家；
- 低位置置信度作为专门场景时可以例外，但必须在清单中标明。

建议场景覆盖：

- 胜局与负局；
- 20 分钟以内短局与 40 分钟以上长局；
- 对线优势、均势和劣势；
- 核心发育路线问题；
- 物品完成后的节奏窗口；
- 先手、输出、承伤、救人与视野职责；
- 缺失数据；
- 没有高置信度批评；
- 同一根因造成多个后果；
- 低位置置信度或职责抑制。

Golden 精查固定：

- 玩家身份、位置和位置置信度；
- 十个维度与全部原子指标的稳定 `key`；
- 原子指标原始权重；
- 基础分、最终分与综合分；
- 主优点、主问题和训练目标的语义 ID；
- 根因 ID、影响维度和扣分封顶结果；
- 事实证据锚点与跳转目标；
- 缺失和抑制原因。

Golden 不逐字锁定整段中文说明。文案调整只要语义 ID、事实锚点和结论方向不变，应报告差异但不阻止合理的大白话优化。

## 7. 固定样本清单

建议文件：

```text
tests/player-report-regression/
  manifest.json
  expected/
    <match_id>-slot-<player_slot>.json
  README.md
```

运行产物不写入 `expected`：

```text
tools/runtime/player-report-regression/
  latest/
  reports/
  checkpoints/
```

`manifest.json` 每场至少记录：

```json
{
  "match_id": 8894766243,
  "replay_sha256": "...",
  "replay_candidates": [
    "release/8894766243.dem",
    "tools/runtime/dota-lens-data/replays/8894766243.dem"
  ],
  "patch": "unknown",
  "matrix_enabled": true,
  "golden_subject": {
    "player_slot": 1,
    "expected_position": 2,
    "scenario_tags": [
      "role-confidence-low",
      "protocol-v4"
    ]
  },
  "known_missing": []
}
```

路径解析按候选顺序查找，不在 Golden 中写死某台电脑的绝对路径。Replay 的 SHA-256 用于确认样本内容未被替换。

## 8. Golden 变更策略

### 8.1 硬失败

以下任一情况直接失败：

- 协议、维度 key、原子指标 key 或位置职责意外改变；
- 公式复算误差超过 `0.05`；
- 可用原子指标有效权重和不在 `100 ± 0.01`；
- 综合分无法从维度分重算；
- 同一结果重复扣分；
- 单根因综合扣分超过 6；
- 重点结论丢失事实锚点或跳转目标；
- 1/2/3/4/5 号位使用错误职责模板；
- 新报告退回 `existing_dimension_model`；
- 生成非法数值或越界分数。

### 8.2 需人工审核的漂移

- Golden 综合分或任一维度最终分变化超过 3 分；
- 单个原子指标归一化分变化超过 5 分；
- 主优点、主问题、训练目标的语义 ID 改变；
- 根因归并关系改变；
- 可用维度数量改变；
- 位置置信度跨过 75 的门槛。

这些变化不允许脚本自动覆盖 Golden。开发者必须查看差异报告，确认是公式升级、解析事实变化还是缺陷。

### 8.3 信息提示

- 中文措辞变化但语义 ID 不变；
- 分数在允许区间内小幅变化；
- 非关键证据顺序变化；
- 增加新的可选展示字段。

## 9. 运行器设计

新增独立的玩家报告矩阵运行器，不复用只面向战斗时机的单场脚本。

运行模式：

```text
ValidateExisting
  只校验已有最新分析包，适合秒级开发反馈。

ReparseChanged
  Replay SHA、解析器版本或公式版本变化时重新解析。

ReparseAll
  强制重跑 15 场正式矩阵，用于版本验收。

ApproveGolden
  只生成候选差异，不直接覆盖；人工确认后才能写入 expected。
```

运行器要求：

- 默认串行解析，避免本地解析器内存峰值叠加；
- 每完成一场立即写检查点；
- 中断后可以从下一场恢复；
- 输出机器可读 JSON 和人可读 Markdown 报告；
- 汇总通过数、失败数、位置分布、缺失维度和漂移原因；
- 失败时仍保留已完成场次的结果；
- 可按比赛、位置、玩家槽位和失败类型过滤重跑。

预计 15 场完整重解析可能需要十几分钟，秒级反馈应优先使用单元测试和 `ValidateExisting`。

## 10. TDD 顺序

### 阶段 1：原子公式单元测试

先写失败测试：

- 十个维度各自的正常原子拆分；
- 核心与辅助分支；
- 单个指标缺失后的权重重算；
- 全部指标缺失；
- 职责门禁抑制；
- 非法数值和越界；
- Java 与前端重算一致。

### 阶段 2：后端实现

- 在 `PlayerReportAnalysis` 产生原子指标；
- 在 `PlayerReportScoringV4` 验证并保留原子指标；
- 保留旧包兼容回退；
- 新包禁止聚合占位指标。

### 阶段 3：前端审计下钻

- 展示原子事实、归一化分、有效权重和贡献；
- 展示缺失或抑制原因；
- 支持重算基础分和最终分；
- 先补前端测试，再修改界面。

### 阶段 4：矩阵基础设施

- 建立 manifest、Golden schema 和差异报告；
- 使用小型伪造 fixture 测试恢复、过滤、失败聚合和 Golden 防误覆盖；
- 再接入真实 Replay。

### 阶段 5：真实样本冻结

1. 用当前解析器重跑全部 16 场候选 Replay。
2. 生成十人位置、置信度、数据覆盖和场景摘要。
3. 选择 15 场正式矩阵与 1 场候补。
4. 每场选择 1 名重点玩家，确保五位置各 3 名。
5. 人工审核 15 份候选 Golden。
6. 运行 150 份协议体检和 15 份 Golden 精查。

## 11. 验收标准

本阶段完成必须同时满足：

- 15 场正式 Replay 和 1 场候补写入清单；
- 150/150 份报告通过协议与不变量检查；
- 15 名 Golden 玩家中五位置各 3 名；
- 十个维度均输出真实原子指标；
- 所有可用基础分复算误差不超过 `0.05`；
- 所有可用原子指标有效权重和为 `100 ± 0.01`；
- 新生成报告中 `existing_dimension_model` 数量为 0；
- 重复结果扣分数量为 0；
- 单根因综合扣分最大值不超过 6；
- 位置职责模板串位数量为 0；
- Golden 差异报告可以定位到比赛、玩家、维度和原子指标；
- 运行中断后能够从检查点恢复；
- Java、前端和验证脚本测试全部通过；
- 不影响旧分析包的只读展示。

## 12. 风险与控制

| 风险 | 控制 |
|---|---|
| 旧分析包与当前协议混用 | 以 Replay 重新解析结果建立 Golden，旧包只做兼容测试 |
| Golden 锁死合理文案优化 | 固定语义 ID 和证据，不逐字锁定整段中文 |
| 15 场完整重跑耗时过长 | 串行检查点、按哈希跳过、提供已有包快速校验 |
| 位置识别错误污染建议 | Golden 默认要求位置置信度不低于 75，异常样本单独标记 |
| 缺失数据被误判为差表现 | 不可用指标排除并重算权重，禁止按 0 分 |
| 自动更新 Golden 掩盖回归 | 脚本只生成候选差异，人工批准后才能覆盖 |
| 同一事实跨维度重复惩罚 | 继续执行结果去重和单根因综合扣分上限 |

## 13. 审核决策

需要确认的不是“要不要做双层矩阵”，该方向已确认；本设计冻结以下实现口径：

1. 第一层检查 15 场全部 10 人，只锁协议和计算不变量。
2. 第二层每场固定 1 名重点玩家，五位置各 3 名，锁定可解释分数与语义结论。
3. 先重跑 16 场候选，再选择 15 场正式样本和 1 场候补。
4. Golden 不锁整段中文，避免阻碍后续大白话与专业模式双层表达。
5. 新报告必须输出真实原子指标，聚合占位只保留旧包兼容。
6. Golden 只能人工批准，测试脚本不得静默覆盖。
