import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  RefreshCw, 
  Cloud, 
  CloudOff, 
  Check, 
  AlertCircle,
  Upload,
  Download
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { toast } from 'sonner';

interface SyncButtonProps {
  isOnline: boolean;
  isSyncing: boolean;
  pendingChanges: number;
  lastSyncedAt: string | null;
  onSync: () => Promise<{ success: boolean; pushed: number; pulled: number; error?: string }>;
}

export function SyncButton({ 
  isOnline, 
  isSyncing, 
  pendingChanges, 
  lastSyncedAt,
  onSync 
}: SyncButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleSync = async () => {
    const result = await onSync();
    
    if (result.success) {
      toast.success(
        `Sync complete! ${result.pushed} pushed, ${result.pulled} pulled`,
        { duration: 3000 }
      );
    } else {
      toast.error(result.error || 'Sync failed');
    }
    
    setIsOpen(false);
  };

  const formatLastSync = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    return date.toLocaleDateString();
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="relative gap-2"
        >
          {isOnline ? (
            <Cloud className="h-4 w-4 text-green-500" />
          ) : (
            <CloudOff className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="hidden sm:inline">
            {isOnline ? 'Online' : 'Offline'}
          </span>
          {pendingChanges > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-[10px]"
            >
              {pendingChanges}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Sync Status</h4>
            {isOnline ? (
              <Badge variant="secondary" className="gap-1">
                <Check className="h-3 w-3" />
                Online
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 text-muted-foreground">
                <AlertCircle className="h-3 w-3" />
                Offline
              </Badge>
            )}
          </div>
          
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Last synced:</span>
              <span>{formatLastSync(lastSyncedAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pending changes:</span>
              <span className={pendingChanges > 0 ? 'text-amber-500 font-medium' : ''}>
                {pendingChanges}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Button
              onClick={handleSync}
              disabled={!isOnline || isSyncing}
              className="w-full gap-2"
            >
              {isSyncing ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Sync Now
                </>
              )}
            </Button>
            
            {!isOnline && (
              <p className="text-xs text-muted-foreground text-center">
                Connect to the internet to sync your data
              </p>
            )}
          </div>

          <div className="border-t pt-3">
            <p className="text-xs text-muted-foreground">
              <Upload className="h-3 w-3 inline mr-1" />
              Push sends local changes to cloud
              <br />
              <Download className="h-3 w-3 inline mr-1" />
              Pull downloads cloud data to device
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
