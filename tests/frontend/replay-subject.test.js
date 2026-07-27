import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("analysis gate offers a two-team player chooser and persists selection", () => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");

  assert.match(html, /id="match-subject-dialog"/);
  assert.match(html, /id="match-subject-radiant"/);
  assert.match(html, /id="match-subject-dire"/);
  assert.match(html, /id="match-subject-confirm"/);
  assert.match(app, /\/matches\/\$\{matchId\}\/subject/);
  assert.match(app, /method:\s*"PUT"/);
  assert.match(app, /selectedPlayerIndex/);
  assert.doesNotMatch(app, /Math\.max\(0,\s*HEROES\.findIndex\(\(hero\) => hero\.me\)\)/);
  assert.doesNotMatch(app, /\|\|\s*players\[0\]\s*\|\|/);
  assert.doesNotMatch(app, /analysis\.match\?\.players\?\.\[0\]/);
  assert.match(app, /openMatchSubjectDialog\(analysis,\s*match,\s*\{\s*required:\s*true\s*\}\)/);
});

test("detail header exposes a real switch-player command", () => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");

  assert.match(html, /id="switch-match-subject"/);
  assert.match(app, /switch-match-subject/);
  assert.match(app, /openMatchSubjectDialog/);
});

test("0.4.5 desktop and Parser 1.6.1 versions stay aligned", () => {
  const packageJson = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  const packageLock = JSON.parse(readFileSync(new URL("../../package-lock.json", import.meta.url), "utf8"));
  const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  const desktop = readFileSync(new URL("../../desktop/main.cjs", import.meta.url), "utf8");
  const startScript = readFileSync(new URL("../../tools/Start-DotaLens.ps1", import.meta.url), "utf8");
  const smoke = readFileSync(new URL("../../tools/Invoke-DotaLensExeSmoke.ps1", import.meta.url), "utf8");

  assert.equal(packageJson.version, "0.4.5");
  assert.equal(packageLock.version, "0.4.5");
  assert.equal(packageLock.packages[""].version, "0.4.5");
  assert.match(app, /APP_VERSION = "0\.4\.5"/);
  assert.match(desktop, /PARSER_API_VERSION = "1\.6\.1"/);
  assert.match(startScript, /expectedParserVersion = "1\.6\.1"/);
  assert.match(smoke, /Dota-Lens-Setup-0\.4\.5-x64\.exe/);
  assert.match(smoke, /version = '0\.4\.5'/);
  assert.match(smoke, /status\.version -eq '1\.6\.1'/);
});

test("development launcher can detach the long-running frontend", () => {
  const startScript = readFileSync(new URL("../../tools/Start-DotaLens.ps1", import.meta.url), "utf8");
  const backgroundLauncher = readFileSync(new URL("../../tools/Start-DotaLensBackground.cjs", import.meta.url), "utf8");

  assert.match(startScript, /\[switch\]\$Background/);
  assert.match(startScript, /if \(\$Background\)/);
  assert.match(startScript, /Start-DotaLensBackground\.cjs/);
  assert.match(startScript, /launcher\.stdout\.log/);
  assert.match(startScript, /Background launcher PID:/);
  assert.match(backgroundLauncher, /detached:\s*true/);
  assert.match(backgroundLauncher, /stdio:\s*\["ignore",\s*stdout,\s*stderr\]/);
  assert.match(backgroundLauncher, /child\.unref\(\)/);
});

test("0.4.5 EXE smoke verifies subject identity and persisted manual selection", () => {
  const smoke = readFileSync(new URL("../../tools/Invoke-DotaLensExeSmoke.ps1", import.meta.url), "utf8");

  assert.match(smoke, /subject_auto_matched/);
  assert.match(smoke, /selected_account_id/);
  assert.match(smoke, /\/matches\/\$MatchId\/subject/);
  assert.match(smoke, /method Put/i);
  assert.match(smoke, /manual_selected/);
  assert.match(smoke, /subject_selection_persisted/);
});

test("0.4.5 EXE smoke accepts a real dem or compressed dem.bz2 fixture", () => {
  const smoke = readFileSync(new URL("../../tools/Invoke-DotaLensExeSmoke.ps1", import.meta.url), "utf8");

  assert.match(smoke, /\.dem\.bz2/);
  assert.match(smoke, /fixtureFileName/);
  assert.match(smoke, /importedReplay/);
});
