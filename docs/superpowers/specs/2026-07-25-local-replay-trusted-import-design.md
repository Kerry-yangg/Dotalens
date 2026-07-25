# Dota Lens 0.4.5 本地 Replay 可信导入闭环设计

- 版本：0.4.5
- 日期：2026-07-25
- 状态：待用户确认
- 范围：Windows 桌面端、本地 Parser、`.dem` / `.dem.bz2` 导入

## 1. 背景

0.4.4 已经完成本地 Replay 的文件导入、目录扫描、逐帧解析和私密比赛元数据重建，但“文件能够解析”还不等于“个人分析可信”。

真实样本 `8894766243` 暴露了两个 P0 问题：

1. 输入账号 `99735754` 不在 Replay 的 10 名玩家中，分析包的 `selected_player_slot` 为空，但前端会静默选择第一个玩家。
2. 本地 Replay 没有 OpenDota 比赛详情时缺少 Patch，坐标使用 `unknown_patch_dynamic`，完整性为 `partial`，但普通用户不容易理解哪些结论因此被限制。

当前 Replay 文件名中的比赛 ID 也只是外部声明。Parser 虽然能从 `CDemoFileInfo` 读取 Replay 内部比赛 ID，但尚未将二者作为可信导入门禁进行比较。

## 2. 目标

0.4.5 必须保证：

1. 用户明确知道当前报告分析的是哪一名玩家。
2. 账号未匹配时绝不默认选择第一位玩家。
3. 手动选择玩家后不需要重新解析 Replay。
4. 玩家选择在应用重启后仍然有效，并可随时切换。
5. Replay 文件名比赛 ID 与内部比赛 ID 不一致时禁止写入错误比赛。
6. 每个 Patch 结论都携带来源、状态和置信度。
7. Patch 不可信时，依赖 Patch 的确定性结论自动降级或关闭。
8. OpenDota 离线时，本地 Replay 仍然可以完成导入、解析和玩家选择。

## 3. 非目标

本阶段不包含：

1. 新增分析 Tab。
2. 多场趋势、段位百分位或跨玩家基准。
3. 重做战斗、打钱、视野算法。
4. 完整地形战争迷雾模拟。
5. 为 Replay 不提供的鼠标、镜头或语音行为造数。
6. 将用户手动选择的玩家自动写成全局 Steam 账号。

## 4. 核心决策

### 4.1 使用“解析后身份门禁”

不增加一个独立的重型 Replay 预解析流程。

`CDemoFileInfo` 和完整玩家名单在 Replay 解析末尾最可靠。0.4.5 继续只解析一次，解析完成后先检查身份状态，再决定是否进入个人报告：

```text
导入文件
  -> 校验格式和声明比赛 ID
  -> 完整解析
  -> 校验 Replay 内部比赛 ID
  -> 解析 10 名玩家
  -> 自动匹配账号或要求人工选择
  -> 打开所选玩家报告
```

团队级事实可以完成存储，但身份未确认前不能把任何玩家标记为“我”，也不能展示针对第一位玩家的个人结论。

### 4.2 比赛分析对象与全局账号分离

定义两个独立概念：

- `account_id`：用于读取比赛列表的 Steam 数字 ID。
- `match subject`：这场 Replay 当前要分析的玩家。

手动选择只修改当前比赛的 `match subject`。除非用户以后明确使用“设为常用账号”，否则不修改全局账号。

### 4.3 Parser 是身份状态的唯一事实源

前端不再根据 `account_id` 自行猜测分析对象，也不允许 `players[0]` 兜底。

Parser 输出以下状态：

- `matched`：请求账号唯一匹配到 Replay 玩家。
- `manual_required`：没有账号、账号不在 Replay 中，或玩家账号不可用。
- `manual_selected`：用户已经手动选择。
- `invalidated`：历史选择不再对应当前 Replay 玩家名单。

### 4.4 玩家选择独立持久化

每场比赛保存：

`analyses/{match_id}/subject.json`

该文件独立于大型分析模块，切换玩家只需写入一个小文件，不重新生成 Replay 事件、地图或十人报告。

重新解析时：

- `manual` 选择且玩家槽位和账号仍匹配：始终保留选择。
- `account_id` 自动选择：使用本次解析请求账号重新匹配。
- 玩家槽位存在但账号发生冲突：标记 `invalidated`。
- 玩家槽位不存在：删除有效选择并回到 `manual_required`。

### 4.5 Patch 必须携带来源

Patch 解析优先级：

