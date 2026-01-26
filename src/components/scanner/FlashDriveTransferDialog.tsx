import { useState, useRef } from 'react';
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
  Check
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
import { useDataTemplates } from '@/hooks/useDataTemplates';
import { useOfflineTemplates, OfflineTemplate } from '@/hooks/useOfflineTemplates';
import { formatFileSize } from '@/lib/dataIntegrity';

interface TemplateInfo {
  id: string;
  name: string;
  inv_date: string | null;
  facility_name: string | null;
}

interface ImportPreviewTemplate {
  id: string;
  name: string;
  inv_date: string | null;
  facility_name: string | null;
  costItemCount?: number;
  sectionCount?: number;
}

interface FlashDriveTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FlashDriveTransferDialog({
  open,
  onOpenChange,
}: FlashDriveTransferDialogProps) {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [importProgress, setImportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState<string>('');
  
  // Import preview state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<{
    templates: ImportPreviewTemplate[];
    metadata: any;
  } | null>(null);
  const [selectedImportIds, setSelectedImportIds] = useState<string[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Use offline templates (the synced data) for export
  const { 
    templates: offlineTemplates,
    getSections: getOfflineSections,
    getAllCostItems: getOfflineCostItems,
  } = useOfflineTemplates();

  const { 
    buildDatabaseFromLocalData,
    previewImportDatabase,
    importSelectedTemplates,
  } = useDataTemplates();

  // Get templates available for export (from offline synced cache)
  const localTemplates = offlineTemplates;

  const handleExport = async () => {
    if (localTemplates.length === 0) {
      toast.error('No templates in local cache. Download templates to your device first.');
      return;
    }

    setIsExporting(true);
    setExportProgress(0);
    setExportStatus('Preparing templates...');

    try {
      // Prepare data for buildDatabaseFromLocalData
      const templatesForExport = localTemplates.map(t => ({
        id: t.id,
        cloud_id: t.cloud_id,
        name: t.name,
        inv_date: t.inv_date,
        facility_name: t.facility_name,
        inv_number: t.inv_number,
        cost_file_name: t.cost_file_name,
        job_ticket_file_name: t.job_ticket_file_name,
      }));

      // Build the database using the local offline data
      const result = await buildDatabaseFromLocalData(
        templatesForExport,
        async (templateId) => {
          const sections = await getOfflineSections(templateId);
          return sections.map(s => ({
            sect: s.sect,
            description: s.description,
            full_section: s.full_section,
            cost_sheet: s.cost_sheet ?? null,
          }));
        },
        async (templateId) => {
          return await getOfflineCostItems(templateId);
        },
        (progress) => {
          setExportProgress(Math.round((progress.current / progress.total) * 80));
          setExportStatus(`Processing ${progress.template} (${progress.current}/${progress.total})...`);
        }
      );

      if (!result) {
        toast.error('Export failed - no data available');
        return;
      }

      setExportProgress(90);
      setExportStatus('Creating file...');

      // Generate filename based on templates
      let filename = 'templates';
      if (localTemplates.length === 1) {
        const t = localTemplates[0];
        const parts: string[] = [];
        if (t.inv_number) parts.push(t.inv_number.replace(/[^a-zA-Z0-9]/g, ''));
        if (t.facility_name) parts.push(t.facility_name.replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '_'));
        if (parts.length > 0) {
          filename = parts.join('_');
        }
      } else if (localTemplates.length > 1) {
        // Multiple templates - use date + count
        filename = `templates_${localTemplates.length}_${new Date().toISOString().split('T')[0]}`;
      }

      // Create and download the file
      const blob = new Blob([new Uint8Array(result.data)], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.templatedb`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportProgress(100);
      setExportStatus('Complete!');
      
      const sizeStr = formatFileSize(result.data.length);
      const costItemCount = result.meta.costItemCount?.toLocaleString() || '0';
      toast.success(`Exported ${result.meta.templateCount} templates (${costItemCount} cost items, ${sizeStr})`);
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

    if (!file.name.endsWith('.templatedb')) {
      toast.error('Please select a .templatedb file');
      return;
    }

    setImportFile(file);
    setIsLoadingPreview(true);
    setSelectedImportIds([]);

    try {
      const result = await previewImportDatabase(file);
      
      if (result.success && result.templates) {
        setImportPreview({
          templates: result.templates,
          metadata: result.metadata,
        });
        // Select all by default
        setSelectedImportIds(result.templates.map(t => t.id));
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
      const result = await importSelectedTemplates(importFile, selectedImportIds, (progress) => {
        setImportProgress(progress);
      });

      if (result.success) {
        toast.success(`Imported ${result.imported} template(s) to this device`);
        // Reset state
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
      prev.includes(id) 
        ? prev.filter(x => x !== id)
        : [...prev, id]
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
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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

          {/* Export Tab */}
          <TabsContent value="export" className="space-y-4 mt-4">
            <div className="bg-muted/50 rounded-lg p-4 border">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                  <HardDrive className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">Export to Flash Drive</p>
                  <p className="text-sm text-muted-foreground">
                    Save all templates from this device to a .templatedb file
                  </p>
                </div>
              </div>

              {localTemplates.length > 0 ? (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Templates to export:</span>
                    <Badge variant="secondary">{localTemplates.length}</Badge>
                  </div>
                  
                  <ScrollArea className="h-[150px] border rounded-md p-2 bg-background">
                    <div className="space-y-1">
                      {localTemplates.map(t => (
                        <div key={t.id} className="flex items-center gap-2 text-sm py-1">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="truncate">{t.name}</span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              ) : (
                <div className="mt-4 p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-destructive">No templates on device</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Download templates to your device first using "Download to Device" before exporting to flash drive.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {isExporting && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{exportStatus || 'Building export file...'}</span>
                  </div>
                  <Progress value={exportProgress} className="h-2" />
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isExporting}>
                Cancel
              </Button>
              <Button 
                onClick={handleExport} 
                disabled={isExporting || localTemplates.length === 0}
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
                    Export to File
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
              accept=".templatedb"
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
                    <p className="font-medium">Select .templatedb file</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Click to browse for a template database file from flash drive
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

                {/* Verification status */}
                {importPreview.metadata?.checksum && (
                  <div className="flex items-center gap-2 text-sm text-primary">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>File integrity verified</span>
                  </div>
                )}

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
                              onCheckedChange={() => !isImporting && handleToggleImportTemplate(template.id)}
                              disabled={isImporting}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium truncate">{template.name}</span>
                              </div>
                              <div className="text-sm text-muted-foreground truncate">
                                {template.facility_name || 'No facility'} • {formatDate(template.inv_date)}
                                {template.costItemCount && (
                                  <span className="ml-2">
                                    • <Package className="h-3 w-3 inline" /> {template.costItemCount.toLocaleString()}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>

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
                disabled={isImporting || !importPreview || selectedImportIds.length === 0}
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
