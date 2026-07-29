const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, session } = require("electron");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { replayIdentity, scanReplayDirectory } = require("./replay-files.cjs");
const { createUpdateController } = require("./updater.cjs");

const APP_SCHEME = "dotalens";
const APP_URL = `${APP_SCHEME}://app/`;
const API_STATUS_URL = "http://127.0.0.1:5600/api/status";
const API_SHUTDOWN_URL = "http://127.0.0.1:5600/api/shutdown";
const API_BASE_URL = "http://127.0.0.1:5600/api";
const PARSER_API_VERSION = "1.7.0";
const userDataOverride = process.env.DOTA_LENS_USER_DATA_DIR
  ? path.resolve(process.env.DOTA_LENS_USER_DATA_DIR)
  : null;
const parserDataOverride = process.env.DOTA_LENS_DATA_DIR
  ? path.resolve(process.env.DOTA_LENS_DATA_DIR)
  : null;
const qaCapturePath = process.env.DOTA_LENS_QA_CAPTURE ? path.resolve(process.env.DOTA_LENS_QA_CAPTURE) : null;
const qaViews = new Set([
  "matches", "replays", "tasks", "settings",
  "development", "farm", "vision", "combat", "player-score", "players",
]);
const qaView = qaViews.has(process.env.DOTA_LENS_QA_VIEW) ? process.env.DOTA_LENS_QA_VIEW : "farm";
const qaMatchId = /^\d+$/.test(process.env.DOTA_LENS_QA_MATCH_ID || "") ? process.env.DOTA_LENS_QA_MATCH_ID : null;
const qaWidth = Math.max(1024, Number.parseInt(process.env.DOTA_LENS_QA_WIDTH || "1460", 10) || 1460);
const qaHeight = Math.max(720, Number.parseInt(process.env.DOTA_LENS_QA_HEIGHT || "920", 10) || 920);
const qaScoreboardStress = process.env.DOTA_LENS_QA_SCOREBOARD_STRESS === "1";
const qaDirectoryPickers = process.env.DOTA_LENS_QA_DIRECTORY_PICKERS === "1";
const qaDirectoryRoot = process.env.DOTA_LENS_QA_DIRECTORY_ROOT || "C:\\Dota Lens QA";
const qaSettingsPanel = new Set(["account", "display", "dota", "parser", "updates", "diagnostics"]).has(process.env.DOTA_LENS_QA_SETTINGS_PANEL)
  ? process.env.DOTA_LENS_QA_SETTINGS_PANEL
  : "dota";
const qaReadingMode = new Set(["simple", "professional"]).has(process.env.DOTA_LENS_QA_READING_MODE)
  ? process.env.DOTA_LENS_QA_READING_MODE
  : null;
const qaUpdateState = /^[a-z_]+$/.test(process.env.DOTA_LENS_QA_UPDATE_STATE || "")
  ? process.env.DOTA_LENS_QA_UPDATE_STATE
  : null;

if (userDataOverride) {
  app.setPath("userData", userDataOverride);
}

if (qaCapturePath) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-gpu-sandbox");
  app.commandLine.appendSwitch("in-process-gpu");
  if (!userDataOverride) {
    app.setPath("userData", path.join(process.env.TEMP || __dirname, `dota-lens-electron-qa-${process.pid}`));
  }
}

let mainWindow = null;
let parserProcess = null;
let ownsParser = false;
let updateController = null;
const approvedReplayFiles = new Set();

protocol.registerSchemesAsPrivileged([{
  scheme: APP_SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
  },
}]);

function projectPath(...parts) {
  return path.join(__dirname, "..", ...parts);
}

function runtimePaths() {
  if (app.isPackaged) {
    return {
      java: path.join(process.resourcesPath, "jre", "bin", "java.exe"),
      jar: path.join(process.resourcesPath, "parser", "stats-0.1.0.jar"),
      data: parserDataOverride || path.join(app.getPath("userData"), "data"),
    };
  }
  return {
    java: projectPath("tools", "runtime", "jdk-21", "bin", "java.exe"),
    jar: projectPath("tools", "replay-parser", "target", "stats-0.1.0.jar"),
    data: parserDataOverride || projectPath("tools", "runtime", "dota-lens-data"),
  };
}

