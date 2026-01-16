const { app, BrowserWindow, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

// Disable GPU acceleration for better compatibility
app.disableHardwareAcceleration();

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, '../public/favicon.ico'),
    titleBarStyle: 'default',
    show: false
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:8080');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Auto-updater configuration
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

// Auto-updater events
autoUpdater.on('checking-for-update', () => {
  sendStatusToWindow('Checking for updates...');
});

autoUpdater.on('update-available', (info) => {
  sendStatusToWindow('Update available! Downloading...');
});

autoUpdater.on('update-not-available', (info) => {
  sendStatusToWindow('App is up to date.');
});

autoUpdater.on('error', (err) => {
  sendStatusToWindow('Error checking for updates: ' + err);
});

autoUpdater.on('download-progress', (progressObj) => {
  let message = `Download speed: ${progressObj.bytesPerSecond}`;
  message += ` - Downloaded ${progressObj.percent.toFixed(1)}%`;
  message += ` (${progressObj.transferred}/${progressObj.total})`;
  sendStatusToWindow(message);
});

autoUpdater.on('update-downloaded', (info) => {
  sendStatusToWindow('Update downloaded. Will install on restart.');
  // Notify renderer process
  if (mainWindow) {
    mainWindow.webContents.send('update-downloaded', info);
  }
});

function sendStatusToWindow(text) {
  if (mainWindow) {
    mainWindow.webContents.send('update-status', text);
  }
  console.log(text);
}

// IPC handlers
ipcMain.handle('check-for-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return result;
  } catch (error) {
    console.error('Update check failed:', error);
    return null;
  }
});

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall(false, true);
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// App lifecycle
app.whenReady().then(() => {
  createWindow();
  
  // Check for updates after a short delay
  setTimeout(() => {
    autoUpdater.checkForUpdates();
  }, 3000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
