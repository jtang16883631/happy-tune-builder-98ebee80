import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAppVersion } from '@/hooks/useAppVersion';
import { RefreshCw, CheckCircle, Download, Info, Wifi, WifiOff, Calendar, Package } from 'lucide-react';

export function AboutTab() {
  const {
    version,
    buildDate,
    isElectron,
    isOnline,
    lastUpdateCheck,
    updateAvailable,
    checking,
    checkForUpdates,
    applyUpdate,
  } = useAppVersion();

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* Version Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Info className="h-5 w-5" />
            Application Information
          </CardTitle>
          <CardDescription>
            Meridian Portal - FDA Database & Scanner Application
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Package className="h-4 w-4" />
                Version
              </div>
              <p className="text-xl font-bold">{version}</p>
            </div>
            
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                Build Date
              </div>
              <p className="text-xl font-bold">{buildDate}</p>
            </div>
            
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {isOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                Status
              </div>
              <p className="text-xl font-bold">{isOnline ? 'Online' : 'Offline'}</p>
            </div>
            
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4" />
                Platform
              </div>
              <p className="text-xl font-bold">{isElectron ? 'Desktop' : 'Web'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Update Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Download className="h-5 w-5" />
            Updates
          </CardTitle>
          <CardDescription>
            Last checked: {formatDate(lastUpdateCheck)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {updateAvailable ? (
            <div className="flex items-center justify-between p-4 rounded-lg border border-primary bg-primary/5">
              <div className="flex items-center gap-3">
                <Download className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Update Available</p>
                  <p className="text-sm text-muted-foreground">
                    A new version is ready to install
                  </p>
                </div>
              </div>
              <Button onClick={applyUpdate}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Update Now
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/50">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Up to Date</p>
                  <p className="text-sm text-muted-foreground">
                    You're running the latest version
                  </p>
                </div>
              </div>
              <Button 
                variant="outline" 
                onClick={checkForUpdates}
                disabled={checking || !isOnline}
              >
                {checking ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Check for Updates
              </Button>
            </div>
          )}

          <div className="text-sm text-muted-foreground">
            <p>
              Updates are checked automatically when you open the application.
              {isElectron ? (
                ' Desktop app updates will be downloaded and installed automatically.'
              ) : (
                ' Web updates are applied instantly when available.'
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Auto-Update Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">How Auto-Update Works</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            • <strong>Web App:</strong> Updates are delivered automatically via Service Worker. 
            When a new version is available, it will be applied the next time you open the app.
          </p>
          <p>
            • <strong>Desktop App:</strong> Updates are downloaded in the background. 
            You'll be notified when an update is ready to install.
          </p>
          <p>
            • <strong>No Sign-Out Required:</strong> You don't need to sign out or manually refresh. 
            Updates are seamless and preserve your session.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
