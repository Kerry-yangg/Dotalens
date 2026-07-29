import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../../app.js", import.meta.url), "utf8");

test("player report renderers share the module-scoped plain-text helper", () => {
  assert.match(appSource, /function playerScorePlainText\(value, fallback = ""\)/);
  assert.doesNotMatch(appSource, /\bplainText\(/);
  assert.match(
    appSource,
    /renderPlayerScoreImportantMoments[\s\S]*playerScorePlainText\(presented\.title/,
  );
});

test("preview captures can select a reading mode before player report render", () => {
  assert.match(appSource, /const PREVIEW_READING_MODE = \["simple", "professional"\]/);
  assert.match(
    appSource,
    /readingModeController\.set\(PREVIEW_READING_MODE, \{ persist: false, render: false \}\)/,
  );
});