function discoverPython() {
  const candidates = [];
  if (process.env.DOTA_LENS_PYTHON) candidates.push(process.env.DOTA_LENS_PYTHON);
  if (process.platform === "win32") {
    const located = spawnSync("where.exe", ["python.exe"], {
      encoding: "utf8",
      timeout: 2000,
      windowsHide: true,
    });
    if (located.status === 0) {
      candidates.push(...located.stdout.split(/\r?\n/).filter(Boolean));
    }
  } else {
    candidates.push("python3", "python");
  }

  for (const candidate of [...new Set(candidates)]) {
    const probe = spawnSync(candidate, ["--version"], {
      encoding: "utf8",
      timeout: 2000,
      windowsHide: true,
    });
    if (probe.status === 0 && /^Python 3\./.test(`${probe.stdout}${probe.stderr}`.trim())) {
      return candidate;
    }
  }
  return null;
}

function nearestExistingDirectory(candidate) {
  if (!candidate || typeof candidate !== "string") return undefined;
  let current = path.resolve(candidate);
  while (true) {
    try {
      if (fs.statSync(current).isDirectory()) return current;
    } catch {
      // Walk upward until the dialog has a valid starting directory.
    }
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function registerIpcHandlers() {
  ipcMain.handle("dota-lens:select-directory", async (event, request = {}) => {
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
      throw new Error("目录选择请求来自未知窗口");
    }

    const key = ["dota", "replay", "temp"].includes(request.key) ? request.key : "directory";
    if (qaCapturePath && qaDirectoryPickers) {
      return { canceled: false, filePath: path.join(qaDirectoryRoot, key), source: "qa" };
    }

    const properties = ["openDirectory", "dontAddToRecent"];
    if (request.allowCreate === true) properties.push("createDirectory", "promptToCreate");
    const result = await dialog.showOpenDialog(mainWindow, {
      title: String(request.title || "选择文件夹").slice(0, 80),
      buttonLabel: "选择此文件夹",
      defaultPath: nearestExistingDirectory(request.defaultPath),
      properties,
    });
    return {
      canceled: result.canceled || !result.filePaths[0],
      filePath: result.filePaths[0] || null,
      source: "dialog",
    };
  });

  ipcMain.handle("dota-lens:scan-replay-directory", async (event, request = {}) => {
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
      throw new Error("Replay 扫描请求来自未知窗口");
    }
    const results = scanReplayDirectory(request.directory);
    approvedReplayFiles.clear();
    results.forEach((replay) => approvedReplayFiles.add(path.resolve(replay.filePath)));
    return results;
  });

  ipcMain.handle("dota-lens:import-replay-path", async (event, request = {}) => {
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
      throw new Error("Replay 导入请求来自未知窗口");
    }
    const filePath = path.resolve(String(request.filePath || ""));
    if (!approvedReplayFiles.has(filePath)) {
      throw new Error("请先扫描 Replay 目录，再导入该文件");
    }
    const identity = replayIdentity(path.basename(filePath));
    if (!identity || identity.matchId !== String(request.matchId || "")) {
      throw new Error("Replay 文件名与比赛 ID 不一致");
    }
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size <= 0) throw new Error("Replay 文件为空或不可读取");

    const accountId = /^\d{1,10}$/.test(String(request.accountId || ""))
      ? String(request.accountId)
      : "";
    const response = await fetch(`${API_BASE_URL}/replays/${identity.matchId}/import`, {
      method: "POST",
      body: fs.createReadStream(filePath),
      duplex: "half",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(stat.size),
        "X-Dota-Lens-File-Name": path.basename(filePath),
        "X-Dota-Lens-Account-Id": accountId,
      },
    });
    const text = await response.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`本地解析器返回了无效响应（HTTP ${response.status}）`);
    }
    if (!response.ok) {
      const error = new Error(payload.message || `本地解析器返回 HTTP ${response.status}`);
      error.code = payload.error || "invalid_replay_file";
      throw error;
    }
    return payload;
  });

  ipcMain.handle("dota-lens:update:get-state", (event) => {
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
      throw new Error("更新状态请求来自未知窗口");
    }
    return updateController?.getState() || null;
  });

  ipcMain.handle("dota-lens:update:check", async (event) => {
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
      throw new Error("检查更新请求来自未知窗口");
    }
    return updateController?.check() || { ok: false, reason: "unsupported" };
  });

  ipcMain.handle("dota-lens:update:download", async (event) => {
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
      throw new Error("下载更新请求来自未知窗口");
    }
    return updateController?.download() || { ok: false, reason: "unsupported" };
  });

  ipcMain.handle("dota-lens:update:install", async (event) => {
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
      throw new Error("安装更新请求来自未知窗口");
    }
    return updateController?.install() || { ok: false, reason: "unsupported" };
  });
}

