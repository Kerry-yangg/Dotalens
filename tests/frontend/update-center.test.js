import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  createPreviewUpdateState,
  createUpdateViewModel,
} from "../../update-ui.js";

const htmlSource = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
const preloadSource = readFileSync(new URL("../../desktop/preload.cjs", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

test("settings contains a real software update center", () => {
  assert.match(htmlSource, /data-settings-panel="updates"/);
  assert.match(htmlSource, /id="settings-updates"[^>]*data-settings-content="updates"/);
  assert.match(htmlSource, /id="update-current-version"/);
  assert.match(htmlSource, /id="update-check"/);
  assert.match(htmlSource, /id="update-download"/);
  assert.match(htmlSource, /id="update-install"/);
  assert.match(htmlSource, /id="update-progress"/);
  assert.match(stylesSource, /\.update-center\s*\{/);
});

test("available, downloading, and downloaded updates expose the right action", () => {
  const available = createUpdateViewModel(createPreviewUpdateState("available", "0.4.5"));
  assert.equal(available.actions.download.visible, true);
  assert.equal(available.actions.install.visible, false);

  const downloading = createUpdateViewModel({
    ...createPreviewUpdateState("available", "0.4.5"),
    status: "downloading",
    progress: 42.5,
  });
  assert.equal(downloading.progress.visible, true);
  assert.equal(downloading.progress.value, 42.5);
  assert.equal(downloading.actions.download.disabled, true);

  const downloaded = createUpdateViewModel({
    ...createPreviewUpdateState("available", "0.4.5"),
    status: "downloaded",
  });
  assert.equal(downloaded.actions.install.visible, true);
  assert.equal(downloaded.actions.download.visible, false);
});

test("renderer and preload expose check, download, install, and state updates", () => {
  assert.match(preloadSource, /getUpdateState\(\)/);
  assert.match(preloadSource, /checkForUpdates\(\)/);
  assert.match(preloadSource, /downloadUpdate\(\)/);
  assert.match(preloadSource, /installUpdate\(\)/);
  assert.match(preloadSource, /onUpdateState\(callback\)/);
  assert.match(appSource, /function renderUpdateCenter\(/);
  assert.match(appSource, /function setupUpdateCenter\(/);
  assert.match(appSource, /PREVIEW_UPDATE_STATE/);
  assert.match(appSource, /\.textContent\s*=\s*viewModel\.releaseNotes/);
});

test("packaging declares the public GitHub update provider", () => {
  assert.equal(typeof packageJson.dependencies["electron-updater"], "string");
  assert.deepEqual(packageJson.build.publish, [{
    provider: "github",
    owner: "Kerry-yangg",
    repo: "Dotalens",
  }]);
});
