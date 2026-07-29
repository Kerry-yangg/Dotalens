const UPDATE_STATUS_META = Object.freeze({
  idle: {
    title: "准备检查更新",
    detail: "Dota Lens 会在启动后自动检查稳定版更新。",
    tone: "neutral",
    icon: "cloud-download",
  },
  checking: {
    title: "正在检查新版本",
    detail: "正在连接 GitHub Releases，请稍候。",
    tone: "working",
    icon: "loader-circle",
  },
  up_to_date: {
    title: "当前已是最新版",
    detail: "本机版本与稳定发布版本一致。",
    tone: "positive",
    icon: "circle-check",
  },
  available: {
    title: "发现新版本",
    detail: "查看更新内容后即可开始下载。",
    tone: "attention",
    icon: "sparkles",
  },
  downloading: {
    title: "正在下载更新",
    detail: "可以继续使用 Dota Lens，下载不会中断当前页面。",
    tone: "working",
    icon: "cloud-download",
  },
  downloaded: {
    title: "更新已经准备好",
    detail: "重启 Dota Lens 后将完成安装。",
    tone: "positive",
    icon: "package-open",
  },
  waiting_for_parser: {
    title: "等待 Replay 解析结束",
    detail: "当前有解析任务运行，为避免丢失进度，暂不重启安装。",
    tone: "attention",
    icon: "hourglass",
  },
  installing: {
    title: "正在重启安装",
    detail: "Dota Lens 即将关闭并完成更新。",
    tone: "working",
    icon: "rotate-cw",
  },
  error: {
    title: "暂时无法完成更新",
    detail: "核心功能不受影响，可以稍后重新检查。",
    tone: "negative",
    icon: "circle-alert",
  },
  development: {
    title: "开发预览模式",
    detail: "浏览器预览不会连接正式更新源，可使用模拟状态审核流程。",
    tone: "neutral",
    icon: "construction",
  },
  portable: {
    title: "便携版需要手动替换",
    detail: "发现新版后会提供下载，不会自动覆盖正在运行的文件。",
    tone: "neutral",
    icon: "file-archive",
  },
  unsupported: {
    title: "当前版本不支持在线安装",
    detail: "请下载新版安装包，后续版本即可在应用内更新。",
    tone: "negative",
    icon: "circle-alert",
  },
});

function boundedProgress(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(Math.max(0, Math.min(100, number)) * 10) / 10;
}

export function createPreviewUpdateState(status = "available", currentVersion = "0.4.5") {
  const normalized = UPDATE_STATUS_META[status] ? status : "available";
  const hasRelease = ["available", "downloading", "downloaded", "waiting_for_parser", "installing"].includes(normalized);
  return {
    status: normalized,
    currentVersion,
    latestVersion: hasRelease ? "0.5.1" : normalized === "up_to_date" ? currentVersion : null,
    releaseName: hasRelease ? "Dota Lens 0.5.1" : null,
    releaseNotes: hasRelease
      ? "修复部分新录像无法解压的问题\n兼容 BZip2 与 Zstandard Replay\n加固玩家报告关键时刻渲染"
      : "",
    releaseDate: hasRelease ? "2026-07-29T12:00:00Z" : null,
    progress: normalized === "downloading" ? 36.8 : normalized === "downloaded" ? 100 : null,
    bytesPerSecond: normalized === "downloading" ? 1572864 : null,
    transferred: normalized === "downloading" ? 73400320 : null,
    total: normalized === "downloading" ? 199229440 : null,
    distribution: "nsis",
    errorCode: normalized === "error" ? "update_feed_unavailable" : null,
    errorMessage: normalized === "error" ? "暂时无法连接更新服务，请稍后重试。" : null,
  };
}

export function createUpdateViewModel(input = {}) {
  const status = UPDATE_STATUS_META[input.status] ? input.status : "idle";
  const meta = UPDATE_STATUS_META[status];
  const progressValue = boundedProgress(input.progress);
  const latestVersion = input.latestVersion || null;
  const releaseNotes = typeof input.releaseNotes === "string" ? input.releaseNotes.slice(0, 4000) : "";
  return {
    status,
    title: meta.title,
    detail: input.errorMessage || meta.detail,
    tone: meta.tone,
    icon: meta.icon,
    currentVersion: String(input.currentVersion || "0.0.0"),
    latestVersion,
    releaseName: input.releaseName || (latestVersion ? `Dota Lens ${latestVersion}` : ""),
    releaseNotes,
    distribution: input.distribution || "development",
    progress: {
      visible: status === "downloading",
      value: progressValue,
      bytesPerSecond: Number(input.bytesPerSecond) || 0,
      transferred: Number(input.transferred) || 0,
      total: Number(input.total) || 0,
    },
    actions: {
      check: {
        visible: !["downloading", "installing"].includes(status),
        disabled: status === "checking",
      },
      download: {
        visible: ["available", "downloading"].includes(status),
        disabled: status !== "available",
      },
      install: {
        visible: ["downloaded", "waiting_for_parser"].includes(status),
        disabled: false,
      },
    },
  };
}
