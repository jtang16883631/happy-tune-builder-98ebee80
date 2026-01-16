import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, ScanBarcode, ArrowLeft, Plus, Trash2, Calendar, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useCloudTemplates, CloudTemplate } from '@/hooks/useCloudTemplates';
import { useLocalFDA } from '@/hooks/useLocalFDA';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

interface ScanRow {
  id: string;
  loc: string;
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
  packSz: string;
  fdaSize: string;
  manufacturer: string;
  source: string; // SOURCE from Cost Data Column E
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

const Scan = () => {
  const { isLoading: authLoading, roles } = useAuth();
  const navigate = useNavigate();
  const { 
    templates,
    isLoading: templatesLoading,
    getCostItemByNDC
  } = useCloudTemplates();
  
  const { lookupNDC: fdaLookup } = useLocalFDA();

  const [selectedTemplate, setSelectedTemplate] = useState<CloudTemplate | null>(null);
  
  const createEmptyRow = (): ScanRow => ({
    id: crypto.randomUUID(),
    loc: '',
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
    packSz: '',
    fdaSize: '',
    manufacturer: '',
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
  });

  const [scanRows, setScanRows] = useState<ScanRow[]>([createEmptyRow()]);
  const [activeRowIndex, setActiveRowIndex] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const hasRole = roles.length > 0;

  useEffect(() => {
    if (!authLoading && !hasRole) {
      navigate('/');
    }
  }, [authLoading, hasRole, navigate]);

  // Auto-save with debounce - using localStorage for scan records
  useEffect(() => {
    if (!selectedTemplate) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      const recordsToSave = scanRows
        .filter(r => r.ndc || r.scannedNdc)
        .map(r => ({ ...r, id: undefined }));
      
      localStorage.setItem(`scan_records_${selectedTemplate.id}`, JSON.stringify(recordsToSave));
    }, 500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [scanRows, selectedTemplate]);

  // Handle template selection - load saved records from localStorage
  const handleSelectTemplate = (template: CloudTemplate) => {
    setSelectedTemplate(template);
    
    const savedData = localStorage.getItem(`scan_records_${template.id}`);
    
    if (savedData) {
      try {
        const savedRecords = JSON.parse(savedData) as Omit<ScanRow, 'id'>[];
        const rows: ScanRow[] = savedRecords.map(r => ({
          ...createEmptyRow(),
          ...r,
          id: crypto.randomUUID(),
        }));
        rows.push(createEmptyRow());
        setScanRows(rows);
        setActiveRowIndex(rows.length - 1);
      } catch {
        setScanRows([createEmptyRow()]);
        setActiveRowIndex(0);
      }
    } else {
      setScanRows([createEmptyRow()]);
      setActiveRowIndex(0);
    }
  };

  // Lookup NDC and update row with mapping (by column position, not name):
  // TIME = laptop real time
  // MIS Count Method = FDA Column P (count_method)
  // Item Number = Cost Data Column E (material)
  // Med Desc = Cost Data Column B (material_description)
  // MERIDIAN DESC = FDA Column B (meridian_desc)
  // PACK SZ = FDA Column F (package_size)
  // FDA SIZE = FDA Column G (fda_size)
  // SOURCE = Cost Data Column C (source)
  // Pack Cost = Cost Data unit_price
  // MIS Divisor = FDA Column O (meridian_divisor)
  // Unit Cost = Pack Cost / MIS Divisor
  // Extended = Unit Cost * QTY
  const lookupNDC = useCallback(async (ndc: string, rowIndex: number) => {
    if (!ndc || ndc.length < 10 || !selectedTemplate) return;

    const cleanNdc = ndc.replace(/-/g, '');
    const fdaResult = fdaLookup(cleanNdc);
    const costItem = await getCostItemByNDC(selectedTemplate.id, cleanNdc);
    
    // MIS Count Method from FDA Column P (count_method)
    const misCountMethod = fdaResult?.count_method || '';
    
    // Item Number from Cost Data (material field)
    const itemNumber = costItem?.material || '';
    
    // Med Desc from Cost Data Column B (material_description)
    const medDesc = costItem?.material_description || 'Not found';
    
    // MERIDIAN DESC from FDA Column B (meridian_desc)
    const meridianDesc = fdaResult?.meridian_desc || '';
    
    // PACK SZ from FDA Column F (package_size)
    const packSz = fdaResult?.package_size || '';
    
    // FDA SIZE from FDA Column G (fda_size)
    const fdaSize = fdaResult?.fda_size || '';
    
    // Pack Cost from Cost Data Column C (unit_price)
    const packCost = costItem?.unit_price ? Number(costItem.unit_price) : null;
    
    // SOURCE from Cost Data Column E (source field)
    const source = costItem?.source || '';
    
    // MIS Divisor from FDA Column O (meridian_divisor)
    const misDivisor = fdaResult?.meridian_divisor ? Number(fdaResult.meridian_divisor) : null;
    
    // Unit Cost = Pack Cost / MIS Divisor
    let unitCost: number | null = null;
    if (packCost !== null && misDivisor !== null && misDivisor !== 0) {
      unitCost = packCost / misDivisor;
    }
    
    // Get current QTY to calculate Extended
    const currentQty = scanRows[rowIndex].qty;
    
    // Extended = Unit Cost * QTY
    let extended: number | null = null;
    if (unitCost !== null && currentQty !== null) {
      extended = unitCost * currentQty;
    }
    
    // Manufacturer from FDA or Cost Data
    const manufacturer = fdaResult?.manufacturer || costItem?.manufacturer || '';
    
    setScanRows(prev => {
      const updated = [...prev];
      updated[rowIndex] = {
        ...updated[rowIndex],
        ndc: cleanNdc,
        time: new Date().toLocaleTimeString(), // Real time from laptop
        misCountMethod,
        itemNumber,
        medDesc,
        meridianDesc,
        packSz,
        fdaSize,
        packCost,
        source,
        misDivisor,
        unitCost,
        extended,
        manufacturer,
      };
      return updated;
    });

    // Auto-add new row if this is the last row
    setScanRows(prev => {
      if (rowIndex === prev.length - 1) {
        return [...prev, createEmptyRow()];
      }
      return prev;
    });

    setTimeout(() => {
      if (inputRefs.current[rowIndex + 1]) {
        inputRefs.current[rowIndex + 1]?.focus();
        setActiveRowIndex(rowIndex + 1);
      }
    }, 100);
  }, [fdaLookup, getCostItemByNDC, selectedTemplate, scanRows]);

  // Handle field change - recalculate Extended when QTY or Unit Cost changes
  const handleFieldChange = (field: keyof ScanRow, value: string | number | null, rowIndex: number) => {
    setScanRows(prev => {
      const updated = [...prev];
      const row = { ...updated[rowIndex], [field]: value };
      
      // Recalculate Unit Cost when Pack Cost or MIS Divisor changes
      if (field === 'packCost' || field === 'misDivisor') {
        const packCost = field === 'packCost' ? (value as number | null) : row.packCost;
        const misDivisor = field === 'misDivisor' ? (value as number | null) : row.misDivisor;
        
        if (packCost !== null && misDivisor !== null && misDivisor !== 0) {
          row.unitCost = packCost / misDivisor;
        } else {
          row.unitCost = null;
        }
      }
      
      // Recalculate Extended when QTY or Unit Cost changes
      if (field === 'qty' || field === 'packCost' || field === 'misDivisor') {
        const qty = field === 'qty' ? (value as number | null) : row.qty;
        
        if (row.unitCost !== null && qty !== null) {
          row.extended = row.unitCost * qty;
        } else {
          row.extended = null;
        }
      }
      
      updated[rowIndex] = row;
      return updated;
    });
  };

  // Handle Enter key or barcode scan completion
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const ndc = scanRows[rowIndex].scannedNdc || scanRows[rowIndex].ndc;
      lookupNDC(ndc, rowIndex);
    }
  };

  // Delete a row
  const handleDeleteRow = (rowIndex: number) => {
    if (scanRows.length === 1) {
      setScanRows([createEmptyRow()]);
      return;
    }
    setScanRows(prev => prev.filter((_, i) => i !== rowIndex));
  };

  // Add new row
  const handleAddRow = () => {
    setScanRows(prev => [...prev, createEmptyRow()]);
    setTimeout(() => {
      const lastIndex = scanRows.length;
      inputRefs.current[lastIndex]?.focus();
      setActiveRowIndex(lastIndex);
    }, 100);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  const formatCurrency = (value: number | null) => {
    if (value === null) return '';
    return `$${value.toFixed(2)}`;
  };

  if (authLoading || templatesLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Template Selection View
  if (!selectedTemplate) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Scanner</h1>
            <p className="text-muted-foreground mt-1">
              Select a data template to start scanning
            </p>
          </div>

          {templates.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-16 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-lg">No Data Templates</h3>
                <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
                  Please import data templates first from the Data Template page.
                </p>
                <Button 
                  className="mt-4"
                  onClick={() => navigate('/')}
                >
                  Go to Data Templates
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {templates.map((template) => (
                <Card 
                  key={template.id}
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => handleSelectTemplate(template)}
                >
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-medium line-clamp-2">
                      {template.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    {template.facility_name && (
                      <p className="truncate">{template.facility_name}</p>
                    )}
                    {template.inv_date && (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        <span>{formatDate(template.inv_date)}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </AppLayout>
    );
  }

  // Column definitions
  const columns = [
    { key: 'loc', label: 'LOC', width: 'w-20', editable: true },
    { key: 'rec', label: 'REC', width: 'w-20', editable: true },
    { key: 'time', label: 'TIME', width: 'w-24', editable: false },
    { key: 'ndc', label: 'NDC', width: 'w-32', editable: true, isNdcInput: true },
    { key: 'scannedNdc', label: 'Scanned NDC', width: 'w-36', editable: true, isNdcInput: true },
    { key: 'qty', label: 'QTY', width: 'w-20', editable: true, type: 'number' },
    { key: 'misDivisor', label: 'MIS Divisor', width: 'w-24', editable: true, type: 'number' },
    { key: 'misCountMethod', label: 'MIS Count Method', width: 'w-32', editable: true },
    { key: 'itemNumber', label: 'Item Number', width: 'w-28', editable: true },
    { key: 'medDesc', label: 'Med Desc', width: 'w-48', editable: false },
    { key: 'meridianDesc', label: 'MERIDIAN DESC', width: 'w-48', editable: false },
    { key: 'packSz', label: 'PACK SZ', width: 'w-24', editable: true },
    { key: 'fdaSize', label: 'FDA SIZE', width: 'w-24', editable: false },
    { key: 'manufacturer', label: 'MANUFACTURER', width: 'w-36', editable: false },
    { key: 'source', label: 'SOURCE', width: 'w-24', editable: false },
    { key: 'packCost', label: 'Pack Cost', width: 'w-28', editable: true, type: 'currency' },
    { key: 'unitCost', label: 'Unit Cost', width: 'w-28', editable: false, type: 'currency' },
    { key: 'extended', label: 'Extended', width: 'w-28', editable: true, type: 'currency' },
    { key: 'blank', label: '$-', width: 'w-20', editable: true },
    { key: 'sheetType', label: 'Sheet Type', width: 'w-28', editable: true },
    { key: 'auditCriteria', label: 'Audit Criteria', width: 'w-32', editable: true },
    { key: 'originalQty', label: 'Original QTY', width: 'w-28', editable: true, type: 'number' },
    { key: 'auditorInitials', label: 'Auditor Initials', width: 'w-32', editable: true },
    { key: 'results', label: 'Results', width: 'w-28', editable: true },
    { key: 'additionalNotes', label: 'Additional Notes', width: 'w-48', editable: true },
  ];

  // Scan View (Excel-like with horizontal scroll)
  return (
    <AppLayout fullWidth>
      <div className="space-y-4 w-full">
        {/* Header with back button */}
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setSelectedTemplate(null)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">{selectedTemplate.name}</h1>
            <p className="text-muted-foreground text-sm">
              {selectedTemplate.facility_name} • {formatDate(selectedTemplate.inv_date)}
            </p>
          </div>
        </div>

        {/* Scan Input */}
        <Card className="w-full">
          <CardContent className="p-4">
            <div className="flex items-center gap-4 mb-4">
              <ScanBarcode className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Scan a barcode or enter NDC in "Scanned NDC" column, then press Enter
              </span>
              <Button 
                variant="outline" 
                size="sm" 
                className="ml-auto"
                onClick={handleAddRow}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Row
              </Button>
            </div>

            {/* Excel-like Table with horizontal scroll */}
            <ScrollArea className="w-full whitespace-nowrap rounded-lg border">
              <div className="min-w-max">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-12 text-center sticky left-0 bg-muted/50 z-10">#</TableHead>
                      {columns.map((col) => (
                        <TableHead key={col.key} className={`${col.width} text-xs font-medium`}>
                          {col.label}
                        </TableHead>
                      ))}
                      <TableHead className="w-12 sticky right-0 bg-muted/50 z-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scanRows.map((row, index) => (
                      <TableRow 
                        key={row.id}
                        className={index === activeRowIndex ? 'bg-primary/5' : ''}
                      >
                        <TableCell className="text-center text-muted-foreground font-mono text-xs sticky left-0 bg-background z-10">
                          {index + 1}
                        </TableCell>
                        {columns.map((col) => {
                          const value = row[col.key as keyof ScanRow];
                          
                          if (col.editable) {
                            return (
                              <TableCell key={col.key} className="p-1">
                                <Input
                                  ref={col.isNdcInput ? (el => inputRefs.current[index] = el) : undefined}
                                  value={value?.toString() || ''}
                                  onChange={(e) => {
                                    const newValue = col.type === 'number' || col.type === 'currency'
                                      ? (e.target.value ? parseFloat(e.target.value) : null)
                                      : e.target.value;
                                    handleFieldChange(col.key as keyof ScanRow, newValue, index);
                                  }}
                                  onKeyDown={col.isNdcInput ? (e) => handleKeyDown(e, index) : undefined}
                                  onFocus={() => setActiveRowIndex(index)}
                                  type={col.type === 'number' || col.type === 'currency' ? 'number' : 'text'}
                                  step={col.type === 'currency' ? '0.01' : undefined}
                                  className="font-mono h-8 text-xs border-0 focus-visible:ring-1 min-w-0"
                                />
                              </TableCell>
                            );
                          }
                          
                          return (
                            <TableCell 
                              key={col.key} 
                              className={`text-xs ${row.source === 'not_found' && (col.key === 'medDesc' || col.key === 'source') ? 'text-destructive' : ''}`}
                            >
                              {col.type === 'currency' 
                                ? formatCurrency(value as number | null)
                                : (value?.toString() || <span className="text-muted-foreground">—</span>)
                              }
                            </TableCell>
                          );
                        })}
                        <TableCell className="p-1 sticky right-0 bg-background z-10">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeleteRow(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>

            {/* Stats */}
            <div className="flex gap-4 mt-4 text-sm text-muted-foreground">
              <span>{scanRows.filter(r => r.ndc || r.scannedNdc).length} items scanned</span>
              <span>•</span>
              <span>{scanRows.filter(r => r.source === 'fda').length} found in FDA</span>
              <span>•</span>
              <span className="text-destructive">
                {scanRows.filter(r => r.source === 'not_found').length} not found
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Scan;
