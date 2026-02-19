import { useState } from 'react';
import { Trash2, HardDrive, Package, Calendar, Building2, AlertTriangle, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import type { OfflineTemplate } from '@/hooks/useOfflineTemplates';

interface ManageDeviceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  localTemplates: OfflineTemplate[];
  getTemplateCostItemCount: (templateId: string) => number;
  onDelete: (templateId: string) => Promise<{ success: boolean; error?: string }>;
  onRefresh: () => void;
}

export function ManageDeviceDialog({
  open,
  onOpenChange,
  localTemplates,
  getTemplateCostItemCount,
  onDelete,
  onRefresh,
}: ManageDeviceDialogProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmTemplate, setConfirmTemplate] = useState<OfflineTemplate | null>(null);

  const handleDelete = async (template: OfflineTemplate) => {
    setDeletingId(template.id);
    const result = await onDelete(template.id);
    setDeletingId(null);
    setConfirmTemplate(null);

    if (result.success) {
      toast.success(`"${template.name}" removed from device`);
      onRefresh();
    } else {
      toast.error(result.error || 'Failed to delete template');
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'No date';
    return new Date(dateStr).toLocaleDateString();
  };

  const totalItems = localTemplates.reduce(
    (sum, t) => sum + getTemplateCostItemCount(t.id),
    0
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              Manage Device Storage
            </DialogTitle>
            <DialogDescription>
              {localTemplates.length} template(s) stored on this device •{' '}
              {totalItems.toLocaleString()} total cost items
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-[380px] border rounded-md">
            {localTemplates.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground py-12">
                <HardDrive className="h-8 w-8 opacity-40" />
                <p className="text-sm">No templates downloaded to this device</p>
              </div>
            ) : (
              <div className="divide-y">
                {localTemplates.map(template => {
                  const costCount = getTemplateCostItemCount(template.id);
                  const isDeleting = deletingId === template.id;

                  return (
                    <div
                      key={template.id}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate text-sm">{template.name}</span>
                          {template.cloud_id && (
                            <Badge variant="secondary" className="text-xs shrink-0">Cloud</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                          {template.facility_name && (
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {template.facility_name}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(template.inv_date)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Package className="h-3 w-3" />
                            {costCount.toLocaleString()} cost items
                          </span>
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setConfirmTemplate(template)}
                        disabled={isDeleting}
                      >
                        {isDeleting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm delete dialog */}
      <AlertDialog open={!!confirmTemplate} onOpenChange={() => setConfirmTemplate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Remove from Device?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <strong>"{confirmTemplate?.name}"</strong> and all its cost data
              from this device. Your cloud data will not be affected. You can re-download it anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmTemplate && handleDelete(confirmTemplate)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
