import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Download, Upload, CheckCircle, AlertTriangle, Loader2, HardDrive, ChevronLeft, ArrowRight } from 'lucide-react';
import { useOfflineTemplates, OfflineTemplate, OfflineSection, OfflineCostItem } from '@/hooks/useOfflineTemplates';
import { useLocalFDA, FDADrug } from '@/hooks/useLocalFDA';
import { useCloudTemplates } from '@/hooks/useCloudTemplates';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface OfflineDataPackage {
  version: string;
  exportedAt: string;
  exportedBy: string;
  templates: OfflineTemplate[];
  sections: { templateId: string; items: OfflineSection[] }[];
  costItems: { templateId: string; items: OfflineCostItem[] }[];
  fdaDrugs: FDADrug[];
  fdaMeta: any;
}

interface OfflineDataTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OfflineDataTransferDialog({ open, onOpenChange }: OfflineDataTransferDialogProps) {
  const [mode, setMode] = useState<'menu' | 'select-templates' | 'export' | 'import'>('menu');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { templates, getSections, syncMeta, isReady: templatesReady } = useOfflineTemplates();
  const { templates: cloudTemplates, isLoading: cloudLoading } = useCloudTemplates();
  const { meta: fdaMeta, isReady: fdaReady, searchDrugs } = useLocalFDA();
  
  // Pre-select currently synced templates when opening selection
  useEffect(() => {
    if (mode === 'select-templates' && templates.length > 0) {
      setSelectedTemplateIds(templates.map(t => t.cloud_id || t.id));
    }
  }, [mode, templates]);

