import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, RefreshCw, Sparkles, X } from 'lucide-react';

// Extend Window interface for Electron API
declare global {
  interface Window {
    electronAPI?: {
      getAppVersion: () => Promise<string>;
      checkForUpdates: () => Promise<unknown>;
      installUpdate: () => Promise<void>;
      onUpdateStatus: (callback: (message: string) => void) => void;
      onUpdateDownloaded: (callback: (info: unknown) => void) => void;
      removeUpdateListeners: () => void;
    };
  }
}

// The current build version — must be bumped manually on each release
const BUILD_VERSION = '1.0.0';
const LAST_SEEN_VERSION_KEY = 'meridian_last_seen_version';

export function UpdateNotification() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string>('');
  const [isElectron, setIsElectron] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  // "justUpdated" fires when we detect the app version is newer than last seen
  const [justUpdated, setJustUpdated] = useState(false);
  const [displayVersion, setDisplayVersion] = useState(BUILD_VERSION);

  useEffect(() => {
    const isElectronEnv = !!window.electronAPI;
    setIsElectron(isElectronEnv);

    // Determine current version
    const resolveVersion = async () => {
      let currentVersion = BUILD_VERSION;

      if (isElectronEnv && window.electronAPI?.getAppVersion) {
        try {
          currentVersion = await window.electronAPI.getAppVersion();
        } catch {
          // fall back to BUILD_VERSION
        }
      }

      setDisplayVersion(currentVersion);

      // Compare with what the user last saw
      const lastSeen = localStorage.getItem(LAST_SEEN_VERSION_KEY);
      if (!lastSeen) {
        // First ever launch — just save the version, no banner
        localStorage.setItem(LAST_SEEN_VERSION_KEY, currentVersion);
      } else if (lastSeen !== currentVersion) {
        // Version changed → show "just updated" banner
        setJustUpdated(true);
        localStorage.setItem(LAST_SEEN_VERSION_KEY, currentVersion);
      }
    };

    resolveVersion();

    if (isElectronEnv && window.electronAPI) {
      // Listen for Electron auto-updater events
      window.electronAPI.onUpdateStatus((message) => {
        setUpdateStatus(message);
      });

      window.electronAPI.onUpdateDownloaded(() => {
        setUpdateAvailable(true);
        // Clear justUpdated so only one banner shows at a time
        setJustUpdated(false);
      });

      return () => {
        window.electronAPI?.removeUpdateListeners();
      };
    }
  }, []);

  const handleDismissUpdated = () => {
    setDismissed(true);
    setJustUpdated(false);
  };

  const handleInstallUpdate = () => {
    if (window.electronAPI) {
      window.electronAPI.installUpdate();
    }
  };

  // ── "Update downloaded, restart to install" (Electron only) ──────────────
  if (!dismissed && updateAvailable) {
    return (
      <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-4">
        <Card className="w-80 shadow-lg border-primary/20">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Download className="h-4 w-4 text-primary" />
                Update Ready
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setDismissed(true)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <CardDescription>
              A new version is ready to install.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="flex gap-2">
              <Button size="sm" onClick={handleInstallUpdate} className="flex-1">
                Restart & Update
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDismissed(true)}>
                Later
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── "App just updated to vX.X.X" — shown for both web and Electron ───────
  if (!dismissed && justUpdated) {
    return (
      <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-4">
        <Card className="w-80 shadow-lg border-primary/30 bg-background">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2 text-primary">
                <Sparkles className="h-4 w-4" />
                App Updated!
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleDismissUpdated}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <CardDescription>
              You're now running <strong>v{displayVersion}</strong>. Check the Update Log for what's new.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={handleDismissUpdated}
              >
                Got it
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Electron: show transient status (downloading etc.) ───────────────────
  if (isElectron && updateStatus && updateStatus !== 'App is up to date.') {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Card className="w-72 shadow-md">
          <CardContent className="p-3 flex items-center gap-2">
            <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">{updateStatus}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}

// Export a hook for checking updates manually
export function useAppUpdater() {
  const [isElectron] = useState(() => !!window.electronAPI);

  const checkForUpdates = () => {
    if (window.electronAPI) {
      window.electronAPI.checkForUpdates();
    }
  };

  const getVersion = async () => {
    if (window.electronAPI) {
      return await window.electronAPI.getAppVersion();
    }
    return null;
  };

  return { isElectron, checkForUpdates, getVersion };
}