1. `opendota_match`：OpenDota 比赛详情提供 Patch ID，状态为 `exact`。
2. `cached_match`：本地缓存中已有可信 Patch ID，状态为 `exact`。
3. `replay_time_window`：使用 Replay `endTime_` 和内置 Patch 发布时间表推定，状态为 `inferred`。
4. 无法定位或位于版本切换不确定窗口，状态为 `ambiguous` 或 `unknown`。

本地 Replay 不等待 OpenDota 才能开始工作。Parser 只做短时、可失败的详情补全；超时或 521 后立即继续本地流程。

### 4.6 Patch 门禁

`patch_resolution.status` 对分析模块的影响：

| 状态 | 地图 Profile | 技能元数据 | 确定性负面评分 |
| --- | --- | --- | --- |
| `exact` | 开启 | 开启 | 允许 |
| `inferred` 且高置信 | 开启并标记推定 | 开启并标记推定 | 允许，但证据必须显示推定来源 |
| `ambiguous` | 使用动态锚点 | 关闭精确 Patch 规则 | 禁止 |
| `unknown` | 使用动态锚点 | 关闭精确 Patch 规则 | 禁止 |

版本发布时间前后各 12 小时作为默认不确定窗口。该窗口必须由配置给出，不能散落在分析代码中。

“高置信推定”必须同时满足：

- `confidence >= 0.90`。
- 比赛结束时间不在任一版本切换的 12 小时不确定窗口。
- 本地存在与推定版本精确匹配的地图或技能元数据。

任一条件不满足时，相关模块按 `ambiguous` 门禁处理。

## 5. 用户流程

### 5.1 账号自动匹配

1. 用户输入 Steam 数字 ID。
2. 用户导入该账号参与的 Replay。
3. Parser 在 10 名玩家中找到唯一账号。
4. 任务完成后直接打开报告。
5. 顶部英雄条和报告明确标记“我”。

### 5.2 账号未匹配

1. Replay 解析完成。
2. 页面显示“当前账号不在这场 Replay 中”。
3. 弹出玩家选择对话框。
4. 对话框显示双方阵营、英雄头像、玩家名、账号 ID 和槽位。
5. 用户选择要分析的玩家并确认。
6. Parser 持久化选择，前端加载对应报告。

禁止：

- 自动选择第一个玩家。
- 通过英雄索引猜测玩家。
- 把“账号未匹配”显示为解析失败。

### 5.3 没有输入账号

允许直接导入。解析完成后必须选择玩家，选择结果仅对该比赛生效。

### 5.4 切换分析玩家

比赛详情顶部提供“切换玩家”命令。切换后：

- 英雄条的“我”标记立即更新。
- 发育、打钱、出装、战斗和玩家报告同步到新玩家。
- 全局时间和当前 Tab 保持不变。
- 不触发 Replay 重解析。

### 5.5 比赛 ID 不一致

当文件名声明 ID 与 Replay 内部 `matchId_` 不一致：

1. 任务以 `replay_match_id_mismatch` 失败。
2. 错误信息同时显示声明 ID 和内部 ID。
3. 删除 Parser 中按错误 ID 写入的缓存副本。
4. 不删除用户原始文件。
5. 错误对话框提供复制内部 ID，并说明将文件名改为内部 ID 后重新导入。

0.4.5 不自动重命名用户原始文件，也不在后台将失败任务改挂到另一场比赛。

## 6. 数据契约

### 6.1 `match.subject`

```json
{
  "schema": "match-subject/1.0",
  "status": "manual_required",
  "requested_account_id": 99735754,
  "selected_player_slot": null,
  "selected_account_id": null,
  "source": "none",
  "reason": "requested_account_not_in_replay",
  "updated_at": null
}
```

手动选择后：

```json
{
  "schema": "match-subject/1.0",
  "status": "manual_selected",
  "requested_account_id": 99735754,
  "selected_player_slot": 2,
  "selected_account_id": 898754153,
  "source": "manual",
  "reason": "user_selected_replay_participant",
  "updated_at": "2026-07-25T12:00:00Z"
}
```

`selected_player_slot` 使用 Replay 对外槽位：天辉 `0-4`，夜魇 `128-132`。前端内部索引必须通过玩家数组映射，不能把外部槽位直接当数组索引。

### 6.2 `match.patch_resolution`

