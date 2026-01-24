import { useState, useCallback, useEffect, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, FileSpreadsheet, Search, Check, X, AlertCircle, Download, Loader2, Trash2, ArrowLeft, Play, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useLocalFDA, FDADrug } from '@/hooks/useLocalFDA';
import { useCloudTemplates, CloudTemplate, CloudSection, CloudCostItem } from '@/hooks/useCloudTemplates';
import { useOfflineTemplates } from '@/hooks/useOfflineTemplates';
import { useOnlineStatus } from '@/components/OfflineRedirect';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import * as XLSX from 'xlsx';

// Same row structure as Scan page
interface ScanRow {
  id: string;
  loc: string;
  device: string;
  rec: string;
  time: string;
  ndc: string;
  scannedNdc: string;
  qty: number | null;
  misDivisor: number | null;
  misCountMethod: string;
  itemNumber: string;
  medDesc: string;
  meridianDesc: string;
  trade: string;
  generic: string;
  strength: string;
  packSz: string;
  fdaSize: string;
  sizeTxt: string;
  doseForm: string;
  manufacturer: string;
  genericCode: string;
  deaClass: string;
  ahfs: string;
  source: string;
  packCost: number | null;
  unitCost: number | null;
  extended: number | null;
  blank: string;
  sheetType: string;
  auditCriteria: string;
  originalQty: number | null;
  auditorInitials: string;
  results: string;
  additionalNotes: string;
}

