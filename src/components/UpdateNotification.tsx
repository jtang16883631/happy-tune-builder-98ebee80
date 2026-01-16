import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, RefreshCw, X } from 'lucide-react';

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

export function UpdateNotification() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string>('');
  const [appVersion, setAppVersion] = useState<string>('');
  const [isElectron, setIsElectron] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if running in Electron
    if (window.electronAPI) {
      setIsElectron(true);
      
      // Get app version
      window.electronAPI.getAppVersion().then(setAppVersion);
      
      // Listen for update events
      window.electronAPI.onUpdateStatus((message) => {
        setUpdateStatus(message);
      });
      
      window.electronAPI.onUpdateDownloaded(() => {
        setUpdateAvailable(true);
      });
      
      return () => {
        window.electronAPI?.removeUpdateListeners();
      };
    }
  }, []);

  const handleInstallUpdate = () => {
    if (window.electronAPI) {
      window.electronAPI.installUpdate();
    }
  };

  const handleCheckForUpdates = () => {
    if (window.electronAPI) {
      window.electronAPI.checkForUpdates();
    }
  };

  // Don't render if not in Electron or dismissed
  if (!isElectron || dismissed) return null;

  // Show update ready notification
  if (updateAvailable) {
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
              <Button 
                size="sm" 
                onClick={handleInstallUpdate}
                className="flex-1"
              >
                Restart & Update
              </Button>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => setDismissed(true)}
              >
                Later
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show version info in development or when explicitly checking
  if (updateStatus && updateStatus !== 'App is up to date.') {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Card className="w-72 shadow-md">
          <CardContent className="p-3">
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
