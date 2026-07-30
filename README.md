# Dota Lens

Dota Lens 是一款面向 Dota 2 玩家个人复盘的 Windows 桌面客户端。输入 Dota 2 游戏
数字 ID 后，可读取最近比赛、获取 Replay，并在本机完成逐秒解析和多模块分析。

> 当前版本：`0.5.1`。分析结论用于辅助复盘，不应视为绝对的游戏判断。

[下载 v0.5.1 Windows 安装程序](https://github.com/Kerry-yangg/Dotalens/releases/tag/v0.5.1)

## 主要功能

- 按 Dota 2 游戏数字 ID 读取最近比赛，展示胜负、KDA、补刀、反补、GPM 和 XPM。
- 选择比赛后确认是否复盘，自动请求 Replay 元数据、下载、解压、解析并生成紧凑分析包。
- 查看逐秒英雄状态、位置、经济、经验、补刀、物品栏、技能升级和事件时间轴。
- 提供发育与打钱、眼位、全场地图、出装、战斗团战和逐玩家报告等分析模块。
- 对打钱路线、安全兵线、眼位生命周期、战斗类型和位置职责输出证据、置信度及缺失数据提示。
- 支持解析进度、超时提示、取消任务、失败重试和本地 Replay 缓存。
- 校验 Replay 内部比赛 ID，并为每场比赛持久保存“本人”玩家归属；账号无法自动匹配时可从十名玩家中手动选择。
- 显示 Patch 的确认、按录像时间推断或边界不确定状态，证据不足时关闭依赖 Patch 的负向评分。

## 安装使用

支持 Windows 10/11 x64。普通用户无需单独安装 Node.js、Java 或 Maven。

1. 在 [Releases](https://github.com/Kerry-yangg/Dotalens/releases) 下载
   `Dota-Lens-Setup-0.5.1-x64.exe`。
2. 运行安装程序并选择安装目录。
3. 启动 Dota Lens，输入 Dota 2 个人资料中显示的游戏数字 ID。
4. 选择一场比赛，确认后等待本地解析完成。

### 8500+ Immortal Draft 对局

Valve 不会把 8500+ Immortal Draft 对局列入公开比赛历史或 Web API，Replay 也只向
参赛者开放。这类比赛不能通过 OpenDota 自动获取，但账号本人仍可完整复盘：

1. 在 Dota 2 客户端的比赛历史中下载自己的 Replay。
2. 在 Dota Lens 选择“导入 Replay”，或在设置中选择 Replay 目录后点击“扫描目录”。
3. 选择 `比赛ID.dem` 或 `比赛ID.dem.bz2`，等待本地解析完成。

Dota Lens 会从 Replay 重建比赛 ID、胜负、时长、10 名玩家、英雄和基础数据，再生成
现有发育、视野、战斗与玩家报告。非参赛者无法通过公共接口下载此类 Replay。

安装程序目前未做商业代码签名，Windows SmartScreen 可能显示未知发布者。请只从本仓库的
Release 页面下载，并核对 Release 中公布的 SHA-256。

## 数据与隐私

- 账号 ID 和比赛查询会发送到 OpenDota API。
- 公开比赛的 Replay 会从 OpenDota 返回的 Valve Replay 地址下载。
- 手动导入的 Replay 只会写入本机解析缓存，不会上传到 Dota Lens 的外部服务。
- Replay 解析和产品分析在本机执行，Dota Lens 不额外上传 Replay 或分析结果。
- Replay、压缩后的原始事件和分析摘要保存在 Electron 的本机应用数据目录。
- 项目未接入自有遥测或广告 SDK；OpenDota、Valve CDN 等外部服务适用各自条款。

首次启动不会预填任何账号。账号只在用户完成查询后保存到本机 `localStorage`。

## 当前限制

- 公开比赛列表及自动 Replay 获取依赖 OpenDota；8500+ Immortal Draft 需要参赛者从
  Dota 2 客户端下载 Replay 后手动导入。
- 不同 Dota 2 Patch 的 Replay 字段会变化，地图校准和派生结论需要持续回归验证。
- 连续真实队伍视野、完整逐波兵线和营地状态在部分 Replay 中不可得，产品会显示证据缺口。
- 当前只构建和验证 Windows x64 安装程序，尚未提供 macOS 或 Linux 桌面包。
- `0.5.1` 仍使用 Electron 默认程序图标，后续版本会补充独立品牌图标与代码签名。

## 本地开发

开发环境建议使用：

- PowerShell 7+
- Node.js 22.12+
- JDK 21（包含 `jlink`）
- Maven 3.9+
- Python 3.11+（仅 Replay POC 与 Python 测试需要）

默认构建脚本会从以下本机目录查找工具，这些目录不会提交到 Git：

```text
tools/runtime/jdk-21/
tools/runtime/apache-maven-3.9.12/
```

安装前端依赖并启动开发环境：

```powershell
npm ci
./tools/Build-DotaLensParser.ps1
./tools/Start-DotaLens.ps1
```

验证和打包：

```powershell
npm run build
./tools/Build-DotaLensParser.ps1
python -m unittest discover -s ./tools/replay-poc/tests -v
./tools/Build-DotaLensRuntime.ps1
npm run desktop:dist
```

安装程序输出到 `release/`。该目录、Replay、原始 JSONL、分析缓存和本机运行时均被
`.gitignore` 排除。

## 项目结构

```text
desktop/                 Electron 主进程与安全预加载脚本
public/assets/            地图、英雄及界面运行所需资源
tools/replay-parser/      基于 OpenDota Parser 和 Clarity 的 Java Replay 解析器
tools/replay-poc/         原始 JSONL 解析验证与 Python 测试
app.js                    桌面产品交互和数据渲染
index.html / styles.css   主界面结构与样式
*.md                      PRD、判断逻辑、评估报告和实施路线
```

## 许可与声明

项目自有源代码采用 [MIT License](LICENSE)。OpenDota Parser、Clarity、前端依赖以及
Dota 2 名称、地图、英雄、物品和技能资源具有各自的版权与许可，详见
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

Dota Lens 是非官方社区项目，与 Valve、完美世界或 OpenDota 无隶属、授权或背书关系。
Dota 2 是 Valve Corporation 的商标。
