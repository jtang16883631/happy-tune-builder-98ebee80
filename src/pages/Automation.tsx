import { useState, useCallback, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, FileSpreadsheet, Search, Check, X, AlertCircle, Download, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLocalFDA, FDADrug } from '@/hooks/useLocalFDA';
import { useCloudTemplates, CloudTemplate, CloudSection } from '@/hooks/useCloudTemplates';
import { useOfflineTemplates } from '@/hooks/useOfflineTemplates';
import { useOnlineStatus } from '@/components/OfflineRedirect';
import { supabase } from '@/integrations/supabase/client';
import * as XLSX from 'xlsx';

interface AutomationRow {
  id: string;
  ndc: string;
  qty: number;
  // Looked up data
  drugName: string | null;
  manufacturer: string | null;
  packageSize: string | null;
  unitCost: number | null;
  extended: number | null;
  source: string | null;
  status: 'pending' | 'found' | 'not_found' | 'error';
}

const Automation = () => {
  const { lookupNDC, isReady: fdaReady } = useLocalFDA();
  const isOnline = useOnlineStatus();
  
  // Use cloud or offline templates based on connectivity
  const cloudTemplates = useCloudTemplates();
  const offlineTemplates = useOfflineTemplates();
  const { templates } = isOnline ? cloudTemplates : offlineTemplates;
  
  // State
  const [rows, setRows] = useState<AutomationRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<CloudTemplate | null>(null);
  const [selectedSection, setSelectedSection] = useState<CloudSection | null>(null);
  const [sections, setSections] = useState<CloudSection[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);

  // Load sections when template is selected
  const loadSections = useCallback(async (templateId: string) => {
    if (!isOnline) {
      // For offline, try localStorage
      const offlineSections = localStorage.getItem(`template_sections_${templateId}`);
      if (offlineSections) {
        setSections(JSON.parse(offlineSections));
      }
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from('template_sections')
        .select('*')
        .eq('template_id', templateId)
        .order('sect');
      
      if (error) throw error;
      setSections((data || []) as CloudSection[]);
    } catch (err) {
      console.error('Error loading sections:', err);
      setSections([]);
    }
  }, [isOnline]);

  // Handle file upload
  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      // Find NDC and QTY columns
      const headerRow = jsonData[0] as string[];
      const ndcColIndex = headerRow.findIndex(h => 
        h?.toString().toLowerCase().includes('ndc') ||
        h?.toString().toLowerCase() === 'ndc'
      );
      const qtyColIndex = headerRow.findIndex(h => 
        h?.toString().toLowerCase().includes('qty') ||
        h?.toString().toLowerCase().includes('quantity') ||
        h?.toString().toLowerCase() === 'qty'
      );

      if (ndcColIndex === -1) {
        toast.error('Could not find NDC column in the Excel file');
        return;
      }

      if (qtyColIndex === -1) {
        toast.error('Could not find QTY/Quantity column in the Excel file');
        return;
      }

      // Parse rows
      const parsedRows: AutomationRow[] = [];
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        const ndc = row[ndcColIndex]?.toString().trim();
        const qty = parseFloat(row[qtyColIndex]?.toString() || '0') || 0;
        
        if (ndc && ndc.length > 0) {
          parsedRows.push({
            id: `${i}-${Date.now()}`,
            ndc,
            qty,
            drugName: null,
            manufacturer: null,
            packageSize: null,
            unitCost: null,
            extended: null,
            source: null,
            status: 'pending',
          });
        }
      }

      if (parsedRows.length === 0) {
        toast.error('No valid NDC entries found in the file');
        return;
      }

      setRows(parsedRows);
      toast.success(`Loaded ${parsedRows.length} NDCs from file`);
    } catch (error) {
      console.error('Error parsing Excel file:', error);
      toast.error('Failed to parse Excel file');
    }
    
    // Reset file input
    event.target.value = '';
  }, []);

  // Process all NDCs through FDA lookup
  const handleProcessAll = useCallback(async () => {
    if (!fdaReady) {
      toast.error('FDA database not ready. Please import data in Master Data first.');
      return;
    }

    setIsProcessing(true);
    setProcessProgress(0);

    const updatedRows = [...rows];
    
    for (let i = 0; i < updatedRows.length; i++) {
      const row = updatedRows[i];
      
      try {
        const result: FDADrug | null = lookupNDC(row.ndc);
        
        if (result) {
          updatedRows[i] = {
            ...row,
            drugName: result.meridian_desc || result.generic || result.trade || null,
            manufacturer: result.manufacturer || null,
            packageSize: result.package_size || result.fda_size || null,
            unitCost: null, // FDA data doesn't have unit cost - would need cost lookup
            extended: null,
            source: result.source || 'Local FDA',
            status: 'found',
          };
        } else {
          updatedRows[i] = {
            ...row,
            status: 'not_found',
          };
        }
      } catch (error) {
        updatedRows[i] = {
          ...row,
          status: 'error',
        };
      }
      
      setProcessProgress(Math.round(((i + 1) / updatedRows.length) * 100));
      setRows([...updatedRows]);
      
      // Small delay to prevent UI freeze
      if (i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    setIsProcessing(false);
    
    const found = updatedRows.filter(r => r.status === 'found').length;
    const notFound = updatedRows.filter(r => r.status === 'not_found').length;
    toast.success(`Processing complete: ${found} found, ${notFound} not found`);
  }, [rows, lookupNDC, fdaReady]);

  // Handle template selection
  const handleTemplateSelect = useCallback(async (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (!template) return;
    
    setSelectedTemplate(template);
    setSelectedSection(null);
    
    // Load sections for this template
    await loadSections(templateId);
  }, [templates, loadSections]);

  // Update sections when they are loaded
  useEffect(() => {
    // sections state is already managed by loadSections
  }, [sections]);

  // Handle section change
  const handleSectionChange = useCallback((sectionId: string) => {
    const section = sections.find(s => s.id === sectionId);
    if (section) {
      setSelectedSection(section);
    }
  }, [sections]);

  // Export to Excel
  const handleExport = useCallback(() => {
    if (rows.length === 0) {
      toast.error('No data to export');
      return;
    }

    const exportData = rows.map(row => ({
      'NDC': row.ndc,
      'QTY': row.qty,
      'Drug Name': row.drugName || '',
      'Manufacturer': row.manufacturer || '',
      'Package Size': row.packageSize || '',
      'Unit Cost': row.unitCost || '',
      'Extended': row.extended || '',
      'Source': row.source || '',
      'Status': row.status,
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Automation Results');
    
    const exportFileName = `automation_results_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, exportFileName);
    toast.success('Exported to Excel');
  }, [rows]);

  // Clear all data
  const handleClear = useCallback(() => {
    setRows([]);
    setFileName(null);
    setProcessProgress(0);
  }, []);

  // Stats
  const stats = {
    total: rows.length,
    found: rows.filter(r => r.status === 'found').length,
    notFound: rows.filter(r => r.status === 'not_found').length,
    pending: rows.filter(r => r.status === 'pending').length,
    totalExtended: rows.reduce((sum, r) => sum + (r.extended || 0), 0),
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Automation</h1>
            <p className="text-muted-foreground">
              Bulk import NDC lists from hospitals and auto-lookup pricing data
            </p>
          </div>
        </div>

        {/* Upload and Controls */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* File Upload Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Import Excel File
              </CardTitle>
              <CardDescription>
                Upload an Excel file with NDC and QTY columns
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <Button asChild variant="outline" className="flex-1">
                  <label className="cursor-pointer">
                    <Upload className="mr-2 h-4 w-4" />
                    Choose File
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </Button>
                {rows.length > 0 && (
                  <Button variant="ghost" size="icon" onClick={handleClear}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {fileName && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileSpreadsheet className="h-4 w-4" />
                  <span className="truncate">{fileName}</span>
                  <Badge variant="secondary">{rows.length} rows</Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Template Selection Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Target Template (Optional)</CardTitle>
              <CardDescription>
                Select a template to export results to
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select
                value={selectedTemplate?.id || ''}
                onValueChange={handleTemplateSelect}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map(template => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {selectedTemplate && sections.length > 0 && (
                <Select
                  value={selectedSection?.id || ''}
                  onValueChange={handleSectionChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select section..." />
                  </SelectTrigger>
                  <SelectContent>
                    {sections.map(section => (
                      <SelectItem key={section.id} value={section.id}>
                        {section.full_section || section.sect}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Processing Controls */}
        {rows.length > 0 && (
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap items-center gap-4">
                <Button
                  onClick={handleProcessAll}
                  disabled={isProcessing || stats.pending === 0}
                  className="gap-2"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4" />
                      Lookup All NDCs
                    </>
                  )}
                </Button>
                
                <Button variant="outline" onClick={handleExport} className="gap-2">
                  <Download className="h-4 w-4" />
                  Export Results
                </Button>

                {isProcessing && (
                  <div className="flex-1 min-w-[200px]">
                    <Progress value={processProgress} className="h-2" />
                    <span className="text-xs text-muted-foreground mt-1">
                      {processProgress}% complete
                    </span>
                  </div>
                )}

                {/* Stats */}
                <div className="ml-auto flex items-center gap-3 text-sm">
                  <Badge variant="secondary">{stats.total} total</Badge>
                  <Badge className="bg-primary text-primary-foreground">{stats.found} found</Badge>
                  <Badge variant="destructive">{stats.notFound} not found</Badge>
                  {stats.pending > 0 && (
                    <Badge variant="outline">{stats.pending} pending</Badge>
                  )}
                  {stats.totalExtended > 0 && (
                    <Badge variant="secondary" className="font-mono">
                      ${stats.totalExtended.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results Table */}
        {rows.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Results</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="w-[50px]">#</TableHead>
                      <TableHead>NDC</TableHead>
                      <TableHead className="text-right">QTY</TableHead>
                      <TableHead>Drug Name</TableHead>
                      <TableHead>Manufacturer</TableHead>
                      <TableHead>Package</TableHead>
                      <TableHead className="text-right">Unit Cost</TableHead>
                      <TableHead className="text-right">Extended</TableHead>
                      <TableHead className="w-[80px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, index) => (
                      <TableRow key={row.id}>
                        <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                        <TableCell className="font-mono text-xs">{row.ndc}</TableCell>
                        <TableCell className="text-right">{row.qty}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{row.drugName || '-'}</TableCell>
                        <TableCell className="max-w-[150px] truncate">{row.manufacturer || '-'}</TableCell>
                        <TableCell>{row.packageSize || '-'}</TableCell>
                        <TableCell className="text-right font-mono">
                          {row.unitCost ? `$${row.unitCost.toFixed(4)}` : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {row.extended ? `$${row.extended.toFixed(2)}` : '-'}
                        </TableCell>
                        <TableCell>
                          {row.status === 'pending' && (
                            <Badge variant="outline" className="gap-1">
                              <AlertCircle className="h-3 w-3" />
                            </Badge>
                          )}
                          {row.status === 'found' && (
                            <Badge className="gap-1 bg-primary text-primary-foreground">
                              <Check className="h-3 w-3" />
                            </Badge>
                          )}
                          {row.status === 'not_found' && (
                            <Badge variant="destructive" className="gap-1">
                              <X className="h-3 w-3" />
                            </Badge>
                          )}
                          {row.status === 'error' && (
                            <Badge variant="destructive" className="gap-1">
                              <AlertCircle className="h-3 w-3" />
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {rows.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="font-medium mb-1">No data imported</h3>
              <p className="text-sm text-muted-foreground text-center max-w-sm">
                Upload an Excel file with NDC and QTY columns to start bulk processing
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default Automation;