async function parserStatus(timeoutMs = 1200) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(API_STATUS_URL, { signal: controller.signal });
    if (!response.ok) return null;
    const status = await response.json();
    return status?.status === "ready" ? status : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function parserRuntimeIsCurrent(status, jarPath) {
  if (!status || status.version !== PARSER_API_VERSION) return false;
  const startedAt = Date.parse(status.started_at || "");
  let jarModifiedAt = Number.NaN;
  try {
    jarModifiedAt = fs.statSync(jarPath).mtimeMs;
  } catch {
    return false;
  }
  return !Number.isFinite(startedAt) || jarModifiedAt <= startedAt + 2000;
}

async function stopStaleParser(status) {
  if (!status?.graceful_restart || Number(status.active_jobs || 0) > 0) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(API_SHUTDOWN_URL, { method: "POST", signal: controller.signal });
    if (!response.ok) return false;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (!await parserStatus(250)) return true;
  }
  return false;
}

async function ensureParser() {
  console.error("[desktop] checking local parser");
  const paths = runtimePaths();
  const running = await parserStatus();
  if (running) {
    if (parserRuntimeIsCurrent(running, paths.jar)) {
      console.error("[desktop] reusing current parser");
      return;
    }
    console.error(`[desktop] stale parser detected: running=${running.version || "unknown"} expected=${PARSER_API_VERSION}`);
    if (!await stopStaleParser(running)) {
      console.error("[desktop] stale parser is busy or does not support graceful restart; reusing it for this session");
      return;
    }
    console.error("[desktop] stale parser stopped");
  }

  if (!fs.existsSync(paths.java) || !fs.existsSync(paths.jar)) {
    throw new Error(`解析器运行文件缺失。\nJava: ${paths.java}\nParser: ${paths.jar}`);
  }
  fs.mkdirSync(paths.data, { recursive: true });
  const logs = path.join(paths.data, "logs");
  fs.mkdirSync(logs, { recursive: true });
  const stdout = fs.openSync(path.join(logs, "parser.stdout.log"), "a");
  const stderr = fs.openSync(path.join(logs, "parser.stderr.log"), "a");

  const parserEnv = { ...process.env, DOTA_LENS_DATA_DIR: paths.data };
  const python = discoverPython();
  if (python) parserEnv.DOTA_LENS_PYTHON = python;
  parserProcess = spawn(paths.java, ["-Djava.net.preferIPv4Stack=true", "-Xmx2g", "-jar", paths.jar], {
    cwd: path.dirname(paths.jar),
    env: parserEnv,
    windowsHide: true,
    stdio: ["ignore", stdout, stderr],
  });
  console.error(`[desktop] parser spawned: ${parserProcess.pid}`);
  ownsParser = true;
  parserProcess.once("exit", () => {
    fs.closeSync(stdout);
    fs.closeSync(stderr);
    parserProcess = null;
  });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await parserStatus(800)) {
      console.error("[desktop] parser ready");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`本地解析器未能启动。请查看：\n${path.join(logs, "parser.stderr.log")}`);
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return ({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
  })[extension] || "application/octet-stream";
}

