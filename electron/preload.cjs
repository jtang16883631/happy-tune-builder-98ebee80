const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),

  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  installUpdate: () => ipcRenderer.invoke("install-update"),

  onUpdateStatus: (callback) => {
    ipcRenderer.on("update-status", (_event, message) => callback(message));
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on("update-downloaded", (_event, info) => callback(info));
  },

  removeUpdateListeners: () => {
    ipcRenderer.removeAllListeners("update-status");
    ipcRenderer.removeAllListeners("update-downloaded");
  },

  // ─── Offline file system API ────────────────────────────────
  offlineSaveDb: (fileName, dataBase64) =>
    ipcRenderer.invoke("offline-save-db", fileName, dataBase64),
  offlineLoadDb: (fileName) =>
    ipcRenderer.invoke("offline-load-db", fileName),
  offlineListDbs: () =>
    ipcRenderer.invoke("offline-list-dbs"),
  offlineDeleteDb: (fileName) =>
    ipcRenderer.invoke("offline-delete-db", fileName),
  offlineGetPath: () =>
    ipcRenderer.invoke("offline-get-path"),
});

window.addEventListener("DOMContentLoaded", () => {
  console.log("Electron app loaded successfully");
});
