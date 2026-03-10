import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { 
  HardDrive, 
  Download, 
  Upload, 
  Loader2, 
  CheckCircle2, 
  FileText,
  Package,
  AlertTriangle,
  Check,
  Cloud,
  Laptop,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { useOfflineTemplates } from '@/hooks/useOfflineTemplates';
import { useCloudTemplates } from '@/hooks/useCloudTemplates';
import { formatFileSize } from '@/lib/dataIntegrity';
import { gzipCompress, gzipDecompress, isGzipped } from '@/lib/compression';

interface ImportPreviewTemplate {
  id: string;
  name: string;
  inv_date: string | null;
  facility_name: string | null;
  costItemCount?: number;
}

interface FlashDriveTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isOnline?: boolean;
}

export function FlashDriveTransferDialog({
  open,
  onOpenChange,
  isOnline = navigator.onLine,
}: FlashDriveTransferDialogProps) {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [importProgress, setImportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState<string>('');
  const [selectedExportIds, setSelectedExportIds] = useState<string[]>([]);

  // Import preview state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<{
    templates: ImportPreviewTemplate[];
  } | null>(null);
  const [selectedImportIds, setSelectedImportIds] = useState<string[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { 
    templates: offlineTemplates,
    syncedTemplateIds,
    exportToFlashDrive,
    exportCloudTemplatesToFlashDrive,
    previewFlashDriveImport,
    importFromFlashDrive,
  } = useOfflineTemplates(isOnline);

  // Cloud templates — only fetch when online
  const { templates: cloudTemplates, isLoading: isLoadingCloud } = useCloudTemplates();

  // When online: show cloud templates (with on-device badge).
  // When offline: show only local (on-device) templates.
  const exportTemplateList = isOnline
    ? cloudTemplates
    : offlineTemplates.map(t => ({
        id: t.id,
        name: t.name,
        facility_name: t.facility_name,
        inv_date: t.inv_date,
        inv_number: t.inv_number,
      }));

  const isLoadingExportList = isOnline ? isLoadingCloud : false;

  // Build a set of cloud IDs that are already downloaded to device
  const localCloudIds = new Set(syncedTemplateIds);

  // Reset selections when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedExportIds([]);
      setSelectedImportIds([]);
    }
  }, [open]);

  const handleToggleExportTemplate = (id: string) => {
    setSelectedExportIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectAllExport = () => {
    if (selectedExportIds.length === exportTemplateList.length) {
      setSelectedExportIds([]);
    } else {
      setSelectedExportIds(exportTemplateList.map(t => t.id));
    }
  };

  const handleExport = async () => {
    if (selectedExportIds.length === 0) {
      toast.error('Select at least one template to export.');
      return;
    }

    setIsExporting(true);
    setExportProgress(10);
    setExportStatus('Preparing export...');

    try {
      let exportData: Uint8Array;
      let exportedCount: number;
      let costItemCount: number;
      let exportedTemplatesMeta: Array<{ inv_number?: string | null; facility_name?: string | null }>;

      if (isOnline) {
        // Online: use cloud export (can fetch cloud-only templates)
        const result = await exportCloudTemplatesToFlashDrive(
          selectedExportIds,
          (msg) => { setExportStatus(msg); setExportProgress(prev => Math.min(prev + 15, 85)); }
        );
        if (!result || result.exportedTemplates.length === 0) {
          toast.error('Export failed - no data available');
          return;
        }
        exportData = new Uint8Array(result.data);
        exportedCount = result.exportedTemplates.length;
        costItemCount = result.costItemCount;
        exportedTemplatesMeta = result.exportedTemplates;
      } else {
        // Offline: export directly from local SQLite
        setExportStatus('Exporting from device...');
        setExportProgress(50);
        const result = exportToFlashDrive(selectedExportIds);
        if (!result || result.templates.length === 0) {
          toast.error('Export failed - no local data available');
          return;
        }
        exportData = result.data;
        exportedCount = result.templates.length;
        costItemCount = result.costItemCount;
        exportedTemplatesMeta = result.templates;
      }

      setExportProgress(90);
      setExportStatus('Compressing with gzip...');

      // Generate filename
      let filename = 'templates';
      if (exportedTemplatesMeta.length === 1) {
        const t = exportedTemplatesMeta[0];
        const parts: string[] = [];
        if (t.inv_number) parts.push(t.inv_number.replace(/[^a-zA-Z0-9]/g, ''));
        if (t.facility_name) parts.push(t.facility_name.replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '_'));
        if (parts.length > 0) filename = parts.join('_');
      } else {
        filename = `templates_${exportedCount}_${new Date().toISOString().split('T')[0]}`;
      }

      // Gzip compress the SQLite binary for smaller USB transfer
      const compressed = await gzipCompress(exportData);

      const blob = new Blob([compressed as any], { type: 'application/gzip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.templatedb.gz`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportProgress(100);
      setExportStatus('Complete!');
      
      const rawSize = formatFileSize(exportData.length);
      const compressedSize = formatFileSize(compressed.byteLength);
      toast.success(`Exported ${exportedCount} template(s) (${costItemCount.toLocaleString()} cost items, ${rawSize} → ${compressedSize} compressed)`);
    } catch (err: any) {
      toast.error(err.message || 'Export failed');
    } finally {
      setIsExporting(false);
      setExportProgress(0);
      setExportStatus('');
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.templatedb') && !file.name.endsWith('.templatedb.gz') && !file.name.endsWith('.gz')) {
      toast.error('Please select a .templatedb or .templatedb.gz file');
      return;
    }

    setImportFile(file);
    setIsLoadingPreview(true);
    setSelectedImportIds([]);

    try {
      const result = await previewFlashDriveImport(file);
      
      if (result.success && result.templates) {
        setImportPreview({ templates: result.templates });
      } else {
        toast.error(result.error || 'Failed to read file');
        setImportFile(null);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to read file');
      setImportFile(null);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleImport = async () => {
    if (!importFile || selectedImportIds.length === 0) return;

    setIsImporting(true);
    setImportProgress(0);

    try {
      const result = await importFromFlashDrive(importFile, selectedImportIds, (progress) => {
        setImportProgress(progress);
      });

      if (result.success) {
        toast.success(`Imported ${result.imported} template(s) to this device`);
        setImportFile(null);
        setImportPreview(null);
        setSelectedImportIds([]);
        onOpenChange(false);
      } else {
        toast.error(result.error || 'Import failed');
      }
    } catch (err: any) {
      toast.error(err.message || 'Import failed');
    } finally {
      setIsImporting(false);
      setImportProgress(0);
    }
  };

  const handleToggleImportTemplate = (id: string) => {
    setSelectedImportIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectAllImport = () => {
    if (!importPreview) return;
    if (selectedImportIds.length === importPreview.templates.length) {
      setSelectedImportIds([]);
    } else {
      setSelectedImportIds(importPreview.templates.map(t => t.id));
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString();
  };

  const resetImport = () => {
    setImportFile(null);
    setImportPreview(null);
    setSelectedImportIds([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Flash Drive Transfer
          </DialogTitle>
          <DialogDescription>
            Export templates to a flash drive to share with others, or import templates from a flash drive.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'export' | 'import')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="export" className="gap-2">
              <Download className="h-4 w-4" />
              Export
            </TabsTrigger>
            <TabsTrigger value="import" className="gap-2">
              <Upload className="h-4 w-4" />
              Import
            </TabsTrigger>
          </TabsList>

          <TabsContent value="export" className="space-y-4 mt-4">
            {isLoadingExportList ? (
              <div className="flex items-center justify-center p-8 gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading templates...</span>
              </div>
            ) : exportTemplateList.length === 0 ? (
              <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-destructive">No templates available</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {isOnline
                        ? 'Upload templates first before exporting.'
                        : 'No templates downloaded to this device. Import from a flash drive or download while online.'}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSelectAllExport}
                    disabled={isExporting}
                  >
                    {selectedExportIds.length === exportTemplateList.length ? 'Deselect All' : 'Select All'}
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {selectedExportIds.length} of {exportTemplateList.length} selected
                  </span>
                </div>

                <ScrollArea className="h-[200px] border rounded-md p-2 bg-background">
                  <div className="space-y-1">
                    {exportTemplateList.map(t => {
                      const isSelected = selectedExportIds.includes(t.id);
                      const isOnDevice = !isOnline || localCloudIds.has(t.id);
                      return (
                        <div
                          key={t.id}
                          className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-colors ${
                            isSelected ? 'bg-primary/10 border-primary/50' : 'hover:bg-muted/50 border-transparent'
                          } ${isExporting ? 'opacity-60 pointer-events-none' : ''}`}
                          onClick={() => !isExporting && handleToggleExportTemplate(t.id)}
                        >
                          <Checkbox
                            checked={isSelected}
                            disabled={isExporting}
                            onClick={(e) => e.stopPropagation()}
                            onCheckedChange={() => !isExporting && handleToggleExportTemplate(t.id)}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{t.name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {t.facility_name || 'No facility'}
                              {t.inv_date ? ` • ${new Date(t.inv_date).toLocaleDateString()}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isOnDevice ? (
                              <Badge variant="secondary" className="text-xs gap-1 py-0">
                                <Laptop className="h-3 w-3" />
                                On Device
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs gap-1 py-0 text-muted-foreground">
                                <Cloud className="h-3 w-3" />
                                Cloud
                              </Badge>
                            )}
                            {isSelected && <Check className="h-4 w-4 text-primary" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>

                <p className="text-xs text-muted-foreground">
                  {isOnline
                    ? '"On Device" templates export instantly. "Cloud" templates will be fetched during export.'
                    : 'All templates shown are on this device and can be exported offline.'}
                </p>
              </div>
            )}

            {isExporting && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{exportStatus || 'Building export file...'}</span>
                </div>
                <Progress value={exportProgress} className="h-2" />
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isExporting}>
                Cancel
              </Button>
              <Button
                onClick={handleExport}
                disabled={isExporting || selectedExportIds.length === 0}
                className="gap-2"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Export {selectedExportIds.length > 0 ? `(${selectedExportIds.length})` : ''}
                  </>
                )}
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* Import Tab */}
          <TabsContent value="import" className="space-y-4 mt-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".templatedb,.templatedb.gz,.gz"
              className="hidden"
              onChange={handleFileSelect}
            />

            {!importFile ? (
              <div 
                className="bg-muted/50 rounded-lg p-8 border-2 border-dashed cursor-pointer hover:bg-muted/70 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
                    <Upload className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Select template file</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Accepts .templatedb or .templatedb.gz (compressed) files
                    </p>
                  </div>
                </div>
              </div>
            ) : isLoadingPreview ? (
              <div className="bg-muted/50 rounded-lg p-8 border">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Reading file...</p>
                </div>
              </div>
            ) : importPreview ? (
              <div className="space-y-4">
                {/* File info */}
                <div className="bg-muted/50 rounded-lg p-3 border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium truncate">{importFile.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{formatFileSize(importFile.size)}</Badge>
                    <Button variant="ghost" size="sm" onClick={resetImport}>
                      Change
                    </Button>
                  </div>
                </div>

                {/* Verification badge */}
                <div className="flex items-center gap-2 text-sm text-primary">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>File read successfully</span>
                </div>

                {/* Template selection */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleSelectAllImport}
                      disabled={isImporting}
                    >
                      {selectedImportIds.length === importPreview.templates.length ? 'Deselect All' : 'Select All'}
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {selectedImportIds.length} of {importPreview.templates.length} selected
                    </span>
                  </div>

                  <ScrollArea className="h-[200px] border rounded-md p-2">
                    <div className="space-y-2">
                      {importPreview.templates.map(template => {
                        const isSelected = selectedImportIds.includes(template.id);

                        return (
                          <div
                            key={template.id}
                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                              isSelected ? 'bg-primary/10 border-primary/50' : 'hover:bg-muted/50'
                            } ${isImporting ? 'opacity-60 pointer-events-none' : ''}`}
                            onClick={() => !isImporting && handleToggleImportTemplate(template.id)}
                          >
                            <Checkbox
                              checked={isSelected}
                              disabled={isImporting}
                              onClick={(e) => e.stopPropagation()}
                              onCheckedChange={() => !isImporting && handleToggleImportTemplate(template.id)}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium truncate">{template.name}</span>
                              </div>
                              <div className="text-sm text-muted-foreground flex items-center gap-2">
                                <span className="truncate">
                                  {template.facility_name || 'No facility'} • {formatDate(template.inv_date)}
                                </span>
                                {template.costItemCount !== undefined && template.costItemCount > 0 && (
                                  <Badge variant="outline" className="text-xs gap-1">
                                    <Package className="h-3 w-3" />
                                    {template.costItemCount.toLocaleString()}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>

                {/* Import progress */}
                {isImporting && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Importing templates...</span>
                    </div>
                    <Progress value={importProgress} className="h-2" />
                  </div>
                )}
              </div>
            ) : null}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isImporting}>
                Cancel
              </Button>
              <Button 
                onClick={handleImport} 
                disabled={isImporting || !importFile || selectedImportIds.length === 0}
                className="gap-2"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Import {selectedImportIds.length} Template(s)
                  </>
                )}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