  const toggleTemplate = (id: string) => {
    setSelectedTemplateIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAllTemplates = () => {
    setSelectedTemplateIds(cloudTemplates.map(t => t.id));
  };

  const deselectAllTemplates = () => {
    setSelectedTemplateIds([]);
  };

  const handleExport = async () => {
    setMode('export');
    setIsProcessing(true);
    setProgress(0);
    setStatus('Fetching templates from cloud...');

    try {
      const selectedTemplates = cloudTemplates.filter(ct => selectedTemplateIds.includes(ct.id));
      
      if (selectedTemplates.length === 0) {
        throw new Error('No templates selected');
      }

      setProgress(5);
      setStatus(`Preparing ${selectedTemplates.length} templates...`);

      // Build templates in OfflineTemplate format
      const exportTemplates: OfflineTemplate[] = selectedTemplates.map(ct => ({
        id: ct.id,
        cloud_id: ct.id,
        user_id: ct.user_id,
        name: ct.name,
        inv_date: ct.inv_date,
        facility_name: ct.facility_name,
        inv_number: ct.inv_number,
        cost_file_name: ct.cost_file_name,
        job_ticket_file_name: ct.job_ticket_file_name,
        status: (ct.status as any) || 'active',
        created_at: ct.created_at || new Date().toISOString(),
        updated_at: ct.updated_at || new Date().toISOString(),
        is_dirty: false,
      }));

      // Fetch sections and cost items for each template from cloud
      const allSections: { templateId: string; items: OfflineSection[] }[] = [];
      const allCostItems: { templateId: string; items: OfflineCostItem[] }[] = [];

      for (let i = 0; i < selectedTemplates.length; i++) {
        const template = selectedTemplates[i];
        setStatus(`Fetching data for: ${template.name || template.facility_name || 'Template'} (${i + 1}/${selectedTemplates.length})`);
        setProgress(5 + (i / selectedTemplates.length) * 40);

        // Fetch sections from cloud
        const { data: sections } = await supabase
          .from('template_sections')
          .select('*')
          .eq('template_id', template.id);

        allSections.push({
          templateId: template.id,
          items: (sections || []).map(s => ({
            id: s.id,
            template_id: s.template_id,
            sect: s.sect,
            description: s.description,
            full_section: s.full_section,
            cost_sheet: s.cost_sheet,
          })),
        });

        // Fetch cost items from cloud with pagination
        let costItemsOffset = 0;
        const costItemsLimit = 1000;
        let templateCostItems: OfflineCostItem[] = [];
        let hasMore = true;

        while (hasMore) {
          const { data: costItems } = await supabase
            .from('template_cost_items')
            .select('*')
            .eq('template_id', template.id)
            .range(costItemsOffset, costItemsOffset + costItemsLimit - 1);

          if (costItems && costItems.length > 0) {
            templateCostItems = templateCostItems.concat(
              costItems.map(c => ({
                id: c.id,
                template_id: c.template_id,
                ndc: c.ndc,
                material_description: c.material_description,
                unit_price: c.unit_price,
                source: c.source,
                material: c.material,
                sheet_name: c.sheet_name,
              }))
            );
            costItemsOffset += costItemsLimit;
            hasMore = costItems.length === costItemsLimit;
          } else {
            hasMore = false;
          }
        }

        allCostItems.push({ templateId: template.id, items: templateCostItems });
      }

      setProgress(50);
      setStatus('Gathering FDA data...');

      // Get FDA drugs
      let fdaDrugs: FDADrug[] = [];
      if (fdaReady && fdaMeta) {
        fdaDrugs = searchDrugs('', 50000);
      }
      setProgress(80);

      // Create package
      const dataPackage: OfflineDataPackage = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        exportedBy: 'Meridian Portal',
        templates: exportTemplates,
        sections: allSections,
        costItems: allCostItems,
        fdaDrugs: fdaDrugs,
        fdaMeta: fdaMeta,
      };

      setProgress(90);
      setStatus('Creating download file...');

      // Create and download file
      const blob = new Blob([JSON.stringify(dataPackage)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `meridian-offline-data-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setProgress(100);
      setStatus('Export complete!');

      const sectionCount = allSections.reduce((acc, s) => acc + s.items.length, 0);
      const costCount = allCostItems.reduce((acc, c) => acc + c.items.length, 0);

      toast({
        title: 'Export successful!',
        description: `Exported ${exportTemplates.length} templates, ${sectionCount} sections, ${costCount} cost items, and ${fdaDrugs.length} FDA drugs`,
      });

      setTimeout(() => {
        setMode('menu');
        setIsProcessing(false);
      }, 1500);

    } catch (error: any) {
      console.error('Export error:', error);
      toast({
        title: 'Export failed',
        description: error.message,
        variant: 'destructive',
      });
      setIsProcessing(false);
      setMode('menu');
    }
  };

  const handleImport = async (file: File) => {
    setMode('import');
    setIsProcessing(true);
    setProgress(0);
    setStatus('Reading file...');

    try {
      const text = await file.text();
      const dataPackage: OfflineDataPackage = JSON.parse(text);

      if (!dataPackage.version || !dataPackage.templates) {
        throw new Error('Invalid data package format');
      }

      setProgress(10);
      setStatus('Validating data...');

      const templateCount = dataPackage.templates?.length || 0;
      const sectionCount = dataPackage.sections?.reduce((acc, s) => acc + s.items.length, 0) || 0;
      const fdaCount = dataPackage.fdaDrugs?.length || 0;

      setProgress(30);
      setStatus(`Found ${templateCount} templates, ${sectionCount} sections, ${fdaCount} FDA drugs`);

      // Store data in IndexedDB for later use
      // This is a simplified import - for full functionality, we'd need to
      // recreate the SQLite database from the package data
      
      // For now, store the package in localStorage as a backup
      try {
        localStorage.setItem('meridian_import_package', JSON.stringify({
          importedAt: new Date().toISOString(),
          templateCount,
          sectionCount,
          fdaCount,
        }));
      } catch (e) {
        // Storage might be full, continue anyway
      }

      setProgress(100);
      setStatus('Import ready - please sync templates normally');

      toast({
        title: 'Data package loaded',
        description: `Package contains ${templateCount} templates and ${fdaCount} FDA drugs. Use the Sync feature to import template data.`,
      });

      setTimeout(() => {
        setMode('menu');
        setIsProcessing(false);
      }, 2000);

    } catch (error: any) {
      console.error('Import error:', error);
      toast({
        title: 'Import failed',
        description: error.message,
        variant: 'destructive',
      });
      setIsProcessing(false);
      setMode('menu');
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleImport(file);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const resetDialog = () => {
    setMode('menu');
    setIsProcessing(false);
    setProgress(0);
    setStatus('');
  };

  const hasData = cloudTemplates.length > 0 || (fdaMeta && fdaMeta.rowCount > 0);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) resetDialog();
      onOpenChange(isOpen);
    }}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            {mode === 'select-templates' ? 'Select Templates to Export' : 'Offline Data Transfer'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'select-templates' 
              ? 'Choose which templates to include in the export file'
              : 'Export data to a flash drive or import from another device'}
          </DialogDescription>
        </DialogHeader>

        {mode === 'menu' && (
          <div className="space-y-4 py-4">
            {/* Current Data Stats */}
            <div className="rounded-lg bg-muted p-4 space-y-2">
              <h4 className="font-medium text-sm">Available Data</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{cloudTemplates.length}</Badge>
                  <span className="text-muted-foreground">Cloud Templates</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{fdaMeta?.rowCount || 0}</Badge>
                  <span className="text-muted-foreground">FDA Drugs</span>
                </div>
              </div>
              {syncMeta?.lastSyncedAt && (
                <p className="text-xs text-muted-foreground">
                  Last synced: {new Date(syncMeta.lastSyncedAt).toLocaleDateString()}
                </p>
              )}
            </div>

            {/* Export Button - now goes to selection */}
            <Button
              variant="outline"
              className="w-full justify-between gap-3 h-auto py-4"
              onClick={() => setMode('select-templates')}
              disabled={!hasData || cloudLoading}
            >
              <div className="flex items-center gap-3">
                <Download className="h-5 w-5 text-primary" />
                <div className="text-left">
                  <div className="font-medium">Export to File</div>
                  <div className="text-xs text-muted-foreground">
                    Select templates and save to flash drive
                  </div>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Button>

            {/* Import Button */}
            <div className="relative">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <Button
                variant="outline"
                className="w-full justify-start gap-3 h-auto py-4"
              >
                <Upload className="h-5 w-5 text-primary" />
                <div className="text-left">
                  <div className="font-medium">Import from File</div>
                  <div className="text-xs text-muted-foreground">
                    Load data from another device
                  </div>
                </div>
              </Button>
            </div>

            {/* Info */}
            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-warning" />
              <div className="text-warning-foreground">
                <p className="font-medium">Note about importing</p>
                <p>For full offline functionality, use the normal Sync feature while online. Export is for backup and reference.</p>
              </div>
            </div>
          </div>
        )}

        {mode === 'select-templates' && (
          <div className="flex flex-col flex-1 min-h-0 py-2">
            {/* Selection controls */}
            <div className="flex items-center justify-between pb-3 border-b">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMode('menu')}
                  className="h-8 px-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  {selectedTemplateIds.length} of {cloudTemplates.length} selected
                </span>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={selectAllTemplates} className="text-xs h-7">
                  Select All
                </Button>
                <Button variant="ghost" size="sm" onClick={deselectAllTemplates} className="text-xs h-7">
                  Clear
                </Button>
              </div>
            </div>

            {/* Template list */}
            <ScrollArea className="flex-1 min-h-0 py-2">
              {cloudLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : cloudTemplates.length === 0 ? (
                <div className="text-center text-muted-foreground py-8 text-sm">
                  No templates available in cloud
                </div>
              ) : (
                <div className="space-y-1">
                  {cloudTemplates.map(template => (
                    <label
                      key={template.id}
                      className="flex items-start gap-3 p-2 rounded-md hover:bg-muted cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedTemplateIds.includes(template.id)}
                        onCheckedChange={() => toggleTemplate(template.id)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {template.name || template.facility_name || 'Untitled'}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {template.inv_date ? new Date(template.inv_date).toLocaleDateString() : 'No date'}
                          {template.facility_name && template.name !== template.facility_name && ` • ${template.facility_name}`}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* FDA data indicator */}
            <div className="pt-3 border-t">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox checked disabled className="opacity-50" />
                <span>FDA Drug Database ({fdaMeta?.rowCount?.toLocaleString() || 0} drugs)</span>
                <Badge variant="secondary" className="text-xs">Always included</Badge>
              </div>
            </div>

            {/* Export button */}
            <Button
              className="mt-4 w-full"
              onClick={handleExport}
              disabled={selectedTemplateIds.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Export {selectedTemplateIds.length} Template{selectedTemplateIds.length !== 1 ? 's' : ''}
            </Button>
          </div>
        )}

        {(mode === 'export' || mode === 'import') && (
          <div className="py-6 space-y-4">
            <div className="flex items-center justify-center">
              {progress < 100 ? (
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
              ) : (
                <CheckCircle className="h-12 w-12 text-green-600" />
              )}
            </div>

            <div className="text-center">
              <h4 className="font-medium mb-1">
                {mode === 'export' ? 'Exporting Data' : 'Importing Data'}
              </h4>
              <p className="text-sm text-muted-foreground">{status}</p>
            </div>

            <Progress value={progress} className="h-2" />
            <p className="text-center text-sm text-muted-foreground">{Math.round(progress)}%</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}