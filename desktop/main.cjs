const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, session } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const APP_SCHEME = "dotalens";
const APP_URL = `${APP_SCHEME}://app/`;
const API_STATUS_URL = "http://127.0.0.1:5600/api/status";
const qaCapturePath = process.env.DOTA_LENS_QA_CAPTURE ? path.resolve(process.env.DOTA_LENS_QA_CAPTURE) : null;
const qaViews = new Set(["development", "farm", "vision", "combat", "players", "goldens", "settings"]);
const qaView = qaViews.has(process.env.DOTA_LENS_QA_VIEW) ? process.env.DOTA_LENS_QA_VIEW : "farm";
const qaMatchId = /^\d+$/.test(process.env.DOTA_LENS_QA_MATCH_ID || "") ? process.env.DOTA_LENS_QA_MATCH_ID : null;
const qaWidth = Math.max(1024, Number.parseInt(process.env.DOTA_LENS_QA_WIDTH || "1460", 10) || 1460);
const qaHeight = Math.max(720, Number.parseInt(process.env.DOTA_LENS_QA_HEIGHT || "920", 10) || 920);
const qaMapFocus = process.env.DOTA_LENS_QA_MAP_FOCUS === "1";
const qaGoldenTimeMs = Number.parseInt(process.env.DOTA_LENS_QA_GOLDEN_TIME_MS || "", 10);
const qaAddGoldenEvent = process.env.DOTA_LENS_QA_ADD_GOLDEN_EVENT === "1";
const qaScoreboardStress = process.env.DOTA_LENS_QA_SCOREBOARD_STRESS === "1";
const qaDirectoryPickers = process.env.DOTA_LENS_QA_DIRECTORY_PICKERS === "1";
const qaDirectoryRoot = process.env.DOTA_LENS_QA_DIRECTORY_ROOT || "C:\\Dota Lens QA";
const qaSettingsPanel = new Set(["account", "dota", "parser", "data", "display", "diagnostics"]).has(process.env.DOTA_LENS_QA_SETTINGS_PANEL)
  ? process.env.DOTA_LENS_QA_SETTINGS_PANEL
  : "dota";

if (qaCapturePath) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-gpu-sandbox");
  app.commandLine.appendSwitch("in-process-gpu");
  app.setPath("userData", path.join(process.env.TEMP || __dirname, `dota-lens-electron-qa-${process.pid}`));
}

let mainWindow = null;
let parserProcess = null;
let ownsParser = false;

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
      data: path.join(app.getPath("userData"), "data"),
    };
  }
  return {
    java: projectPath("tools", "runtime", "jdk-21", "bin", "java.exe"),
    jar: projectPath("tools", "replay-parser", "target", "stats-0.1.0.jar"),
    data: projectPath("tools", "runtime", "dota-lens-data"),
  };
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

async function ensureParser() {
  console.error("[desktop] checking local parser");
  if (await parserStatus()) {
    console.error("[desktop] reusing ready parser");
    return;
  }

  const paths = runtimePaths();
  if (!fs.existsSync(paths.java) || !fs.existsSync(paths.jar)) {
    throw new Error(`解析器运行文件缺失。\nJava: ${paths.java}\nParser: ${paths.jar}`);
  }
  fs.mkdirSync(paths.data, { recursive: true });
  const logs = path.join(paths.data, "logs");
  fs.mkdirSync(logs, { recursive: true });
  const stdout = fs.openSync(path.join(logs, "parser.stdout.log"), "a");
  const stderr = fs.openSync(path.join(logs, "parser.stderr.log"), "a");

  parserProcess = spawn(paths.java, ["-Djava.net.preferIPv4Stack=true", "-Xmx2g", "-jar", paths.jar], {
    cwd: path.dirname(paths.jar),
    env: { ...process.env, DOTA_LENS_DATA_DIR: paths.data },
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
      const activePanelSelector = qaView === "goldens"
        ? "#page-goldens.active #golden-workspace:not(.hidden)"
        : qaView === "settings"
          ? "#page-settings.active"
          : `[data-detail-panel="${qaView}"].active`;
      const readinessAttempts = qaView === "goldens" || qaMatchId ? 200 : 50;
      for (let attempt = 0; attempt < readinessAttempts; attempt += 1) {
        const ready = await mainWindow.webContents.executeJavaScript(
          qaView === "goldens"
            ? `Boolean(document.querySelector(${JSON.stringify(activePanelSelector)})) && Boolean(document.querySelector('#golden-match-select')?.value)`
            : qaMatchId
              ? `Boolean(document.querySelector(${JSON.stringify(activePanelSelector)})) && document.documentElement.dataset.qaMatchLoaded === ${JSON.stringify(qaMatchId)}`
              : `Boolean(document.querySelector(${JSON.stringify(activePanelSelector)}))`,
        );
        if (ready) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (qaView === "goldens" && Number.isFinite(qaGoldenTimeMs)) {
        await mainWindow.webContents.executeJavaScript(`(() => {
          const slider = document.querySelector('#golden-time-slider');
          if (!slider) return;
          slider.value = ${qaGoldenTimeMs};
          slider.dispatchEvent(new Event('input', { bubbles: true }));
          ${qaAddGoldenEvent ? "document.querySelector('#golden-add-event')?.click();" : ""}
        })()`);
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
      await new Promise((resolve) => setTimeout(resolve, qaView === "goldens" ? 1200 : 300));
      mainWindow.setOpacity(0);
      mainWindow.showInactive();
      mainWindow.webContents.invalidate();
      await mainWindow.webContents.executeJavaScript("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
      await new Promise((resolve) => setTimeout(resolve, 250));
      const metrics = await mainWindow.webContents.executeJavaScript(`(() => {
        const selectors = [
          '#detail-farm', '.farm-main-layout', '.farm-map-panel', '.farm-map-canvas', '.farm-diagnosis-panel',
          '#detail-development', '.development-layout', '.lane-review',
          '#detail-vision', '.ward-main-layout', '.ward-map-panel', '.ward-browser-panel', '.ward-inspector-panel',
          '#detail-combat', '.combat-layout', '.combat-map-panel', '.combat-map-canvas',
          '.combat-vision-panel', '.combat-contribution-panel', '.combat-inspector-panel',
          '#page-goldens', '.golden-toolbar', '.golden-workspace', '.golden-event-panel',
          '.golden-stage-panel', '.golden-map-canvas', '.golden-inspector-panel',
          '.golden-playback-row', '.golden-density-toolbar', '.golden-window-track',
          '.golden-signal-list', '.golden-evaluation-panel', '#golden-density-canvas',
          '#golden-review-start', '#golden-contact-start', '#golden-peak-time', '#golden-contact-end',
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
    ? `${APP_URL}?preview=${qaView}${qaMatchId ? `&qaMatch=${qaMatchId}` : ""}${qaMapFocus ? "&mapFocus=1" : ""}${qaScoreboardStress ? "&scoreboardStress=1" : ""}${qaView === "settings" ? `&settingsPanel=${qaSettingsPanel}` : ""}`
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
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    installAppProtocol();
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
