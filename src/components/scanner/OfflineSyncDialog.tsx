import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Download, Loader2, Check, Database } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

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
}

export function OfflineSyncDialog({
  open,
  onOpenChange,
  cloudTemplates,
  syncedTemplateIds,
  onSyncTemplates,
  isSyncing,
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

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleSelectAll}
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
                      }`}
                      onClick={() => handleToggle(template.id)}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => handleToggle(template.id)}
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
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
