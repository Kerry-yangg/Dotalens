"use strict";

const UPDATE_STATE_KEYS = [
  "status",
  "currentVersion",
  "latestVersion",
  "releaseName",
  "releaseNotes",
  "releaseDate",
  "progress",
  "bytesPerSecond",
  "transferred",
  "total",
  "distribution",
  "errorCode",
  "errorMessage",
];

function stripMarkup(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function normalizeReleaseNotes(value) {
  const rows = Array.isArray(value)
    ? value.map((item) => typeof item === "string" ? item : item?.note)
    : [value];
  return rows
    .map(stripMarkup)
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000);
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundedProgress(value) {
  const number = finiteNumber(value);
  if (number == null) return null;
  return Math.round(Math.max(0, Math.min(100, number)) * 10) / 10;
}

function safeError(error) {
  const raw = String(error?.code || error?.message || "update_failed");
  const code = /signature|sha|checksum|integrity/i.test(raw)
    ? "update_security_check_failed"
    : /network|fetch|internet|ENOTFOUND|ECONN/i.test(raw)
      ? "update_feed_unavailable"
      : "update_failed";
  const message = code === "update_security_check_failed"
    ? "更新包未通过安全校验，已停止安装。"
    : code === "update_feed_unavailable"
      ? "暂时无法连接更新服务，请稍后重试。"
      : "更新过程中出现错误，请稍后重试。";
  return { code, message };
}

function copyState(state) {
  return Object.fromEntries(UPDATE_STATE_KEYS.map((key) => [key, state[key] ?? null]));
}

function createUpdateController(options = {}) {
  const updater = options.updater || null;
  const isPackaged = options.isPackaged === true;
  const distribution = options.distribution || (isPackaged ? "nsis" : "development");
  const publishState = typeof options.publishState === "function" ? options.publishState : () => {};
  const isParserBusy = typeof options.isParserBusy === "function" ? options.isParserBusy : async () => false;
  const stopParser = typeof options.stopParser === "function" ? options.stopParser : async () => {};
  const schedule = typeof options.schedule === "function" ? options.schedule : setTimeout;
  const supported = isPackaged && distribution === "nsis" && updater;
  const state = {
    status: !isPackaged ? "development" : distribution === "portable" ? "portable" : supported ? "idle" : "unsupported",
    currentVersion: String(options.currentVersion || "0.0.0"),
    latestVersion: null,
    releaseName: null,
    releaseNotes: "",
    releaseDate: null,
    progress: null,
    bytesPerSecond: null,
    transferred: null,
    total: null,
    distribution,
    errorCode: null,
    errorMessage: null,
  };
  let initialCheckTimer = null;

  function publish(patch = {}) {
    Object.assign(state, patch);
    const snapshot = copyState(state);
    publishState(snapshot);
    return snapshot;
  }

  function releasePatch(info = {}) {
    return {
      latestVersion: info.version ? String(info.version) : state.latestVersion,
      releaseName: info.releaseName ? stripMarkup(info.releaseName).slice(0, 160) : state.releaseName,
      releaseNotes: info.releaseNotes == null ? state.releaseNotes : normalizeReleaseNotes(info.releaseNotes),
      releaseDate: info.releaseDate ? String(info.releaseDate) : state.releaseDate,
      errorCode: null,
      errorMessage: null,
    };
  }

  if (updater?.on) {
    updater.on("checking-for-update", () => publish({
      status: "checking",
      progress: null,
      errorCode: null,
      errorMessage: null,
    }));
    updater.on("update-available", (info) => publish({
      status: "available",
      ...releasePatch(info),
      progress: null,
      bytesPerSecond: null,
      transferred: null,
      total: null,
    }));
    updater.on("update-not-available", (info) => publish({
      status: "up_to_date",
      ...releasePatch(info),
      latestVersion: info?.version ? String(info.version) : state.currentVersion,
      progress: null,
    }));
    updater.on("download-progress", (progress = {}) => publish({
      status: "downloading",
      progress: roundedProgress(progress.percent),
      bytesPerSecond: finiteNumber(progress.bytesPerSecond),
      transferred: finiteNumber(progress.transferred),
      total: finiteNumber(progress.total),
      errorCode: null,
      errorMessage: null,
    }));
    updater.on("update-downloaded", (info) => publish({
      status: "downloaded",
      ...releasePatch(info),
      progress: 100,
    }));
    updater.on("error", (error) => {
      const safe = safeError(error);
      publish({
        status: "error",
        errorCode: safe.code,
        errorMessage: safe.message,
      });
    });
  }

  async function check() {
    if (!isPackaged) return { ok: false, reason: "development" };
    if (distribution === "portable") return { ok: false, reason: "portable" };
    if (!supported) return { ok: false, reason: "unsupported" };
    if (["checking", "downloading", "installing"].includes(state.status)) {
      return { ok: false, reason: "busy" };
    }
    publish({
      status: "checking",
      progress: null,
      errorCode: null,
      errorMessage: null,
    });
    try {
      await updater.checkForUpdates();
      return { ok: true };
    } catch (error) {
      const safe = safeError(error);
      publish({ status: "error", errorCode: safe.code, errorMessage: safe.message });
      return { ok: false, reason: safe.code };
    }
  }

  async function download() {
    if (!supported) return { ok: false, reason: state.status };
    if (state.status !== "available") return { ok: false, reason: "not_available" };
    publish({
      status: "downloading",
      progress: 0,
      bytesPerSecond: null,
      transferred: 0,
      total: null,
      errorCode: null,
      errorMessage: null,
    });
    try {
      await updater.downloadUpdate();
      return { ok: true };
    } catch (error) {
      const safe = safeError(error);
      publish({ status: "error", errorCode: safe.code, errorMessage: safe.message });
      return { ok: false, reason: safe.code };
    }
  }

  async function install() {
    if (!supported) return { ok: false, reason: state.status };
    if (!["downloaded", "waiting_for_parser"].includes(state.status)) {
      return { ok: false, reason: "not_downloaded" };
    }
    if (await isParserBusy()) {
      publish({ status: "waiting_for_parser" });
      return { ok: false, reason: "parser_busy" };
    }
    publish({ status: "installing" });
    try {
      await stopParser();
      updater.quitAndInstall(false, true);
      return { ok: true };
    } catch (error) {
      const safe = safeError(error);
      publish({ status: "error", errorCode: safe.code, errorMessage: safe.message });
      return { ok: false, reason: safe.code };
    }
  }

  function scheduleInitialCheck(delayMs = 15000) {
    if (!supported || initialCheckTimer) return false;
    initialCheckTimer = schedule(() => {
      initialCheckTimer = null;
      void check();
    }, Math.max(0, Number(delayMs) || 0));
    return true;
  }

  return Object.freeze({
    getState: () => copyState(state),
    check,
    download,
    install,
    scheduleInitialCheck,
  });
}

module.exports = {
  createUpdateController,
  normalizeReleaseNotes,
};
