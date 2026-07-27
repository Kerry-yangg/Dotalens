import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const htmlSource = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

test("sidebar exposes a first-class usage guide page", () => {
  assert.match(htmlSource, /class="nav-item nav-item-help" data-page="help"/);
  assert.match(htmlSource, /<span>使用说明<\/span>/);
  assert.match(htmlSource, /id="page-help"[^>]*data-page-panel="help"/);
  assert.match(appSource, /help:\s*\["使用说明",\s*"三分钟上手 Dota Lens"\]/);
  assert.match(stylesSource, /\.help-layout\s*\{/);
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

test("account input consistently uses the Dota 2 game ID name", () => {
  assert.match(htmlSource, /<small>Dota 2 游戏 ID<\/small>/);
  assert.match(htmlSource, /placeholder="输入 Dota 2 游戏 ID"/);
  assert.match(htmlSource, /aria-label="Dota 2 游戏 ID"/);
  assert.doesNotMatch(htmlSource, /Steam 32 位数字 ID/);
  assert.doesNotMatch(htmlSource, />Steam 数字 ID</);
  assert.doesNotMatch(appSource, /Steam 数字 ID|Steam ID \$\{/);
  assert.match(appSource, /请输入 1 到 10 位 Dota 2 游戏 ID/);
});
