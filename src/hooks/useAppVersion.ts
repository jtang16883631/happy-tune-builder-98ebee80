import { useState, useEffect, useCallback } from 'react';

const BUILD_VERSION = '1.2.1';
const BUILD_DATE = '2026-03-10';

export interface AppVersionInfo {
  version: string;
  buildDate: string;
  isElectron: boolean;
  isOnline: boolean;
  lastUpdateCheck: string | null;
  updateAvailable: boolean;
}

export function useAppVersion() {
  const [versionInfo, setVersionInfo] = useState<AppVersionInfo>({
    version: BUILD_VERSION,
    buildDate: BUILD_DATE,
    isElectron: false,
    isOnline: navigator.onLine,
    lastUpdateCheck: localStorage.getItem('last_update_check'),
    updateAvailable: false,
  });
  const [checking, setChecking] = useState(false);

  // Check if running in Electron and get version
  useEffect(() => {
    const isElectron = !!window.electronAPI;
    
    if (isElectron && window.electronAPI?.getAppVersion) {
      window.electronAPI.getAppVersion().then((version) => {
        setVersionInfo(prev => ({ ...prev, version, isElectron: true }));
      });
    }

    // Listen for online/offline
    const handleOnline = () => setVersionInfo(prev => ({ ...prev, isOnline: true }));
    const handleOffline = () => setVersionInfo(prev => ({ ...prev, isOnline: false }));
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Check for updates - works for both Electron and PWA
  const checkForUpdates = useCallback(async () => {
    setChecking(true);
    
    try {
      if (window.electronAPI?.checkForUpdates) {
        // Electron update check
        await window.electronAPI.checkForUpdates();
      } else if ('serviceWorker' in navigator) {
        // PWA update check - trigger SW update
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          await registration.update();
          
          // Check if there's a waiting worker (update available)
          if (registration.waiting) {
            setVersionInfo(prev => ({ ...prev, updateAvailable: true }));
          }
        }
      }
      
      const now = new Date().toISOString();
      localStorage.setItem('last_update_check', now);
      setVersionInfo(prev => ({ ...prev, lastUpdateCheck: now }));
    } catch (err) {
      console.error('Update check failed:', err);
    } finally {
      setChecking(false);
    }
  }, []);

  // Apply update (for PWA - skip waiting and reload)
  const applyUpdate = useCallback(async () => {
    if (window.electronAPI?.installUpdate) {
      // Electron update
      await window.electronAPI.installUpdate();
    } else if ('serviceWorker' in navigator) {
      // PWA update - skip waiting and reload
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration?.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        window.location.reload();
      } else {
        // Just reload to get latest
        window.location.reload();
      }
    }
  }, []);

  // Auto-check for updates on mount if we haven't checked recently (24 hours)
  useEffect(() => {
    const lastCheck = localStorage.getItem('last_update_check');
    if (lastCheck) {
      const lastCheckDate = new Date(lastCheck);
      const now = new Date();
      const hoursSinceCheck = (now.getTime() - lastCheckDate.getTime()) / (1000 * 60 * 60);
      
      // Auto-check if more than 24 hours since last check
      if (hoursSinceCheck > 24 && navigator.onLine) {
        checkForUpdates();
      }
    } else if (navigator.onLine) {
      // First time - check for updates
      checkForUpdates();
    }
  }, [checkForUpdates]);

  // Listen for SW updates
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const handleControllerChange = () => {
        // New service worker took control - reload to use new version
        window.location.reload();
      };

      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
      
      return () => {
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      };
    }
  }, []);

  return {
    ...versionInfo,
    checking,
    checkForUpdates,
    applyUpdate,
  };
}
