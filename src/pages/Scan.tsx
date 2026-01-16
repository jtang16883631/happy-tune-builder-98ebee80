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

interface ScanRow {
  id: string;
  ndc: string;
  description: string;
  price: number | null;
  source: 'fda' | 'cost_data' | 'not_found' | '';
}

const Scan = () => {
  const { isLoading: authLoading, roles } = useAuth();
  const navigate = useNavigate();
  const { 
    templates,
    isReady, 
    isLoading: templatesLoading,
    saveScanRecords,
    loadScanRecords,
    getCostItemByNDC
  } = useCloudTemplates();
  const { lookupNDC: fdaLookup, isReady: fdaReady } = useLocalFDA();

  const [selectedTemplate, setSelectedTemplate] = useState<CloudTemplate | null>(null);
  const [scanRows, setScanRows] = useState<ScanRow[]>([
    { id: crypto.randomUUID(), ndc: '', description: '', price: null, source: '' }
  ]);
  const [activeRowIndex, setActiveRowIndex] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const hasRole = roles.length > 0;

  useEffect(() => {
    if (!authLoading && !hasRole) {
      navigate('/');
    }
  }, [authLoading, hasRole, navigate]);

  // Auto-save with debounce
  useEffect(() => {
    if (!selectedTemplate || !isReady) return;

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce save - wait 500ms after last change
    saveTimeoutRef.current = setTimeout(async () => {
      const recordsToSave = scanRows
        .filter(r => r.ndc)
        .map(r => ({
          ndc: r.ndc,
          description: r.description,
          price: r.price,
          source: r.source
        }));
      
      if (recordsToSave.length > 0) {
        await saveScanRecords(selectedTemplate.id, recordsToSave);
      }
    }, 500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [scanRows, selectedTemplate, isReady, saveScanRecords]);

  // Handle template selection - load saved records
  const handleSelectTemplate = async (template: CloudTemplate) => {
    setSelectedTemplate(template);
    
    // Load saved scan records for this template
    const savedRecords = await loadScanRecords(template.id);
    
    if (savedRecords.length > 0) {
      const rows: ScanRow[] = savedRecords.map(r => ({
        id: crypto.randomUUID(),
        ndc: r.ndc,
        description: r.description || '',
        price: r.price,
        source: (r.source as ScanRow['source']) || ''
      }));
      // Add empty row at the end
      rows.push({ id: crypto.randomUUID(), ndc: '', description: '', price: null, source: '' });
      setScanRows(rows);
      setActiveRowIndex(rows.length - 1);
    } else {
      setScanRows([
        { id: crypto.randomUUID(), ndc: '', description: '', price: null, source: '' }
      ]);
      setActiveRowIndex(0);
    }
  };

  // Lookup NDC and update row
  const lookupNDC = useCallback(async (ndc: string, rowIndex: number) => {
    if (!ndc || ndc.length < 10 || !selectedTemplate) return;

    // Clean the NDC (remove dashes)
    const cleanNdc = ndc.replace(/-/g, '');

    // Try FDA lookup for description
    const fdaResult = fdaLookup(cleanNdc);
    
    // Try cost data lookup for price
    const costItem = await getCostItemByNDC(selectedTemplate.id, cleanNdc);
    
    const description = fdaResult 
      ? (fdaResult.meridian_desc || fdaResult.trade || fdaResult.generic || '')
      : (costItem?.material_description || 'Not found');
    
    const price = costItem?.unit_price ? Number(costItem.unit_price) : null;
    const source: ScanRow['source'] = fdaResult ? 'fda' : (costItem ? 'cost_data' : 'not_found');
    
    setScanRows(prev => {
      const updated = [...prev];
      updated[rowIndex] = {
        ...updated[rowIndex],
        ndc: cleanNdc,
        description,
        price,
        source
      };
      return updated;
    });

    // Auto-add new row if this is the last row
    setScanRows(prev => {
      if (rowIndex === prev.length - 1) {
        return [...prev, { id: crypto.randomUUID(), ndc: '', description: '', price: null, source: '' }];
      }
      return prev;
    });

    // Move focus to next row
    setTimeout(() => {
      if (inputRefs.current[rowIndex + 1]) {
        inputRefs.current[rowIndex + 1]?.focus();
        setActiveRowIndex(rowIndex + 1);
      }
    }, 100);
  }, [fdaLookup, getCostItemByNDC, selectedTemplate]);

  // Handle NDC input change
  const handleNdcChange = (value: string, rowIndex: number) => {
    setScanRows(prev => {
      const updated = [...prev];
      updated[rowIndex] = { ...updated[rowIndex], ndc: value };
      return updated;
    });
  };

  // Handle Enter key or barcode scan completion
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const ndc = scanRows[rowIndex].ndc;
      lookupNDC(ndc, rowIndex);
    }
  };

  // Delete a row
  const handleDeleteRow = (rowIndex: number) => {
    if (scanRows.length === 1) {
      setScanRows([{ id: crypto.randomUUID(), ndc: '', description: '', price: null, source: '' }]);
      return;
    }
    setScanRows(prev => prev.filter((_, i) => i !== rowIndex));
  };

  // Add new row
  const handleAddRow = () => {
    setScanRows(prev => [...prev, { id: crypto.randomUUID(), ndc: '', description: '', price: null, source: '' }]);
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

  // Scan View (Excel-like)
  return (
    <AppLayout>
      <div className="space-y-4">
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
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4 mb-4">
              <ScanBarcode className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Scan a barcode or enter NDC manually, then press Enter
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

            {/* Excel-like Table */}
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-12 text-center">#</TableHead>
                    <TableHead className="w-48">NDC</TableHead>
                    <TableHead className="flex-1">Description</TableHead>
                    <TableHead className="w-32 text-right">Price</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scanRows.map((row, index) => (
                    <TableRow 
                      key={row.id}
                      className={index === activeRowIndex ? 'bg-primary/5' : ''}
                    >
                      <TableCell className="text-center text-muted-foreground font-mono text-sm">
                        {index + 1}
                      </TableCell>
                      <TableCell className="p-1">
                        <Input
                          ref={el => inputRefs.current[index] = el}
                          value={row.ndc}
                          onChange={(e) => handleNdcChange(e.target.value, index)}
                          onKeyDown={(e) => handleKeyDown(e, index)}
                          onFocus={() => setActiveRowIndex(index)}
                          placeholder="Enter NDC..."
                          className="font-mono h-9 border-0 focus-visible:ring-1"
                        />
                      </TableCell>
                      <TableCell className={`text-sm ${row.source === 'not_found' ? 'text-destructive' : ''}`}>
                        {row.description || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {row.price !== null ? `$${row.price.toFixed(2)}` : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="p-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
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

            {/* Stats */}
            <div className="flex gap-4 mt-4 text-sm text-muted-foreground">
              <span>{scanRows.filter(r => r.ndc).length} items scanned</span>
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