```json
{
  "schema": "patch-resolution/1.0",
  "status": "inferred",
  "patch": null,
  "patch_name": "7.41d",
  "source": "replay_time_window",
  "confidence": 0.92,
  "match_end_time": 1783950987,
  "uncertainty_window_hours": 12,
  "gates": {
    "map_profile": "enabled_inferred",
    "ability_metadata": "enabled_inferred",
    "negative_scoring": "enabled_with_disclosure"
  }
}
```

### 6.3 向后兼容

- 保留 `match.selected_player_slot`，值由 `match.subject` 投影生成。
- 保留 `match.patch` 和 `match.patch_name`，但 UI 必须读取 `patch_resolution` 判断可信状态。
- 旧分析包没有 `subject` 时，Parser 在读取时即时生成状态，不默认选择玩家。
- 旧分析包可直接手动选择玩家；只有补齐 Patch 分析时才需要重新解析。

## 7. API

### 7.1 读取分析

`GET /api/matches/{match_id}/analysis`

响应中的 `match` 必须包含：

- `players`
- `subject`
- `selected_player_slot`
- `patch_resolution`

### 7.2 保存分析对象

`PUT /api/matches/{match_id}/subject`

请求：

```json
{
  "player_slot": 2
}
```

成功返回 `match.subject`。

校验：

- 比赛分析包必须存在。
- `player_slot` 必须存在于当前 10 人名单。
- 如果该玩家有 `account_id`，一并写入选择文件。
- 使用临时文件和原子替换，防止中断后留下半个 JSON。

错误：

- `analysis_not_found`
- `invalid_player_slot`
- `subject_write_failed`

### 7.3 导入与任务结果

现有 `POST /api/replays/{match_id}/import` 保持不变。

任务完成结果新增：

```json
{
  "subject_status": "manual_required",
  "internal_match_id": 8894766243,
  "patch_status": "inferred"
}
```

比赛 ID 不一致的失败任务新增：

```json
{
  "error_code": "replay_match_id_mismatch",
  "error_context": {
    "declared_match_id": 1234567890,
    "internal_match_id": 8894766243
  }
}
```

## 8. Parser 设计

### 8.1 `ReplayMatchMetadata`

扩展输出：

- Replay 内部比赛 ID。
- `endTime_`。
- 10 名玩家。
- 玩家账号可用性。
- 元数据来源。

### 8.2 `DotaPatchResolver`

新增独立组件，负责：

- OpenDota / 缓存 / 时间窗口的优先级。
- 内置 Patch 时间表加载。
- 不确定窗口判断。
- `patch_resolution/1.0` 输出。

Patch 表为版本化资源，不把日期硬编码在 `ProductAnalysis`。

### 8.3 `MatchSubjectStore`

新增独立组件，负责：

- 自动账号匹配。
- 读取和校验 `subject.json`。
- 原子保存手动选择。
- 重解析后的选择失效处理。
- 将选择投影到分析响应。

### 8.4 `AnalysisSummary`

在构建 `ProductAnalysis` 前完成 Replay 元数据和 Patch 解析，使地图与技能规则使用同一 Patch 决策。

为避免不必要的重复工作，元数据预扫描只保留 `epilogue` 和版本判断所需字段。增加性能测试，要求该步骤不超过完整解析耗时的 10%。

### 8.5 `ReplayJobManager`

增加：

- 本地 Replay 的短时 OpenDota 元数据补全。
- 内外比赛 ID 一致性门禁。
- 任务完成结果中的身份和 Patch 状态。
- 错误 ID 缓存清理。
- 重解析时保留有效的手动选择。

## 9. 前端设计

### 9.1 玩家选择对话框

使用现有 `dialog` 风格，不新增页面或 Tab。

布局：

- 标题：选择本场要分析的玩家。
- 辅助文案：当前账号未匹配到参赛者，选择只对本场生效。
- 天辉和夜魇各一列，每列 5 名玩家。
- 每名玩家显示英雄头像、玩家名、账号 ID 和位置；位置不足时显示“位置待判断”。
- 底部提供取消和确认。

未选择玩家时确认按钮禁用。

### 9.2 页面门禁

身份状态为 `manual_required` 或 `invalidated` 时：

- 比赛仍显示为“解析完成”。
- 打开比赛时先显示玩家选择对话框。
- 不能进入带“我”语义的个人报告。
- 团队比分和十人列表可以作为选择上下文显示。

### 9.3 移除隐式兜底

必须移除：

```js
Math.max(0, HEROES.findIndex((hero) => hero.me))
```

以及：

```js
players.find(...) || players[0]
```

身份确认后，`hero.me` 只由 `match.subject.selected_player_slot` 计算。

### 9.4 Patch 展示

