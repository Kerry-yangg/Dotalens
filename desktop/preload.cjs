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
}));
