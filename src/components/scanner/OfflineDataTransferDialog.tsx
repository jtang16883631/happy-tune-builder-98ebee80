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
import { Download, Upload, CheckCircle, AlertTriangle, Loader2, HardDrive, ChevronLeft, ArrowRight, Database } from 'lucide-react';
import { useOfflineTemplates, OfflineTemplate, OfflineSection, OfflineCostItem } from '@/hooks/useOfflineTemplates';
import { useLocalFDA, FDADrug } from '@/hooks/useLocalFDA';
import { useCloudTemplates } from '@/hooks/useCloudTemplates';
import { useDataTemplates } from '@/hooks/useDataTemplates';
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
  const [mode, setMode] = useState<'menu' | 'select-templates' | 'select-templates-db' | 'export' | 'import'>('menu');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [selectedDbTemplateIds, setSelectedDbTemplateIds] = useState<string[]>([]);
  const [includeFDA, setIncludeFDA] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const templateDbInputRef = useRef<HTMLInputElement>(null);
  const hasInitializedDbSelection = useRef(false);
  const hasInitializedSelection = useRef(false);

  const { templates, getSections, syncMeta, isReady: templatesReady } = useOfflineTemplates();
  const { templates: cloudTemplates, isLoading: cloudLoading } = useCloudTemplates();
  const { meta: fdaMeta, isReady: fdaReady, searchDrugs } = useLocalFDA();
  const { meta: templateDbMeta, isReady: templateDbReady, exportDatabase, importDatabase, buildDatabaseFromCloudData } = useDataTemplates();
  
  // Pre-select currently synced templates ONLY when first opening selection mode
  useEffect(() => {
    if (mode === 'select-templates' && !hasInitializedSelection.current) {
      hasInitializedSelection.current = true;
      // Pre-select templates that are already synced locally
      const syncedCloudIds = templates.map(t => t.cloud_id).filter(Boolean) as string[];
      setSelectedTemplateIds(syncedCloudIds);
    } else if (mode !== 'select-templates') {
      // Reset when leaving selection mode
      hasInitializedSelection.current = false;
    }
  }, [mode, templates]);

  // Pre-select all cloud templates for .templatedb export when entering that mode
  useEffect(() => {
    if (mode === 'select-templates-db' && !hasInitializedDbSelection.current) {
      hasInitializedDbSelection.current = true;
      setSelectedDbTemplateIds(cloudTemplates.map(t => t.id));
    } else if (mode !== 'select-templates-db') {
      hasInitializedDbSelection.current = false;
    }
  }, [mode, cloudTemplates]);

  const toggleDbTemplate = (id: string) => {
    setSelectedDbTemplateIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAllDbTemplates = () => {
    setSelectedDbTemplateIds(cloudTemplates.map(t => t.id));
  };

  const deselectAllDbTemplates = () => {
    setSelectedDbTemplateIds([]);
  };

  const withTimeout = async <T,>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> => {
    let timeoutId: number | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(() => reject(new Error(`${label} timed out. Please confirm you're online and try again.`)), ms);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  };

  const fetchTemplateSectionsFromCloud = async (templateId: string) => {
    const { data, error } = await withTimeout<any>(
      supabase
        .from('template_sections')
        .select('*')
        .eq('template_id', templateId),
      20000,
      'Fetching sections'
    );
    if (error) throw error;
    return data || [];
  };

  const fetchTemplateCostItemsFromCloud = async (templateId: string, label: string, silent = false) => {
    const costItemsLimit = 5000; // Increased from 1000 for fewer round trips
    let hasMore = true;
    let lastId: string | null = null;
    let page = 0;
    let items: any[] = [];

    while (hasMore) {
      page += 1;
      if (!silent) {
        setStatus(
          `Fetching cost items: ${label} (page ${page}, ${items.length.toLocaleString()} loaded...)`
        );
        // ensure UI never looks stuck
        setProgress((prev) => Math.min(prev + 0.5, 44));
      }

      let q = supabase
        .from('template_cost_items')
        .select('*')
        .eq('template_id', templateId)
        .order('id', { ascending: true })
        .limit(costItemsLimit);

      if (lastId) q = q.gt('id', lastId);

      const { data, error } = await withTimeout<any>(q, 60000, 'Fetching cost items');
      if (error) throw error;

      const batch = data || [];
      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      items = items.concat(batch);
      lastId = batch[batch.length - 1]?.id ?? null;
      hasMore = batch.length === costItemsLimit;
    }

    return items;
  };

  // Parallel fetch helper - fetches multiple templates concurrently
  const fetchTemplatesDataInParallel = async (
    templates: typeof cloudTemplates,
    concurrency = 5
  ): Promise<{
    sections: { templateId: string; items: any[] }[];
    costItems: { templateId: string; items: any[] }[];
  }> => {
    const allSections: { templateId: string; items: any[] }[] = [];
    const allCostItems: { templateId: string; items: any[] }[] = [];

    // Process templates in batches for parallel execution
    for (let i = 0; i < templates.length; i += concurrency) {
      const batch = templates.slice(i, i + concurrency);
      const batchNum = Math.floor(i / concurrency) + 1;
      const totalBatches = Math.ceil(templates.length / concurrency);
      
      setStatus(`Fetching batch ${batchNum}/${totalBatches} (${batch.length} templates in parallel)...`);
      setProgress(5 + ((i / templates.length) * 40));

      // Fetch all templates in this batch concurrently
      const batchResults = await Promise.all(
        batch.map(async (template) => {
          const templateLabel = template.name || template.facility_name || template.inv_number || 'Template';
          
          // Fetch sections and cost items in parallel for each template
          const [sections, costItems] = await Promise.all([
            fetchTemplateSectionsFromCloud(template.id),
            fetchTemplateCostItemsFromCloud(template.id, templateLabel, true) // silent mode
          ]);

          return {
            templateId: template.id,
            sections: (sections || []).map((s: any) => ({
              sect: s.sect,
              description: s.description,
              full_section: s.full_section,
              cost_sheet: s.cost_sheet,
            })),
            costItems: (costItems || []).map((c: any) => ({
              ndc: c.ndc,
              material_description: c.material_description,
              unit_price: c.unit_price,
              source: c.source,
              material: c.material,
              sheet_name: c.sheet_name,
            })),
          };
        })
      );

      // Collect results
      for (const result of batchResults) {
        allSections.push({ templateId: result.templateId, items: result.sections });
        allCostItems.push({ templateId: result.templateId, items: result.costItems });
      }
    }

    return { sections: allSections, costItems: allCostItems };
  };

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

      if (selectedTemplates.length === 0 && !includeFDA) {
        throw new Error('Select at least 1 template or enable FDA to export');
      }

      setProgress(5);
      setStatus(`Preparing ${selectedTemplates.length} template(s)...`);

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

      // Use parallel fetching for significant speedup
      const { sections: fetchedSections, costItems: fetchedCostItems } = await fetchTemplatesDataInParallel(selectedTemplates, 5);
      
      // Convert to the expected format with full IDs
      const allSections: { templateId: string; items: OfflineSection[] }[] = fetchedSections.map(s => ({
        templateId: s.templateId,
        items: s.items.map((item: any) => ({
          id: item.id || crypto.randomUUID(),
          template_id: s.templateId,
          sect: item.sect,
          description: item.description,
          full_section: item.full_section,
          cost_sheet: item.cost_sheet,
        })),
      }));
      
      const allCostItems: { templateId: string; items: OfflineCostItem[] }[] = fetchedCostItems.map(c => ({
        templateId: c.templateId,
        items: c.items.map((item: any) => ({
          id: item.id || crypto.randomUUID(),
          template_id: c.templateId,
          ndc: item.ndc,
          material_description: item.material_description,
          unit_price: item.unit_price,
          source: item.source,
          material: item.material,
          sheet_name: item.sheet_name,
        })),
      }));

      setProgress(50);
      setStatus(includeFDA ? 'Gathering FDA data...' : 'Skipping FDA data...');

      // Get FDA drugs
      let fdaDrugs: FDADrug[] = [];
      const exportFdaMeta = includeFDA ? fdaMeta : null;
      if (includeFDA && fdaReady && fdaMeta) {
        // NOTE: this exports up to 50k rows currently
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
        fdaMeta: exportFdaMeta,
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

  // Export Template Database as .templatedb binary file (from selected cloud templates)
  const handleExportTemplateDb = async () => {
    setMode('export');
    setIsProcessing(true);
    setProgress(0);
    setStatus('Preparing template database export...');

    try {
      let result: { data: Uint8Array; meta: any } | null = null;

      // Filter to selected templates only
      const selectedTemplates = cloudTemplates.filter(t => selectedDbTemplateIds.includes(t.id));

      if (selectedTemplates.length === 0) {
        throw new Error('Please select at least one template to export');
      }

      // Build from cloud data
      setProgress(5);
      setStatus(`Fetching data for ${selectedTemplates.length} template(s)...`);

      // Use parallel fetching for significant speedup
      const { sections: allSections, costItems: allCostItems } = await fetchTemplatesDataInParallel(selectedTemplates, 5);

      setProgress(50);
      setStatus('Building template database...');

      if (!buildDatabaseFromCloudData) {
        throw new Error('Database builder not ready');
      }

      result = await buildDatabaseFromCloudData(
        selectedTemplates.map(t => ({
          id: t.id,
          name: t.name || 'Untitled',
          inv_date: t.inv_date,
          facility_name: t.facility_name,
          inv_number: t.inv_number,
          cost_file_name: t.cost_file_name,
          job_ticket_file_name: t.job_ticket_file_name,
        })),
        allSections,
        allCostItems
      );

      if (!result) {
        throw new Error('No data available to export');
      }

      setProgress(80);
      setStatus('Creating download file...');

      // Create file with metadata header + binary data
      const metaJson = JSON.stringify(result.meta);
      const metaBytes = new TextEncoder().encode(metaJson);
      const metaLengthBytes = new Uint32Array([metaBytes.length]);

      // Format: [4 bytes meta length][meta JSON][binary db data]
      const combined = new Uint8Array(4 + metaBytes.length + result.data.length);
      combined.set(new Uint8Array(metaLengthBytes.buffer), 0);
      combined.set(metaBytes, 4);
      combined.set(result.data, 4 + metaBytes.length);

      const blob = new Blob([combined], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `meridian-templates-${new Date().toISOString().split('T')[0]}.templatedb`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setProgress(100);
      setStatus('Export complete!');

      toast({
        title: 'Template database exported!',
        description: `Exported ${result.meta.templateCount} templates`,
      });

      setTimeout(() => {
        setMode('menu');
        setIsProcessing(false);
      }, 1500);

    } catch (err: any) {
      console.error('Template DB export error:', err);
      toast({
        title: 'Export failed',
        description: err.message,
        variant: 'destructive',
      });
      setIsProcessing(false);
      setMode('menu');
    }
  };

  // Import Template Database from .templatedb file
  const handleImportTemplateDb = async (file: File) => {
    if (!importDatabase) {
      toast({
        title: 'Database not ready',
        description: 'Please wait for the template database to initialize',
        variant: 'destructive',
      });
      return;
    }

    setMode('import');
    setIsProcessing(true);
    setProgress(10);
    setStatus('Reading template database file...');

    try {
      const arrayBuffer = await file.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);

      setProgress(30);
      setStatus('Parsing file...');

      // Parse format: [4 bytes meta length][meta JSON][binary db data]
      const metaLengthView = new Uint32Array(data.slice(0, 4).buffer);
      const metaLength = metaLengthView[0];
      
      const metaBytes = data.slice(4, 4 + metaLength);
      const metaJson = new TextDecoder().decode(metaBytes);
      const meta = JSON.parse(metaJson);

      const dbData = data.slice(4 + metaLength);

      setProgress(50);
      setStatus(`Importing ${meta.templateCount} templates...`);

      const result = await importDatabase(dbData, meta);

      if (!result.success) {
        throw new Error(result.error || 'Import failed');
      }

      setProgress(100);
      setStatus('Import complete!');

      toast({
        title: 'Template database imported!',
        description: `Imported ${meta.templateCount} templates successfully`,
      });

      setTimeout(() => {
        setMode('menu');
        setIsProcessing(false);
      }, 1500);

    } catch (err: any) {
      console.error('Template DB import error:', err);
      toast({
        title: 'Import failed',
        description: err.message,
        variant: 'destructive',
      });
      setIsProcessing(false);
      setMode('menu');
    }
  };

  const handleTemplateDbFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleImportTemplateDb(file);
    }
    if (templateDbInputRef.current) {
      templateDbInputRef.current.value = '';
    }
  };

  const resetDialog = () => {
    setMode('menu');
    setIsProcessing(false);
    setProgress(0);
    setStatus('');
  };

  const hasData = cloudTemplates.length > 0 || (fdaMeta && fdaMeta.rowCount > 0);
  const hasTemplateDb = templateDbReady && templateDbMeta && templateDbMeta.templateCount > 0;
  const canExportTemplateDb = hasTemplateDb || cloudTemplates.length > 0;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) resetDialog();
      onOpenChange(isOpen);
    }}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            {mode === 'select-templates' ? 'Select Templates to Export (JSON)' 
              : mode === 'select-templates-db' ? 'Select Templates (.templatedb)'
              : 'Offline Data Transfer'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'select-templates' 
              ? 'Choose which templates to include in the JSON export file'
              : mode === 'select-templates-db'
              ? 'Choose templates for fast binary export'
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
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{templateDbMeta?.templateCount || 0}</Badge>
                  <span className="text-muted-foreground">Local Templates</span>
                </div>
              </div>
              {syncMeta?.lastSyncedAt && (
                <p className="text-xs text-muted-foreground">
                  Last synced: {new Date(syncMeta.lastSyncedAt).toLocaleDateString()}
                </p>
              )}
            </div>

            {/* Template Database Export/Import Section */}
            <div className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Database className="h-4 w-4 text-primary" />
                <span>Template Database (.templatedb)</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Fast binary format for offline template data with cost items
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMode('select-templates-db')}
                  disabled={cloudTemplates.length === 0 || isProcessing}
                  className="flex-1"
                >
                  <Download className="h-4 w-4 mr-1" />
                  Export
                </Button>
                <div className="relative flex-1">
                  <input
                    ref={templateDbInputRef}
                    type="file"
                    accept=".templatedb"
                    onChange={handleTemplateDbFileSelect}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isProcessing}
                    className="w-full"
                  >
                    <Upload className="h-4 w-4 mr-1" />
                    Import
                  </Button>
                </div>
              </div>
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
                  <div className="font-medium">Export Cloud Data (JSON)</div>
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
                  <div className="font-medium">Import Cloud Data (JSON)</div>
                  <div className="text-xs text-muted-foreground">
                    Load data from another device
                  </div>
                </div>
              </Button>
            </div>

            {/* Info */}
            <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 p-3 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
              <div className="text-foreground">
                <p className="font-medium">Tip</p>
                <p>Use .templatedb format for faster offline imports. JSON is for backup/reference.</p>
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

            {/* FDA data toggle */}
            <div className="pt-3 border-t space-y-1">
              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                <Checkbox
                  checked={includeFDA}
                  onCheckedChange={(v) => setIncludeFDA(Boolean(v))}
                />
                <span>Include FDA Drug Database ({fdaMeta?.rowCount?.toLocaleString() || 0} drugs)</span>
              </label>
              <p className="text-xs text-muted-foreground">
                Turn off to make export smaller/faster (NDC drug lookup may be limited offline).
              </p>
            </div>

            {/* Export button */}
            <Button
              className="mt-4 w-full"
              onClick={handleExport}
              disabled={selectedTemplateIds.length === 0 && !includeFDA}
            >
              <Download className="h-4 w-4 mr-2" />
              {selectedTemplateIds.length === 0
                ? 'Export FDA Only'
                : `Export ${selectedTemplateIds.length} Template${selectedTemplateIds.length !== 1 ? 's' : ''}`}
            </Button>
          </div>
        )}

        {mode === 'select-templates-db' && (
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
                  {selectedDbTemplateIds.length} of {cloudTemplates.length} selected
                </span>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={selectAllDbTemplates} className="text-xs h-7">
                  Select All
                </Button>
                <Button variant="ghost" size="sm" onClick={deselectAllDbTemplates} className="text-xs h-7">
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
                        checked={selectedDbTemplateIds.includes(template.id)}
                        onCheckedChange={() => toggleDbTemplate(template.id)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {template.name || template.facility_name || template.inv_number || 'Untitled'}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {template.inv_number && `#${template.inv_number}`}
                          {template.inv_date && ` • ${new Date(template.inv_date).toLocaleDateString()}`}
                          {template.facility_name && template.name !== template.facility_name && ` • ${template.facility_name}`}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Export button */}
            <Button
              className="mt-4 w-full"
              onClick={handleExportTemplateDb}
              disabled={selectedDbTemplateIds.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Export {selectedDbTemplateIds.length} Template{selectedDbTemplateIds.length !== 1 ? 's' : ''} (.templatedb)
            </Button>
          </div>
        )}

        {(mode === 'export' || mode === 'import') && (
          <div className="py-6 space-y-4">
            <div className="flex items-center justify-center">
              {progress < 100 ? (
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
              ) : (
                <CheckCircle className="h-12 w-12 text-primary" />
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