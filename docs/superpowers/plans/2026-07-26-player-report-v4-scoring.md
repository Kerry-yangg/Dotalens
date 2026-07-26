# player-report/4.0 阶段 A 实施计划

> 约束：在当前功能分支增量实施，保留现有未提交改动；不提交、不推送、不发布 Git。

## Task 1：锁定后端评分契约

**文件**

- 新增 `tools/replay-parser/src/test/java/opendota/PlayerReportScoreFormulaV4Test.java`
- 新增 `tools/replay-parser/src/main/java/opendota/PlayerReportScoringV4.java`
- 修改 `tools/replay-parser/src/main/java/opendota/PlayerReportAnalysis.java`

**步骤**

1. 先写三路归责、可重算、去重、单根因 6 分、维度和综合封顶测试。
2. 运行定向测试，确认因类或字段不存在而失败。
3. 实现独立 V4 计分器。
4. 在根因聚合完成后调用计分器，并将协议升级为 `player-report/4.0`。
5. 重跑定向测试。

## Task 2：锁定存储和协议兼容

**文件**

- 修改 `tools/replay-parser/src/test/java/opendota/AnalysisStorageTest.java`
- 按失败结果修改协议校验相关代码

**步骤**

1. 将当前报告协议断言升级为 V4。
2. 验证旧 V3 分析包会触发玩家报告重算。
3. 验证新 V4 模块写入和读取不丢失审计字段。

## Task 3：前端纯函数 TDD

**文件**

- 修改 `tests/frontend/app-core.test.js`
- 修改 `app-core.js`

**步骤**

1. 添加 V4 当前协议识别测试。
2. 添加综合分和维度分本地重算测试。
3. 添加篡改字段时审计失败测试。
4. 实现纯函数，不依赖 DOM。

## Task 4：前端审计下钻

**文件**

- 修改 `tests/frontend/app-core.test.js`
- 修改 `app.js`
- 修改 `styles.css`

**步骤**

1. 先断言综合分入口和审计关键字段存在。
2. 将综合分变为可点击审计入口。
3. 增加综合分审计抽屉。
4. 扩展维度抽屉，显示基础分、修正、最终分及三路组件。
5. 保持现有 Dota Lens 深色、紧凑、工作台式视觉语言。

## Task 5：全量验证

**命令**

- `mvn -Dtest=PlayerReportScoreFormulaV4Test test`
- `mvn test`
- `npm run test:frontend`
- `npm run test:desktop`
- `npm run build`

必须记录通过数量和任何既有风险。

## Task 6：真实 Replay 回归

**样本**

- `C:\Users\44238\Documents\DOTA2\release\8894766243.dem`

**步骤**

1. 使用最新 Parser 重新解析。
2. 对 10 名玩家执行协议校验脚本。
3. 输出路径数量、行为修正范围、去重结果和根因 6 分封顶检查。
4. 将结果写入 PRD 实施记录。

## Task 7：文档回写

**文件**

- 修改 `DOTA-LENS-0.5.0-PLAYER-REPORT-PRODUCTIZATION-PRD.md`

记录完成项、测试证据、真实 Replay 结果和下一阶段未完成事项。

