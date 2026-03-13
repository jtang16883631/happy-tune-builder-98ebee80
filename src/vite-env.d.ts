/// <reference types="vite/client" />

declare const __BUILD_TIMESTAMP__: string;

interface ElectronOfflineFile {
  name: string;
  size: number;
  modified: string;
}

interface ElectronAPI {
  getAppVersion: () => Promise<string>;
  checkForUpdates: () => Promise<any>;
  installUpdate: () => Promise<void>;
  onUpdateStatus: (callback: (message: string) => void) => void;
  onUpdateDownloaded: (callback: (info: any) => void) => void;
  removeUpdateListeners: () => void;

  // Offline file system
  offlineSaveDb: (fileName: string, dataBase64: string) => Promise<{ success: boolean; size?: number; error?: string }>;
  offlineLoadDb: (fileName: string) => Promise<{ success: boolean; data?: string | null; error?: string }>;
  offlineListDbs: () => Promise<{ success: boolean; files: ElectronOfflineFile[]; error?: string }>;
  offlineDeleteDb: (fileName: string) => Promise<{ success: boolean; error?: string }>;
  offlineGetPath: () => Promise<string>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
