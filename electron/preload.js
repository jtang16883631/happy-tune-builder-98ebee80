const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // Auto-updater
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  
  // Update event listeners
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update-status', (event, message) => callback(message));
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update-downloaded', (event, info) => callback(info));
  },
  
  // Remove listeners
  removeUpdateListeners: () => {
    ipcRenderer.removeAllListeners('update-status');
    ipcRenderer.removeAllListeners('update-downloaded');
  }
});

// Notify when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  console.log('Electron app loaded successfully');
});
