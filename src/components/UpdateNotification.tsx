import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, RefreshCw, Sparkles, X, ArrowUpCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

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
  const [justUpdated, setJustUpdated] = useState(false);
  const [displayVersion, setDisplayVersion] = useState(BUILD_VERSION);
  // New version available from DB (web refresh prompt)
  const [newVersionAvailable, setNewVersionAvailable] = useState<string | null>(null);
  const [newVersionDismissed, setNewVersionDismissed] = useState(false);

  // Poll DB for newer version every 5 minutes
  const checkDbVersion = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('changelog_entries')
        .select('version, release_date')
        .order('release_date', { ascending: false })
        .limit(1)
        .single();
      if (data?.version && data.version !== BUILD_VERSION) {
        setNewVersionAvailable(data.version);
      }
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    const isElectronEnv = !!window.electronAPI;
    setIsElectron(isElectronEnv);

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

      const lastSeen = localStorage.getItem(LAST_SEEN_VERSION_KEY);
      if (!lastSeen) {
        localStorage.setItem(LAST_SEEN_VERSION_KEY, currentVersion);
      } else if (lastSeen !== currentVersion) {
        setJustUpdated(true);
        localStorage.setItem(LAST_SEEN_VERSION_KEY, currentVersion);
      }
    };

    resolveVersion();

    // Check DB for newer version on mount and every 5 min
    checkDbVersion();
    const interval = setInterval(checkDbVersion, 5 * 60 * 1000);

    if (isElectronEnv && window.electronAPI) {
      window.electronAPI.onUpdateStatus((message) => {
        setUpdateStatus(message);
      });

      window.electronAPI.onUpdateDownloaded(() => {
        setUpdateAvailable(true);
        setJustUpdated(false);
      });

      return () => {
        window.electronAPI?.removeUpdateListeners();
        clearInterval(interval);
      };
    }

    return () => clearInterval(interval);
  }, [checkDbVersion]);

  const handleDismissUpdated = () => {
    setDismissed(true);
    setJustUpdated(false);
  };

  const handleInstallUpdate = () => {
    if (window.electronAPI) {
      window.electronAPI.installUpdate();
    }
  };

  // ── "New version in DB, please refresh" (Web only) ──────────────────────
  if (!newVersionDismissed && newVersionAvailable && !isElectron) {
    return (
      <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-4">
        <Card className="w-80 shadow-lg border-primary/30 bg-background">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2 text-primary">
                <ArrowUpCircle className="h-4 w-4" />
                新版本可用 v{newVersionAvailable}
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setNewVersionDismissed(true)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <CardDescription>
              管理员已发布新版本，刷新页面即可立即更新。
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 gap-2"
                onClick={() => window.location.reload()}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                立即刷新更新
              </Button>
              <Button size="sm" variant="outline" onClick={() => setNewVersionDismissed(true)}>
                稍后
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

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
