const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const {
  createUpdateController,
  normalizeReleaseNotes,
} = require("../../desktop/updater.cjs");

class FakeUpdater extends EventEmitter {
  constructor() {
    super();
    this.checkCalls = 0;
    this.downloadCalls = 0;
    this.installCalls = 0;
    this.installArguments = [];
  }

  async checkForUpdates() {
    this.checkCalls += 1;
    this.emit("checking-for-update");
    return { updateInfo: null };
  }

  async downloadUpdate() {
    this.downloadCalls += 1;
    return [];
  }

  quitAndInstall(...arguments_) {
    this.installCalls += 1;
    this.installArguments.push(arguments_);
  }
}

test("packaged updater exposes available, progress, and downloaded states", async () => {
  const updater = new FakeUpdater();
  const published = [];
  const controller = createUpdateController({
    updater,
    currentVersion: "0.4.5",
    isPackaged: true,
    distribution: "nsis",
    publishState: (state) => published.push(state),
  });

  await controller.check();
  assert.equal(updater.checkCalls, 1);
  assert.equal(controller.getState().status, "checking");

  updater.emit("update-available", {
    version: "0.5.0",
    releaseName: "Dota Lens 0.5.0",
    releaseNotes: "<b>玩家报告升级</b>",
    releaseDate: "2026-07-27T12:00:00Z",
  });
  assert.deepEqual(controller.getState(), {
    status: "available",
    currentVersion: "0.4.5",
    latestVersion: "0.5.0",
    releaseName: "Dota Lens 0.5.0",
    releaseNotes: "玩家报告升级",
    releaseDate: "2026-07-27T12:00:00Z",
    progress: null,
    bytesPerSecond: null,
    transferred: null,
    total: null,
    distribution: "nsis",
    errorCode: null,
    errorMessage: null,
  });

  await controller.download();
  assert.equal(updater.downloadCalls, 1);
  updater.emit("download-progress", {
    percent: 48.28,
    bytesPerSecond: 1048576,
    transferred: 5242880,
    total: 10485760,
  });
  assert.equal(controller.getState().status, "downloading");
  assert.equal(controller.getState().progress, 48.3);

  updater.emit("update-downloaded", {
    version: "0.5.0",
    releaseNotes: "下载完成",
  });
  assert.equal(controller.getState().status, "downloaded");
  assert.ok(published.length >= 4);
});

test("install waits while Replay parser has active jobs", async () => {
  const updater = new FakeUpdater();
  let parserBusy = true;
  let parserStops = 0;
  const controller = createUpdateController({
    updater,
    currentVersion: "0.4.5",
    isPackaged: true,
    distribution: "nsis",
    isParserBusy: async () => parserBusy,
    stopParser: async () => { parserStops += 1; },
  });
  updater.emit("update-downloaded", { version: "0.5.0" });

  const blocked = await controller.install();
  assert.deepEqual(blocked, { ok: false, reason: "parser_busy" });
  assert.equal(controller.getState().status, "waiting_for_parser");
  assert.equal(updater.installCalls, 0);
  assert.equal(parserStops, 0);

  parserBusy = false;
  const installed = await controller.install();
  assert.deepEqual(installed, { ok: true });
  assert.equal(parserStops, 1);
  assert.equal(updater.installCalls, 1);
  assert.deepEqual(updater.installArguments, [[true, true]]);
  assert.equal(controller.getState().status, "installing");
});

test("development and portable builds never call the NSIS updater", async () => {
  const updater = new FakeUpdater();
  const development = createUpdateController({
    updater,
    currentVersion: "0.4.5",
    isPackaged: false,
    distribution: "development",
  });
  const portable = createUpdateController({
    updater,
    currentVersion: "0.4.5",
    isPackaged: true,
    distribution: "portable",
  });

  assert.deepEqual(await development.check(), { ok: false, reason: "development" });
  assert.deepEqual(await portable.check(), { ok: false, reason: "portable" });
  assert.equal(updater.checkCalls, 0);
  assert.equal(development.getState().status, "development");
  assert.equal(portable.getState().status, "portable");
});

test("release notes are converted to bounded plain text", () => {
  assert.equal(normalizeReleaseNotes("<p>修复 <strong>解析</strong></p>"), "修复 解析");
  assert.equal(normalizeReleaseNotes([{ note: "<b>A</b>" }, { note: "B" }]), "A\nB");
  assert.equal(normalizeReleaseNotes("x".repeat(5000)).length, 4000);
});
