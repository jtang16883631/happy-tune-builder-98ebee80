import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Download, Loader2, Check, Database, CheckCircle2, FileText, Package } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import type { SyncProgress } from '@/hooks/useOfflineTemplates';

interface CloudTemplate {
  id: string;
  name: string;
  inv_date: string | null;
  facility_name: string | null;
  status: string | null;
}

interface OfflineSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cloudTemplates: CloudTemplate[];
  syncedTemplateIds: string[];
  onSyncTemplates: (templateIds: string[]) => Promise<{ success: boolean; synced: number; error?: string }>;
  isSyncing: boolean;
  syncProgress?: SyncProgress;
}

export function OfflineSyncDialog({
  open,
  onOpenChange,
  cloudTemplates,
  syncedTemplateIds,
  onSyncTemplates,
  isSyncing,
  syncProgress,
}: OfflineSyncDialogProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Initialize with already synced templates
  useEffect(() => {
    if (open) {
      setSelectedIds(syncedTemplateIds);
    }
  }, [open, syncedTemplateIds]);

  const handleToggle = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) 
        ? prev.filter(x => x !== id)
        : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === cloudTemplates.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(cloudTemplates.map(t => t.id));
    }
  };

  const handleSync = async () => {
    const result = await onSyncTemplates(selectedIds);
    
    if (result.success) {
      toast.success(`Synced ${result.synced} template(s) for offline use`);
      onOpenChange(false);
    } else {
      toast.error(result.error || 'Sync failed');
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString();
  };

  const getStatusLabel = (status: SyncProgress['status']) => {
    switch (status) {
      case 'fetching_template':
        return 'Fetching template info...';
      case 'fetching_sections':
        return 'Downloading sections...';
      case 'fetching_cost_items':
        return 'Downloading cost data...';
      case 'saving':
        return 'Saving to local storage...';
      case 'complete':
        return 'Sync complete!';
      default:
        return 'Preparing...';
    }
  };

  const progressPercent = syncProgress && syncProgress.totalTemplates > 0
    ? Math.round(((syncProgress.currentTemplateIndex - 1) / syncProgress.totalTemplates) * 100 + 
        (syncProgress.status === 'complete' ? 100 : 0) / syncProgress.totalTemplates)
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Sync Templates for Offline
          </DialogTitle>
          <DialogDescription>
            Select templates to download for offline scanning. Synced templates will be available without internet.
          </DialogDescription>
        </DialogHeader>

        {/* Sync Progress Section */}
        {isSyncing && syncProgress && syncProgress.status !== 'idle' && (
          <div className="bg-muted/50 rounded-lg p-4 space-y-3 border">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {syncProgress.status === 'complete' ? (
                  <span className="flex items-center gap-2 text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    Sync Complete!
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Syncing template {syncProgress.currentTemplateIndex} of {syncProgress.totalTemplates}
                  </span>
                )}
              </span>
            </div>

            <Progress 
              value={syncProgress.status === 'complete' ? 100 : progressPercent} 
              className="h-2" 
            />

            {syncProgress.currentTemplate && syncProgress.status !== 'complete' && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium truncate">{syncProgress.currentTemplate}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{getStatusLabel(syncProgress.status)}</span>
                  {syncProgress.status === 'fetching_cost_items' && syncProgress.costItemsFetched > 0 && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Package className="h-3 w-3" />
                      {syncProgress.costItemsFetched.toLocaleString()} items
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleSelectAll}
              disabled={isSyncing}
            >
              {selectedIds.length === cloudTemplates.length ? 'Deselect All' : 'Select All'}
            </Button>
            <span className="text-sm text-muted-foreground">
              {selectedIds.length} of {cloudTemplates.length} selected
            </span>
          </div>

          <ScrollArea className="h-[300px] border rounded-md p-2">
            {cloudTemplates.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No templates available
              </div>
            ) : (
              <div className="space-y-2">
                {cloudTemplates.map(template => {
                  const isSelected = selectedIds.includes(template.id);
                  const isSynced = syncedTemplateIds.includes(template.id);

                  return (
                    <div
                      key={template.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        isSelected ? 'bg-primary/10 border-primary/50' : 'hover:bg-muted/50'
                      } ${isSyncing ? 'opacity-60 pointer-events-none' : ''}`}
                      onClick={() => !isSyncing && handleToggle(template.id)}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => !isSyncing && handleToggle(template.id)}
                        disabled={isSyncing}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{template.name}</span>
                          {isSynced && (
                            <Badge variant="secondary" className="gap-1 text-xs">
                              <Check className="h-3 w-3" />
                              Synced
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground truncate">
                          {template.facility_name || 'No facility'} • {formatDate(template.inv_date)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSyncing}>
            {isSyncing ? 'Please wait...' : 'Cancel'}
          </Button>
          <Button 
            onClick={handleSync} 
            disabled={isSyncing || selectedIds.length === 0}
            className="gap-2"
          >
            {isSyncing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Sync {selectedIds.length} Template(s)
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
