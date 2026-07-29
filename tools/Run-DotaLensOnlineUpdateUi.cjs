"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { _electron: electron } = require("playwright");

const executable = process.env.DOTA_LENS_UPDATE_E2E_EXECUTABLE;
const reportPath = process.env.DOTA_LENS_UPDATE_E2E_UI_REPORT;
const screenshotDirectory = process.env.DOTA_LENS_UPDATE_E2E_SCREENSHOTS;
const expectedVersion = process.env.DOTA_LENS_UPDATE_E2E_EXPECTED_VERSION || "";
const mode = process.env.DOTA_LENS_UPDATE_E2E_MODE || "full";

if (!executable || !reportPath || !screenshotDirectory) {
  throw new Error("Missing Dota Lens online-update E2E environment");
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.mkdirSync(screenshotDirectory, { recursive: true });

const result = {
  schema: "dota-lens-online-update-ui/1.0",
  mode,
  executable,
  expected_version: expectedVersion || null,
  started_at: new Date().toISOString(),
  completed_at: null,
  status: "running",
  states: [],
  screenshots: [],
  main_process: {
    pid: null,
    stdout: [],
    stderr: [],
  },
  error: null,
};

function persist() {
  fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function recordMainLog(stream, value) {
  const rows = String(value || "")
    .split(/\r?\n/)
    .map((row) => row.trimEnd())
    .filter(Boolean);
  if (rows.length === 0) return;
  result.main_process[stream].push(...rows);
  result.main_process[stream] = result.main_process[stream].slice(-200);
  persist();
}

async function readUpdateState(page) {
  return page.evaluate(async () => {
    if (!window.dotaLensDesktop?.getUpdateState) return null;
    return window.dotaLensDesktop.getUpdateState();
  });
}

function recordState(state) {
  if (!state) return;
  const previous = result.states.at(-1);
  const snapshot = {
    observed_at: new Date().toISOString(),
    status: state.status || null,
    current_version: state.currentVersion || null,
    latest_version: state.latestVersion || null,
    progress: state.progress ?? null,
    transferred: state.transferred ?? null,
    total: state.total ?? null,
    error_code: state.errorCode || null,
    error_message: state.errorMessage || null,
  };
  const changed = !previous
    || previous.status !== snapshot.status
    || previous.latest_version !== snapshot.latest_version
    || previous.error_code !== snapshot.error_code
    || Math.floor(Number(previous.progress || 0) / 5) !== Math.floor(Number(snapshot.progress || 0) / 5);
  if (changed) {
    result.states.push(snapshot);
    persist();
  }
}

async function waitForState(page, accepted, timeoutMilliseconds) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    const state = await readUpdateState(page);
    recordState(state);
    if (state?.status === "error") {
      throw new Error(`${state.errorCode || "update_failed"}: ${state.errorMessage || ""}`.trim());
    }
    if (accepted.includes(state?.status)) return state;
    await sleep(500);
  }
  throw new Error(`Timed out waiting for update state: ${accepted.join(", ")}`);
}

async function capture(page, name) {
  const target = path.join(screenshotDirectory, `${name}.png`);
  await page.screenshot({ path: target, fullPage: true });
  result.screenshots.push(target);
  persist();
}

async function openUpdateCenter(page) {
  await page.locator('button[data-page="settings"]').click();
  await page.locator('button[data-settings-panel="updates"]').click();
  await page.locator("#settings-updates").waitFor({ state: "visible" });
}

async function run() {
  let electronApp;
  try {
    electronApp = await electron.launch({
      executablePath: executable,
      env: { ...process.env },
      timeout: 60000,
    });
    const mainProcess = electronApp.process();
    result.main_process.pid = mainProcess.pid;
    mainProcess.stdout?.on("data", (chunk) => recordMainLog("stdout", chunk));
    mainProcess.stderr?.on("data", (chunk) => recordMainLog("stderr", chunk));
    persist();
    const page = await electronApp.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.locator(".app-shell").waitFor({ state: "visible", timeout: 60000 });
    await openUpdateCenter(page);

    recordState(await readUpdateState(page));
    await capture(page, "01-before-check");

    const initial = await readUpdateState(page);
    if (!["checking", "available", "downloading", "downloaded"].includes(initial?.status)) {
      await page.locator("#update-check").click();
    }

    const checked = await waitForState(
      page,
      mode === "preflight" ? ["up_to_date", "available"] : ["available"],
      120000,
    );
    await capture(page, "02-after-check");

    if (mode === "preflight") {
      result.status = checked.status === "up_to_date" ? "passed" : "unexpected_update";
      result.completed_at = new Date().toISOString();
      persist();
      await electronApp.close();
      return;
    }

    if (expectedVersion && checked.latestVersion !== expectedVersion) {
      throw new Error(`Expected update ${expectedVersion}, received ${checked.latestVersion}`);
    }

    await page.locator("#update-download").click();
    const downloaded = await waitForState(page, ["downloaded"], 900000);
    if (expectedVersion && downloaded.latestVersion !== expectedVersion) {
      throw new Error(`Downloaded ${downloaded.latestVersion}, expected ${expectedVersion}`);
    }
    await capture(page, "03-downloaded");

    const closed = electronApp.waitForEvent("close", { timeout: 180000 });
    await page.locator("#update-install").click();
    await closed;
    electronApp = null;

    result.status = "install_started";
    result.completed_at = new Date().toISOString();
    persist();
  } catch (error) {
    if (electronApp) {
      try {
        const pages = electronApp.windows();
        if (pages.length > 0) {
          await capture(pages[0], "99-failure");
        }
      } catch {
        // Preserve the original updater failure when the window has already closed.
      }
    }
    result.status = "failed";
    result.error = {
      name: error?.name || "Error",
      message: error?.message || String(error),
      stack: error?.stack || null,
    };
    result.completed_at = new Date().toISOString();
    persist();
    if (electronApp) {
      try {
        await electronApp.close();
      } catch {
        // The updater may already have closed the application.
      }
    }
    process.exitCode = 1;
  }
}

persist();
void run();