const Automation = () => {
  const { user } = useAuth();
  const { lookupNDC: fdaLookup, findOuterNDCsByNDC9, getDrugByOuterNDC, isReady: fdaReady } = useLocalFDA();
  const isOnline = useOnlineStatus();
  
  // Use cloud or offline templates based on connectivity
  const cloudTemplates = useCloudTemplates();
  const offlineTemplates = useOfflineTemplates();
  const { templates, getCostItemByNDC } = isOnline ? cloudTemplates : offlineTemplates as any;
  
  // User short name for REC
  const [userShortName, setUserShortName] = useState('');
  
  // Fetch user profile for short name
  useEffect(() => {
    const CACHE_KEY = 'cached_user_short_name';
    
    const fetchUserProfile = async () => {
      if (!navigator.onLine) {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) setUserShortName(cached);
        return;
      }
      
      if (!user?.id) {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) setUserShortName(cached);
        return;
      }
      
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, last_name, full_name')
          .eq('id', user.id)
          .maybeSingle();
        
        if (profile) {
          let shortName = '';
          if (profile.first_name && profile.last_name) {
            shortName = `${profile.first_name}${profile.last_name.charAt(0)}`;
          } else if (profile.full_name) {
            const parts = profile.full_name.trim().split(' ');
            if (parts.length >= 2) {
              shortName = `${parts[0]}${parts[parts.length - 1].charAt(0)}`;
            } else {
              shortName = parts[0];
            }
          }
          setUserShortName(shortName);
          if (shortName) localStorage.setItem(CACHE_KEY, shortName);
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) setUserShortName(cached);
      }
    };
    
    fetchUserProfile();
  }, [user?.id]);
  
  // State
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<CloudTemplate | null>(null);
  const [selectedSection, setSelectedSection] = useState<CloudSection | null>(null);
  const [sections, setSections] = useState<CloudSection[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [activeRowIndex, setActiveRowIndex] = useState(0);
  const [activeColKey, setActiveColKey] = useState<string | null>(null);
  const [step, setStep] = useState<'select' | 'import' | 'edit'>('select');

  // Create empty row
  const createEmptyRow = useCallback((sectionName?: string): ScanRow => ({
    id: crypto.randomUUID(),
    loc: sectionName || '',
    device: '',
    rec: '',
    time: '',
    ndc: '',
    scannedNdc: '',
    qty: null,
    misDivisor: null,
    misCountMethod: '',
    itemNumber: '',
    medDesc: '',
    meridianDesc: '',
    trade: '',
    generic: '',
    strength: '',
    packSz: '',
    fdaSize: '',
    sizeTxt: '',
    doseForm: '',
    manufacturer: '',
    genericCode: '',
    deaClass: '',
    ahfs: '',
    source: '',
    packCost: null,
    unitCost: null,
    extended: null,
    blank: '',
    sheetType: '',
    auditCriteria: '',
    originalQty: null,
    auditorInitials: '',
    results: '',
    additionalNotes: '',
  }), []);

  // Generate REC value based on row index
  const generateRecForRow = useCallback((rowIndex: number) => {
    const rowNum = rowIndex + 1;
    return `${userShortName}${String(rowNum).padStart(3, '0')}`;
  }, [userShortName]);

  // Load sections when template is selected
  const loadSections = useCallback(async (templateId: string) => {
    if (!isOnline) {
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

  // Handle template selection
  const handleTemplateSelect = useCallback(async (templateId: string) => {
    const template = templates.find((t: CloudTemplate) => t.id === templateId);
    if (!template) return;
    
    setSelectedTemplate(template);
    setSelectedSection(null);
    await loadSections(templateId);
  }, [templates, loadSections]);

  // Handle section selection
  const handleSectionChange = useCallback((sectionId: string) => {
    const section = sections.find(s => s.id === sectionId);
    if (section) {
      setSelectedSection(section);
    }
  }, [sections]);

  // Handle file upload
  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!selectedTemplate || !selectedSection) {
      toast.error('Please select a template and section first');
      return;
    }

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

      // Parse rows into ScanRow format
      const sectionName = selectedSection.full_section || selectedSection.sect;
      const parsedRows: ScanRow[] = [];
      
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        const ndc = row[ndcColIndex]?.toString().trim().replace(/-/g, '');
        const qty = parseFloat(row[qtyColIndex]?.toString() || '0') || null;
        
        if (ndc && ndc.length > 0) {
          const newRow = createEmptyRow(sectionName);
          newRow.scannedNdc = ndc;
          newRow.qty = qty;
          newRow.rec = generateRecForRow(parsedRows.length);
          newRow.time = new Date().toLocaleTimeString();
          parsedRows.push(newRow);
        }
      }

      if (parsedRows.length === 0) {
        toast.error('No valid NDC entries found in the file');
        return;
      }

      setRows(parsedRows);
      setStep('import');
      toast.success(`Loaded ${parsedRows.length} NDCs from file`);
    } catch (error) {
      console.error('Error parsing Excel file:', error);
      toast.error('Failed to parse Excel file');
    }
    
    event.target.value = '';
  }, [selectedTemplate, selectedSection, createEmptyRow, generateRecForRow]);

  // Process all NDCs through FDA + Cost lookup (same logic as Scan page)
  const handleProcessAll = useCallback(async () => {
    if (!fdaReady) {
      toast.error('FDA database not ready. Please import data in Master Data first.');
      return;
    }

    if (!selectedTemplate) {
      toast.error('No template selected');
      return;
    }

    setIsProcessing(true);
    setProcessProgress(0);

    const updatedRows = [...rows];
    
    for (let i = 0; i < updatedRows.length; i++) {
      const row = updatedRows[i];
      const scannedNdc = row.scannedNdc.replace(/-/g, '');
      
      if (!scannedNdc || scannedNdc.length < 10) {
        setProcessProgress(Math.round(((i + 1) / updatedRows.length) * 100));
        continue;
      }
      
      try {
        // Try to find outer NDC using NDC9 lookup (same as Scan page)
        const ndc9 = scannedNdc.substring(0, 9);
        const { outerNDCs, drugs } = findOuterNDCsByNDC9(ndc9);
        
        let finalNdc = scannedNdc;
        let fdaResult: FDADrug | null = null;
        
        if (outerNDCs.length === 1) {
          // Single match - use it
          finalNdc = outerNDCs[0];
          fdaResult = getDrugByOuterNDC(finalNdc);
        } else if (outerNDCs.length > 1) {
          // Multiple matches - try to find best match or use first
          fdaResult = getDrugByOuterNDC(outerNDCs[0]);
          finalNdc = outerNDCs[0];
        } else {
          // No outer NDC found, try direct lookup
          fdaResult = fdaLookup(scannedNdc);
        }
        
        // Get cost item
        const costItem = await getCostItemByNDC(
          selectedTemplate.id, 
          finalNdc, 
          selectedSection?.cost_sheet ?? null
        );
        
        // Populate row with lookup data (same mapping as Scan page)
        const misCountMethod = fdaResult?.count_method || '';
        const itemNumber = costItem?.material || '';
        const medDesc = costItem?.material_description || '';
        const meridianDesc = fdaResult?.meridian_desc || '';
        const trade = fdaResult?.trade || '';
        const generic = fdaResult?.generic || '';
        const strength = fdaResult?.strength || '';
        const packSz = fdaResult?.package_size || '';
        const fdaSize = fdaResult?.fda_size || '';
        const sizeTxt = fdaResult?.size_txt || '';
        const doseForm = fdaResult?.dose_form || '';
        const manufacturer = fdaResult?.manufacturer || costItem?.manufacturer || '';
        const genericCode = fdaResult?.generic_code || '';
        const deaClass = fdaResult?.dea_class || '';
        const ahfs = fdaResult?.ahfs || '';
        const packCost = costItem?.unit_price !== null && costItem?.unit_price !== undefined 
          ? Number(costItem.unit_price) 
          : null;
        const source = costItem?.source || (fdaResult ? 'FDA' : '');
        const misDivisor = fdaResult?.meridian_divisor ? Number(fdaResult.meridian_divisor) : null;
        
        // Calculate Unit Cost and Extended
        let unitCost: number | null = null;
        if (packCost !== null && misDivisor !== null && misDivisor !== 0) {
          unitCost = packCost / misDivisor;
        }
        
        let extended: number | null = null;
        if (unitCost !== null && row.qty !== null) {
          extended = unitCost * row.qty;
        }
        
        const outerNdcIsDifferent = finalNdc !== scannedNdc;
        
        updatedRows[i] = {
          ...row,
          ndc: outerNdcIsDifferent ? finalNdc : '',
          misCountMethod,
          itemNumber,
          medDesc,
          meridianDesc,
          trade,
          generic,
          strength,
          packSz,
          fdaSize,
          sizeTxt,
          doseForm,
          packCost,
          source,
          misDivisor,
          unitCost,
          extended,
          manufacturer,
          genericCode,
          deaClass,
          ahfs,
        };
      } catch (error) {
        console.error(`Error processing NDC ${scannedNdc}:`, error);
      }
      
      setProcessProgress(Math.round(((i + 1) / updatedRows.length) * 100));
      
      // Update rows progressively
      if (i % 5 === 0 || i === updatedRows.length - 1) {
        setRows([...updatedRows]);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    setRows(updatedRows);
    setIsProcessing(false);
    setStep('edit');
    
    const found = updatedRows.filter(r => r.source).length;
    const notFound = updatedRows.filter(r => !r.source).length;
    toast.success(`Processing complete: ${found} found, ${notFound} not found`);
  }, [rows, fdaLookup, findOuterNDCsByNDC9, getDrugByOuterNDC, getCostItemByNDC, selectedTemplate, selectedSection, fdaReady]);

  // Handle cell edit
  const handleCellChange = useCallback((rowIndex: number, key: keyof ScanRow, value: string | number | null) => {
    setRows(prev => {
      const updated = [...prev];
      updated[rowIndex] = { ...updated[rowIndex], [key]: value };
      
      // Recalculate Unit Cost and Extended when relevant fields change
      if (key === 'packCost' || key === 'misDivisor' || key === 'qty') {
        const row = updated[rowIndex];
        let unitCost: number | null = null;
        if (row.packCost !== null && row.misDivisor !== null && row.misDivisor !== 0) {
          unitCost = row.packCost / row.misDivisor;
        }
        updated[rowIndex].unitCost = unitCost;
        
        let extended: number | null = null;
        if (unitCost !== null && row.qty !== null) {
          extended = unitCost * row.qty;
        }
        updated[rowIndex].extended = extended;
      }
      
      return updated;
    });
  }, []);

  // Save to localStorage (same format as Scan page)
  const handleSave = useCallback(() => {
    if (!selectedTemplate || !selectedSection) {
      toast.error('No template or section selected');
      return;
    }
    
    const key = `scan_records_${selectedTemplate.id}_${selectedSection.id}`;
    
    // Get existing records
    const existingData = localStorage.getItem(key);
    let existingRecords: ScanRow[] = [];
    if (existingData) {
      try {
        existingRecords = JSON.parse(existingData);
      } catch (e) {
        console.error('Error parsing existing records:', e);
      }
    }
    
    // Merge: add new rows to existing
    const allRecords = [...existingRecords, ...rows];
    localStorage.setItem(key, JSON.stringify(allRecords));
    
    toast.success(`Saved ${rows.length} records to ${selectedSection.full_section || selectedSection.sect}`);
  }, [selectedTemplate, selectedSection, rows]);

  // Export to Excel
  const handleExport = useCallback(() => {
    if (rows.length === 0) {
      toast.error('No data to export');
      return;
    }

    const exportData = rows.map(row => ({
      'LOC': row.loc,
      'REC': row.rec,
      'TIME': row.time,
      'NDC': row.ndc || row.scannedNdc,
      'Scanned NDC': row.scannedNdc,
      'QTY': row.qty,
      'MIS Divisor': row.misDivisor,
      'MIS Count Method': row.misCountMethod,
      'Item Number': row.itemNumber,
      'Med Desc': row.medDesc,
      'Meridian Desc': row.meridianDesc,
      'Trade': row.trade,
      'Generic': row.generic,
      'Strength': row.strength,
      'Pack Sz': row.packSz,
      'FDA Size': row.fdaSize,
      'Dose Form': row.doseForm,
      'Manufacturer': row.manufacturer,
      'Source': row.source,
      'Pack Cost': row.packCost,
      'Unit Cost': row.unitCost,
      'Extended': row.extended,
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Automation Results');
    
    const exportFileName = `automation_${selectedTemplate?.name || 'export'}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, exportFileName);
    toast.success('Exported to Excel');
  }, [rows, selectedTemplate]);

  // Clear and start over
  const handleClear = useCallback(() => {
    setRows([]);
    setFileName(null);
    setProcessProgress(0);
    setStep('select');
  }, []);

  // Stats
  const stats = {
    total: rows.length,
    found: rows.filter(r => r.source).length,
    notFound: rows.filter(r => !r.source && r.scannedNdc).length,
    totalExtended: rows.reduce((sum, r) => sum + (r.extended || 0), 0),
  };

  // Editable columns (same as Scan page)
  const editableColumns: { key: keyof ScanRow; label: string; width: string; type: 'text' | 'number' }[] = [
    { key: 'scannedNdc', label: 'Scanned NDC', width: 'w-32', type: 'text' },
    { key: 'ndc', label: 'Outer NDC', width: 'w-32', type: 'text' },
    { key: 'qty', label: 'QTY', width: 'w-20', type: 'number' },
    { key: 'misDivisor', label: 'MIS Div', width: 'w-20', type: 'number' },
    { key: 'itemNumber', label: 'Item #', width: 'w-24', type: 'text' },
    { key: 'medDesc', label: 'Med Desc', width: 'w-48', type: 'text' },
    { key: 'meridianDesc', label: 'Meridian Desc', width: 'w-48', type: 'text' },
    { key: 'manufacturer', label: 'Manufacturer', width: 'w-32', type: 'text' },
    { key: 'source', label: 'Source', width: 'w-24', type: 'text' },
    { key: 'packCost', label: 'Pack Cost', width: 'w-24', type: 'number' },
    { key: 'unitCost', label: 'Unit Cost', width: 'w-24', type: 'number' },
    { key: 'extended', label: 'Extended', width: 'w-24', type: 'number' },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {step !== 'select' && (
              <Button variant="ghost" size="icon" onClick={handleClear}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <div>
              <h1 className="text-2xl font-bold">Automation</h1>
              <p className="text-muted-foreground">
                {step === 'select' && 'Select a template and section to import NDCs'}
                {step === 'import' && `${rows.length} NDCs loaded - ready to process`}
                {step === 'edit' && `Editing ${rows.length} records`}
              </p>
            </div>
          </div>
          
          {step === 'edit' && (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleExport} className="gap-2">
                <Download className="h-4 w-4" />
                Export
              </Button>
              <Button onClick={handleSave} className="gap-2">
                <Save className="h-4 w-4" />
                Save to Template
              </Button>
            </div>
          )}
        </div>

        {/* Step 1: Template & Section Selection */}
        {step === 'select' && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">1. Select Template</CardTitle>
              </CardHeader>
              <CardContent>
                <Select
                  value={selectedTemplate?.id || ''}
                  onValueChange={handleTemplateSelect}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template: CloudTemplate) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">2. Select Section</CardTitle>
              </CardHeader>
              <CardContent>
                <Select
                  value={selectedSection?.id || ''}
                  onValueChange={handleSectionChange}
                  disabled={!selectedTemplate}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={selectedTemplate ? "Choose a section..." : "Select template first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {sections.map(section => (
                      <SelectItem key={section.id} value={section.id}>
                        {section.full_section || section.sect}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5" />
                  3. Import Excel
                </CardTitle>
                <CardDescription>
                  Upload Excel with NDC and QTY columns
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  asChild 
                  variant="outline" 
                  className="w-full"
                  disabled={!selectedTemplate || !selectedSection}
                >
                  <label className="cursor-pointer">
                    <Upload className="mr-2 h-4 w-4" />
                    Choose File
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleFileUpload}
                      className="hidden"
                      disabled={!selectedTemplate || !selectedSection}
                    />
                  </label>
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 2: Processing */}
        {step === 'import' && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center gap-4">
                <div className="text-center">
                  <h3 className="font-semibold text-lg">Ready to Process</h3>
                  <p className="text-muted-foreground">
                    {rows.length} NDCs loaded from {fileName}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Template: {selectedTemplate?.name} → Section: {selectedSection?.full_section || selectedSection?.sect}
                  </p>
                </div>
                
                {isProcessing ? (
                  <div className="w-full max-w-md space-y-2">
                    <Progress value={processProgress} className="h-3" />
                    <p className="text-center text-sm text-muted-foreground">
                      Processing... {processProgress}%
                    </p>
                  </div>
                ) : (
                  <Button onClick={handleProcessAll} size="lg" className="gap-2">
                    <Play className="h-5 w-5" />
                    Lookup All NDCs
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Editable Table (like Scan page) */}
        {step === 'edit' && (
          <>
            {/* Stats Bar */}
            <div className="flex items-center gap-3 text-sm">
              <Badge variant="secondary">{stats.total} total</Badge>
              <Badge className="bg-primary text-primary-foreground">{stats.found} found</Badge>
              <Badge variant="destructive">{stats.notFound} not found</Badge>
              <Badge variant="secondary" className="font-mono ml-auto">
                Total: ${stats.totalExtended.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Badge>
            </div>

            {/* Editable Table */}
            <Card>
              <CardContent className="p-0">
                <ScrollArea className="h-[600px]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        {editableColumns.map(col => (
                          <TableHead key={col.key} className={col.width}>
                            {col.label}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row, rowIndex) => (
                        <TableRow 
                          key={row.id}
                          className={!row.source ? 'bg-destructive/10' : ''}
                        >
                          <TableCell className="text-muted-foreground font-mono text-xs">
                            {rowIndex + 1}
                          </TableCell>
                          {editableColumns.map(col => (
                            <TableCell key={col.key} className="p-0">
                              <Input
                                value={row[col.key]?.toString() || ''}
                                onChange={(e) => {
                                  const value = col.type === 'number' 
                                    ? (e.target.value ? parseFloat(e.target.value) : null)
                                    : e.target.value;
                                  handleCellChange(rowIndex, col.key, value);
                                }}
                                type={col.type === 'number' ? 'number' : 'text'}
                                className="border-0 rounded-none h-8 text-xs focus:ring-1 focus:ring-inset"
                                onFocus={() => {
                                  setActiveRowIndex(rowIndex);
                                  setActiveColKey(col.key);
                                }}
                              />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </>
        )}

        {/* Empty State */}
        {step === 'select' && !selectedTemplate && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="font-medium mb-1">Bulk Import NDCs</h3>
              <p className="text-sm text-muted-foreground text-center max-w-sm">
                Select a template and section, then upload an Excel file with NDC and QTY columns to bulk import data
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default Automation;