顶部 Patch 区分：

- `7.41d`：精确。
- `7.41d · 按比赛时间推定`：高置信推定。
- `版本切换附近 · 部分结论关闭`：歧义。
- `Patch 未确认 · 使用 Replay 动态校准`：未知。

数据覆盖页列出被关闭的具体结论。

## 10. 异常处理

| 场景 | 用户结果 |
| --- | --- |
| OpenDota 521 | 继续本地解析，Patch 进入推定或未知状态 |
| 账号不在 Replay | 解析成功，要求选择玩家 |
| 玩家账号全部匿名 | 通过英雄和昵称手动选择 |
| 内外比赛 ID 不一致 | 阻止写入错误比赛，显示两个 ID |
| 选择文件损坏 | 标记 `invalidated`，重新选择 |
| 选择写入失败 | 保持对话框，不假装保存成功 |
| Patch 发布时间表无覆盖 | `unknown`，关闭 Patch 依赖结论 |
| 旧分析包 | 可选择玩家；Patch 增强提示重新解析 |

## 11. 测试方案

### 11.1 Parser 单元测试

1. 请求账号存在时自动匹配正确外部槽位。
2. 请求账号不存在时输出 `manual_required`。
3. 没有账号时输出 `manual_required`。
4. 有效手动选择写入并在 Parser 重启后恢复。
5. 无效槽位返回 `invalid_player_slot`。
6. 重解析后玩家不一致会使选择失效。
7. 内外比赛 ID 不一致时任务失败且错误缓存被清理。
8. Patch 来源优先级为 OpenDota、缓存、时间窗口、未知。
9. Patch 切换不确定窗口输出 `ambiguous`。
10. OpenDota 断网不阻塞本地 Replay。

### 11.2 前端测试

1. `selected_player_slot` 为空时不选择第一位玩家。
2. `manual_required` 打开玩家选择对话框。
3. 确认选择调用 `PUT subject`。
4. 外部槽位 `128-132` 正确映射到内部英雄索引。
5. “我”标记只跟随 `match.subject`。
6. 切换玩家不重置当前时间和 Tab。
7. Patch 四种状态使用正确文案。
8. Patch 门禁影响能够跳到数据覆盖说明。

### 11.3 固定 Replay 验收

| Replay | 账号 | 预期 |
| --- | --- | --- |
| `8909845275` | `139766850` | 自动匹配，不显示选择框 |
| `8894766243` | `99735754` | 不在参赛者中，必须手动选择 |
| `8894766243` | Replay 内有效账号 | 自动匹配对应玩家 |
| 改名后的固定 Replay | 任意 | 内部 ID 不一致时阻断 |
| `.dem.bz2` 固定样本 | 有效账号 | 解压后遵循同一身份门禁 |

## 12. 性能预算

- 手动玩家选择保存：小于 200 ms。
- 切换玩家到报告可见：热缓存小于 500 ms。
- 本地 Replay 不因 OpenDota 补全增加超过 3 秒等待。
- 元数据与 Patch 预扫描不超过完整解析耗时的 10%。
- 切换玩家不得触发 Replay 重新解析。

## 13. 发布验收

0.4.5 发布前必须满足：

1. 账号未匹配时第一位玩家误选次数为 0。
2. 每个个人报告都有明确 `match subject`。
3. 玩家选择重启后仍然存在。
4. 内外比赛 ID 不一致写入错误分析次数为 0。
5. Patch 来源和状态在详情页、覆盖页一致。
6. `ambiguous` / `unknown` 不产生 Patch 依赖的确定性负面评分。
7. `.dem` 和 `.dem.bz2` 均通过导入、取消、解析、选择、重启和卸载冒烟。
8. 前端、桌面端和 Parser 测试全部通过。

## 14. 实施顺序

### P0-A 身份事实源

- `match-subject/1.0`
- `MatchSubjectStore`
- 去除前端第一位玩家兜底
- 玩家选择 API

### P0-B 玩家选择界面

- 解析完成后的身份门禁
- 双方十人选择对话框
- 切换玩家
- 本地持久化回读

### P0-C Replay 身份校验

- 内部比赛 ID 门禁
- 错误缓存清理
- 导入任务错误文案

### P0-D Patch 来源与门禁

- `patch-resolution/1.0`
- 短时在线补全
- 时间窗口推定
- 覆盖页影响说明

### P0-E 发布验证

- 两场固定 Replay
- `.dem.bz2` 样本
- Parser 重启
- 0.4.5 EXE 冒烟