function installAppProtocol() {
  const root = path.resolve(projectPath("dist"));
  protocol.handle(APP_SCHEME, (request) => {
    const url = new URL(request.url);
    const relative = decodeURIComponent(url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, ""));
    const filePath = path.resolve(root, relative);
    if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
      return new Response("Forbidden", { status: 403 });
    }
    try {
      const body = fs.readFileSync(filePath);
      return new Response(body, { headers: { "Content-Type": contentType(filePath) } });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}

function createWindow() {
  console.error("[desktop] creating browser window");
  mainWindow = new BrowserWindow({
    width: qaCapturePath ? qaWidth : 1460,
    height: qaCapturePath ? qaHeight : 920,
    minWidth: 1024,
    minHeight: 720,
    show: !qaCapturePath,
    autoHideMenuBar: true,
    backgroundColor: "#101314",
    title: "Dota Lens",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("did-finish-load", async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (qaCapturePath) {
      const pageSelector = {
        matches: "#page-matches.active",
        replays: "#page-replays.active",
        tasks: "#page-tasks.active",
        settings: "#page-settings.active",
      }[qaView];
      const activePanelSelector = pageSelector || `[data-detail-panel="${qaView}"].active`;
      const readinessAttempts = qaMatchId ? 200 : 50;
      for (let attempt = 0; attempt < readinessAttempts; attempt += 1) {
        const ready = await mainWindow.webContents.executeJavaScript(
          qaMatchId
            ? `Boolean(document.querySelector(${JSON.stringify(activePanelSelector)})) && document.documentElement.dataset.qaMatchLoaded === ${JSON.stringify(qaMatchId)}`
            : `Boolean(document.querySelector(${JSON.stringify(activePanelSelector)}))`,
        );
        if (ready) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const contentReadyExpression = {
        "player-score": "Boolean(document.querySelector('.player-score-simple-report, .player-score-overview')) && !document.querySelector('.player-score-module-loading')",
        combat: "Boolean(document.querySelector('#combat-contribution-chart canvas')) && Boolean(document.querySelector('#combat-responsibility-radar canvas, #combat-responsibility-radar.empty'))",
      }[qaView];
      if (contentReadyExpression) {
        for (let attempt = 0; attempt < 200; attempt += 1) {
          if (await mainWindow.webContents.executeJavaScript(contentReadyExpression)) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
      if (qaView === "settings" && qaDirectoryPickers) {
        await mainWindow.webContents.executeJavaScript(`(async () => {
          for (const button of document.querySelectorAll('[data-directory-picker]')) {
            button.click();
            for (let attempt = 0; attempt < 50 && button.classList.contains('is-busy'); attempt += 1) {
              await new Promise((resolve) => setTimeout(resolve, 20));
            }
          }
        })()`);
      }
      await mainWindow.webContents.executeJavaScript(`Promise.all([...document.images]
        .filter((image) => image.src.includes('/assets/heroes/'))
        .map((image) => image.complete ? true : new Promise((resolve) => {
          const done = () => resolve(true);
          image.addEventListener('load', done, { once: true });
          image.addEventListener('error', done, { once: true });
          setTimeout(done, 2000);
        })))`);
      await mainWindow.webContents.executeJavaScript("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
      await new Promise((resolve) => setTimeout(resolve, 300));
      mainWindow.setOpacity(0);
      mainWindow.showInactive();
      mainWindow.webContents.invalidate();
      await mainWindow.webContents.executeJavaScript("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
      await new Promise((resolve) => setTimeout(resolve, 250));
      const metrics = await mainWindow.webContents.executeJavaScript(`(() => {
        const selectors = [
          '#match-subject-dialog',
          '#detail-farm', '.farm-main-layout', '.farm-map-panel', '.farm-map-canvas', '.farm-diagnosis-panel',
          '#detail-development', '.development-layout', '.lane-review',
          '#detail-vision', '.ward-main-layout', '.ward-map-panel', '.ward-browser-panel', '.ward-inspector-panel',
          '#detail-combat', '.combat-layout', '.combat-map-panel', '.combat-map-canvas',
          '.combat-vision-panel', '.combat-contribution-panel', '.combat-inspector-panel',
          '#detail-player-score',
          '#detail-players', '.scoreboard', '.scoreboard-table-scroll', '.scoreboard-table-head', '.scoreboard-row',
          '#page-settings', '.settings-layout', '.settings-content', '#settings-dota', '#settings-parser',
          '#settings-dota-path', '#settings-replay-path', '#settings-temp-path'
        ];
        const rows = {};
        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (!element) continue;
          const box = element.getBoundingClientRect();
          rows[selector] = {
            visible: box.width > 0 && box.height > 0,
            x: Math.round(box.x), y: Math.round(box.y),
            width: Math.round(box.width), height: Math.round(box.height),
            overflowX: element.scrollWidth > element.clientWidth + 1,
            overflowY: element.scrollHeight > element.clientHeight + 1,
            value: element instanceof HTMLInputElement ? element.value : undefined
          };
        }
        const scoreboardHeader = [...document.querySelectorAll('.scoreboard-table-head > span')].map((cell) => {
          const box = cell.getBoundingClientRect();
          return { x: Math.round(box.x), width: Math.round(box.width), text: cell.textContent.trim() };
        });
        const scoreboardRows = [...document.querySelectorAll('.scoreboard-row')].slice(0, 3).map((row) =>
          [...row.children].map((cell) => {
            const box = cell.getBoundingClientRect();
            return { x: Math.round(box.x), width: Math.round(box.width) };
          })
        );
        const alignmentDeltas = scoreboardRows.flatMap((row) => row.map((cell, index) =>
          Math.abs(cell.x - (scoreboardHeader[index]?.x ?? cell.x))
        ));
        const heroImages = [...document.images].filter((image) => image.src.includes('/assets/heroes/'));
        return {
          viewport: [innerWidth, innerHeight],
          rows,
          assets: {
            heroImages: heroImages.length,
            loadedHeroImages: heroImages.filter((image) => image.complete && image.naturalWidth > 0).length,
            brokenHeroImages: heroImages.filter((image) => image.complete && image.naturalWidth === 0).length,
            pendingHeroImages: heroImages.filter((image) => !image.complete).length
          },
          scoreboard: {
            header: scoreboardHeader,
            sampleRows: scoreboardRows,
            maxColumnDelta: alignmentDeltas.length ? Math.max(...alignmentDeltas) : null
          }
        };
      })()`);
      const image = await mainWindow.webContents.capturePage();
      fs.mkdirSync(path.dirname(qaCapturePath), { recursive: true });
      fs.writeFileSync(qaCapturePath, image.toPNG());
      fs.writeFileSync(`${qaCapturePath}.json`, JSON.stringify(metrics, null, 2));
      app.quit();
      return;
    }
    mainWindow.show();
    mainWindow.focus();
    publishUpdateState(updateController?.getState());
    updateController?.scheduleInitialCheck(15000);
    console.error(`[desktop] frontend loaded, visible=${mainWindow.isVisible()}`);
  });
  mainWindow.webContents.on("did-fail-load", (_event, code, description, url) => {
    console.error(`[desktop] frontend failed: ${code} ${description} ${url}`);
  });
  mainWindow.webContents.on("will-navigate", (event, navigationUrl) => {
    if (!navigationUrl.startsWith(APP_URL)) event.preventDefault();
  });
  mainWindow.on("closed", () => { mainWindow = null; });
  const frontendUrl = qaCapturePath
    ? `${APP_URL}?preview=${qaView}${qaMatchId ? `&qaMatch=${qaMatchId}` : ""}${qaScoreboardStress ? "&scoreboardStress=1" : ""}${qaView === "settings" ? `&settingsPanel=${qaSettingsPanel}` : ""}${qaReadingMode ? `&readingMode=${qaReadingMode}` : ""}${qaUpdateState ? `&updateState=${qaUpdateState}` : ""}`
    : APP_URL;
  mainWindow.loadURL(frontendUrl).catch((error) => {
    console.error(`Failed to load ${APP_URL}`, error);
  });
}

function stopOwnedParser() {
  if (ownsParser && parserProcess && !parserProcess.killed) parserProcess.kill();
  parserProcess = null;
  ownsParser = false;
}

function desktopDistribution() {
  if (!app.isPackaged) return "development";
  if (process.env.PORTABLE_EXECUTABLE_FILE || process.env.PORTABLE_EXECUTABLE_DIR) return "portable";
  return "nsis";
}

function publishUpdateState(state) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("dota-lens:update-state", state);
}

function initializeUpdateController() {
  const distribution = desktopDistribution();
  let nativeUpdater = null;
  if (app.isPackaged && distribution === "nsis") {
    try {
      ({ autoUpdater: nativeUpdater } = require("electron-updater"));
      nativeUpdater.autoDownload = false;
      nativeUpdater.autoInstallOnAppQuit = false;
      nativeUpdater.allowPrerelease = false;
      nativeUpdater.logger = console;
    } catch (error) {
      console.error("[desktop] updater unavailable", error);
    }
  }
  updateController = createUpdateController({
    updater: nativeUpdater,
    currentVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    distribution,
    publishState: publishUpdateState,
    isParserBusy: async () => Number((await parserStatus())?.active_jobs || 0) > 0,
    stopParser: async () => stopOwnedParser(),
  });
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    console.error("[desktop] Electron ready");
    app.setAppUserModelId("com.dotalens.desktop");
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    installAppProtocol();
    initializeUpdateController();
    registerIpcHandlers();
    try {
      if (!qaCapturePath) await ensureParser();
      createWindow();
    } catch (error) {
      dialog.showErrorBox("Dota Lens 启动失败", error instanceof Error ? error.message : String(error));
      app.quit();
    }
  });

  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", stopOwnedParser);
}
