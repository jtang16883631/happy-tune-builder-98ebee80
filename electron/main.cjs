const { app, BrowserWindow, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require("fs");

// Disable GPU acceleration for better compatibility
app.disableHardwareAcceleration();

let mainWindow;

// ─── Offline templates folder ──────────────────────────────────
function getOfflineDir() {
  const dir = path.join(app.getPath("userData"), "offline_templates");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
    icon: path.join(__dirname, "../public/favicon.ico"),
    titleBarStyle: "default",
    show: false,
  });

  // Show window when ready
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Load the app
  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:8080");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Auto-updater configuration
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

// Auto-updater events
autoUpdater.on("checking-for-update", () => {
  sendStatusToWindow("Checking for updates...");
});

autoUpdater.on("update-available", () => {
  sendStatusToWindow("Update available! Downloading...");
});

autoUpdater.on("update-not-available", () => {
  sendStatusToWindow("App is up to date.");
});

autoUpdater.on("error", (err) => {
  sendStatusToWindow("Error checking for updates: " + err);
});

autoUpdater.on("download-progress", (progressObj) => {
  let message = `Download speed: ${progressObj.bytesPerSecond}`;
  message += ` - Downloaded ${progressObj.percent.toFixed(1)}%`;
  message += ` (${progressObj.transferred}/${progressObj.total})`;
  sendStatusToWindow(message);
});

autoUpdater.on("update-downloaded", (info) => {
  sendStatusToWindow("Update downloaded. Will install on restart.");
  if (mainWindow) {
    mainWindow.webContents.send("update-downloaded", info);
  }
});

function sendStatusToWindow(text) {
  if (mainWindow) {
    mainWindow.webContents.send("update-status", text);
  }
  console.log(text);
}

// ─── IPC: Auto-updater ──────────────────────────────────────────
ipcMain.handle("check-for-updates", async () => {
  try {
    return await autoUpdater.checkForUpdates();
  } catch (error) {
    console.error("Update check failed:", error);
    return null;
  }
});

ipcMain.handle("install-update", () => {
  autoUpdater.quitAndInstall(false, true);
});

ipcMain.handle("get-app-version", () => {
  return app.getVersion();
});

// ─── IPC: Offline file system ───────────────────────────────────

// Save a SQLite .db file to the offline folder
ipcMain.handle("offline-save-db", async (_event, fileName, dataBase64) => {
  try {
    const filePath = path.join(getOfflineDir(), fileName);
    const buffer = Buffer.from(dataBase64, "base64");
    fs.writeFileSync(filePath, buffer);
    const stats = fs.statSync(filePath);
    console.log(`[OfflineFS] Saved ${fileName} (${(stats.size / 1024).toFixed(0)} KB)`);
    return { success: true, size: stats.size };
  } catch (err) {
    console.error("[OfflineFS] Save error:", err);
    return { success: false, error: err.message };
  }
});

// Load a SQLite .db file from the offline folder (returns base64)
ipcMain.handle("offline-load-db", async (_event, fileName) => {
  try {
    const filePath = path.join(getOfflineDir(), fileName);
    if (!fs.existsSync(filePath)) {
      return { success: true, data: null };
    }
    const buffer = fs.readFileSync(filePath);
    console.log(`[OfflineFS] Loaded ${fileName} (${(buffer.length / 1024).toFixed(0)} KB)`);
    return { success: true, data: buffer.toString("base64") };
  } catch (err) {
    console.error("[OfflineFS] Load error:", err);
    return { success: false, error: err.message };
  }
});

// List all .db files in the offline folder
ipcMain.handle("offline-list-dbs", async () => {
  try {
    const dir = getOfflineDir();
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".db"));
    const result = files.map((f) => {
      const stats = fs.statSync(path.join(dir, f));
      return { name: f, size: stats.size, modified: stats.mtime.toISOString() };
    });
    console.log(`[OfflineFS] Listed ${result.length} db files`);
    return { success: true, files: result };
  } catch (err) {
    console.error("[OfflineFS] List error:", err);
    return { success: false, files: [], error: err.message };
  }
});

// Delete a .db file from the offline folder
ipcMain.handle("offline-delete-db", async (_event, fileName) => {
  try {
    const filePath = path.join(getOfflineDir(), fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[OfflineFS] Deleted ${fileName}`);
    }
    return { success: true };
  } catch (err) {
    console.error("[OfflineFS] Delete error:", err);
    return { success: false, error: err.message };
  }
});

// Get the offline folder path (for debugging)
ipcMain.handle("offline-get-path", () => {
  return getOfflineDir();
});

// App lifecycle
app.whenReady().then(() => {
  createWindow();

  // Check for updates after a short delay
  setTimeout(() => {
    autoUpdater.checkForUpdates();
  }, 3000);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
