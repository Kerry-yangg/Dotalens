import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DEFAULT_MATCH_LIMIT,
  MATCH_LIMIT_MAX,
  MATCH_LIMIT_MIN,
  MATCH_LIMIT_STORAGE_KEY,
  normalizeMatchLimit,
  playerMatchesPath,
} from "../../match-list-preferences.js";

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");

test("match list limit defaults to 20 and stays within the supported range", () => {
  assert.equal(DEFAULT_MATCH_LIMIT, 20);
  assert.equal(MATCH_LIMIT_MIN, 1);
  assert.equal(MATCH_LIMIT_MAX, 500);
  assert.equal(normalizeMatchLimit(null), 20);
  assert.equal(normalizeMatchLimit("75"), 75);
  assert.equal(normalizeMatchLimit("0"), 1);
  assert.equal(normalizeMatchLimit("900"), 500);
  assert.equal(normalizeMatchLimit("not-a-number"), 20);
});

test("player match requests include the selected limit", () => {
  assert.equal(playerMatchesPath("123456789", 75), "/players/123456789/matches?limit=75");
  assert.equal(playerMatchesPath("123456789", "invalid"), "/players/123456789/matches?limit=20");
});

test("match count can be edited from the list and account settings", () => {
  assert.match(html, /id="match-limit-input"[^>]*type="number"[^>]*min="1"[^>]*max="500"[^>]*value="20"/);
  assert.match(html, /id="settings-match-limit"[^>]*type="number"[^>]*min="1"[^>]*max="500"[^>]*value="20"/);
  assert.match(html, /id="account-match-range-label"/);
  assert.equal(MATCH_LIMIT_STORAGE_KEY, "dota-lens-match-limit-v1");
  assert.match(app, /MATCH_LIMIT_STORAGE_KEY/);
  assert.match(app, /playerMatchesPath\(normalized,\s*matchLimit\)/);
  assert.match(app, /setMatchLimit\(/);
});

test("empty match guidance follows the selected match count", () => {
  assert.match(app, /data-match-limit-copy/);
  assert.match(app, /querySelectorAll\("\[data-match-limit-copy\]"\)/);
  assert.match(app, /最近最多 \$\{state\.matchLimit\} 场比赛/);
});
