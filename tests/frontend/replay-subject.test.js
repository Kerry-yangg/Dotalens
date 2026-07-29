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

test("0.5.0 desktop and Parser 1.7.0 versions stay aligned", () => {
  const packageJson = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  const packageLock = JSON.parse(readFileSync(new URL("../../package-lock.json", import.meta.url), "utf8"));
  const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  const desktop = readFileSync(new URL("../../desktop/main.cjs", import.meta.url), "utf8");
  const startScript = readFileSync(new URL("../../tools/Start-DotaLens.ps1", import.meta.url), "utf8");
  const smoke = readFileSync(new URL("../../tools/Invoke-DotaLensExeSmoke.ps1", import.meta.url), "utf8");

  assert.equal(packageJson.version, "0.5.0");
  assert.equal(packageLock.version, "0.5.0");
  assert.equal(packageLock.packages[""].version, "0.5.0");
  assert.match(app, /APP_VERSION = "0\.5\.0"/);
  assert.match(desktop, /PARSER_API_VERSION = "1\.7\.0"/);
  assert.match(startScript, /expectedParserVersion = "1\.7\.0"/);
  assert.match(smoke, /Dota-Lens-Setup-0\.5\.0-x64\.exe/);
  assert.match(smoke, /version = '0\.5\.0'/);
  assert.match(smoke, /status\.version -eq '1\.7\.0'/);
});

test("development launcher can detach the long-running frontend", () => {
  const startScript = readFileSync(new URL("../../tools/Start-DotaLens.ps1", import.meta.url), "utf8");
  const backgroundLauncher = readFileSync(new URL("../../tools/Start-DotaLensBackground.cjs", import.meta.url), "utf8");

  assert.match(startScript, /\[switch\]\$Background/);
  assert.match(startScript, /\[switch\]\$Foreground/);
  assert.match(startScript, /\$launchDetached = \$Background -or -not \$Foreground/);
  assert.match(startScript, /if \(\$launchDetached\)/);
  assert.match(startScript, /Start-DotaLensBackground\.cjs/);
  assert.match(startScript, /launcher\.stdout\.log/);
  assert.match(startScript, /Background launcher PID:/);
  assert.match(backgroundLauncher, /detached:\s*true/);
  assert.match(backgroundLauncher, /stdio:\s*\["ignore",\s*stdout,\s*stderr\]/);
  assert.match(backgroundLauncher, /"-Foreground"/);
  assert.match(backgroundLauncher, /child\.unref\(\)/);
});

test("0.5.0 EXE smoke verifies subject identity and persisted manual selection", () => {
  const smoke = readFileSync(new URL("../../tools/Invoke-DotaLensExeSmoke.ps1", import.meta.url), "utf8");

  assert.match(smoke, /subject_auto_matched/);
  assert.match(smoke, /selected_account_id/);
  assert.match(smoke, /\/matches\/\$MatchId\/subject/);
  assert.match(smoke, /method Put/i);
  assert.match(smoke, /manual_selected/);
  assert.match(smoke, /subject_selection_persisted/);
});

test("0.5.0 EXE smoke accepts a real dem or compressed dem.bz2 fixture", () => {
  const smoke = readFileSync(new URL("../../tools/Invoke-DotaLensExeSmoke.ps1", import.meta.url), "utf8");

  assert.match(smoke, /\.dem\.bz2/);
  assert.match(smoke, /fixtureFileName/);
  assert.match(smoke, /importedReplay/);
});

test("0.5.0 layout smoke binds a subject and rejects covered analysis views", () => {
  const layoutSmoke = readFileSync(
    new URL("../../tools/Invoke-DotaLensExeLayoutSmoke.ps1", import.meta.url),
    "utf8",
  );
  const desktop = readFileSync(new URL("../../desktop/main.cjs", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

  assert.match(layoutSmoke, /\[int\]\$SubjectSlot/);
  assert.match(layoutSmoke, /\/matches\/\$MatchId\/subject/);
  assert.match(layoutSmoke, /target_visible/);
  assert.match(layoutSmoke, /subject_dialog_closed/);
  assert.match(desktop, /'#match-subject-dialog'/);
  assert.match(desktop, /'#detail-player-score'/);
  assert.match(
    styles,
    /@media \(max-width: 1439px\)[\s\S]*?\.ward-filter-bar\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
  );
  assert.match(
    styles,
    /@media \(max-width: 1439px\)[\s\S]*?\.ward-filter-bar svg\s*\{[\s\S]*?display:\s*none/,
  );
});
