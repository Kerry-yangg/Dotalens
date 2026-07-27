const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dotaLensDesktop", Object.freeze({
  selectDirectory(options = {}) {
    return ipcRenderer.invoke("dota-lens:select-directory", {
      key: typeof options.key === "string" ? options.key : "directory",
      title: typeof options.title === "string" ? options.title : "选择文件夹",
      defaultPath: typeof options.defaultPath === "string" ? options.defaultPath : "",
      allowCreate: options.allowCreate === true,
    });
  },
  scanReplayDirectory(directory) {
    return ipcRenderer.invoke("dota-lens:scan-replay-directory", {
      directory: typeof directory === "string" ? directory : "",
    });
  },
  importReplayPath(options = {}) {
    return ipcRenderer.invoke("dota-lens:import-replay-path", {
      filePath: typeof options.filePath === "string" ? options.filePath : "",
      matchId: typeof options.matchId === "string" ? options.matchId : "",
      accountId: typeof options.accountId === "string" ? options.accountId : "",
    });
  },
  getUpdateState() {
    return ipcRenderer.invoke("dota-lens:update:get-state");
  },
  checkForUpdates() {
    return ipcRenderer.invoke("dota-lens:update:check");
  },
  downloadUpdate() {
    return ipcRenderer.invoke("dota-lens:update:download");
  },
  installUpdate() {
    return ipcRenderer.invoke("dota-lens:update:install");
  },
  onUpdateState(callback) {
    if (typeof callback !== "function") return;
    ipcRenderer.on("dota-lens:update-state", (_event, state) => callback(state));
  },
}));
