import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const htmlSource = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
const helpImagePaths = [
  "../../public/assets/help/help-step-account.png",
  "../../public/assets/help/help-step-parse.png",
  "../../public/assets/help/help-step-report.png",
];

test("sidebar exposes a first-class usage guide page", () => {
  assert.match(htmlSource, /class="nav-item nav-item-help(?: active)?" data-page="help"/);
  assert.match(htmlSource, /<span>使用说明<\/span>/);
  assert.match(htmlSource, /id="page-help"[^>]*data-page-panel="help"/);
  assert.match(appSource, /help:\s*\["使用说明",\s*"三分钟上手 Dota Lens"\]/);
  assert.match(stylesSource, /\.help-layout\s*\{/);
});

test("usage guide is the default page on a normal app launch", () => {
  assert.match(htmlSource, /class="nav-item nav-item-help active" data-page="help"/);
  assert.match(htmlSource, /id="page-help" class="page active" data-page-panel="help"/);
  assert.doesNotMatch(htmlSource, /id="page-matches" class="page active"/);
  assert.match(appSource, /page:\s*"help"/);
  assert.match(appSource, /setupCombatChartResizeObserver\(\);\s*setPage\("help"\);/);
});

test("usage guide explains the complete basic workflow in plain Chinese", () => {
  assert.match(htmlSource, /输入 Dota 2 游戏 ID/);
  assert.match(htmlSource, /选择比赛并确认解析/);
  assert.match(htmlSource, /打开复盘/);
  assert.match(htmlSource, /简明模式/);
  assert.match(htmlSource, /专业模式/);
  assert.match(htmlSource, /手动导入 Replay/);
  assert.match(htmlSource, /本地解析器/);
  assert.match(htmlSource, /查看这一波/);
});

test("missing match guidance explains public match data and local Replay fallback", () => {
  assert.match(htmlSource, /开启“公开比赛数据”/);
  assert.match(htmlSource, /OpenDota 无法读取近期比赛/);
  assert.match(htmlSource, /手动导入 Replay 文件/);
});

test("usage guide embeds three real operation screenshots with zoom support", () => {
  for (const relativePath of helpImagePaths) {
    assert.equal(existsSync(new URL(relativePath, import.meta.url)), true, `${relativePath} must exist`);
  }
  assert.match(htmlSource, /class="help-screenshot-grid"/);
  assert.match(htmlSource, /src="\/assets\/help\/help-step-account\.png"/);
  assert.match(htmlSource, /src="\/assets\/help\/help-step-parse\.png"/);
  assert.match(htmlSource, /src="\/assets\/help\/help-step-report\.png"/);
  assert.match(htmlSource, /id="help-image-dialog"/);
  assert.match(appSource, /function openHelpImageDialog\(/);
  assert.match(appSource, /data-help-image/);
  assert.match(stylesSource, /\.help-screenshot-grid\s*\{/);
});

test("account input consistently uses the Dota 2 game ID name", () => {
  assert.match(htmlSource, /<small>Dota 2 游戏 ID<\/small>/);
  assert.match(htmlSource, /placeholder="输入 Dota 2 游戏 ID"/);
  assert.match(htmlSource, /aria-label="Dota 2 游戏 ID"/);
  assert.doesNotMatch(htmlSource, /Steam 32 位数字 ID/);
  assert.doesNotMatch(htmlSource, />Steam 数字 ID</);
  assert.doesNotMatch(appSource, /Steam 数字 ID|Steam ID \$\{/);
  assert.match(appSource, /请输入 1 到 10 位 Dota 2 游戏 ID/);
});

test("account guidance does not expose a concrete player ID", () => {
  assert.match(htmlSource, /通常为 8 至 10 位数字/);
  assert.doesNotMatch(htmlSource, /例如\s*\d{6,}/);
});
