import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Loader2, DollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface CostItem {
  id: string;
  ndc: string | null;
  material_description: string | null;
  unit_price: number | null;
  source: string | null;
  material: string | null; // ABC 6
  billing_date: string | null; // Invoice Date
  manufacturer: string | null;
  generic: string | null;
  strength: string | null;
  size: string | null;
  dose: string | null;
  sheet_name: string | null;
}

interface CostDataLookupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string | null;
}

interface ColumnDef {
  key: keyof CostItem;
  label: string;
  minWidth: number;
  defaultWidth: number;
}

const COLUMNS: ColumnDef[] = [
  { key: 'ndc', label: 'NDC', minWidth: 80, defaultWidth: 120 },
  { key: 'material_description', label: 'Product Description', minWidth: 150, defaultWidth: 250 },
  { key: 'unit_price', label: 'Invoice Price', minWidth: 80, defaultWidth: 100 },
  { key: 'source', label: 'Source', minWidth: 60, defaultWidth: 80 },
  { key: 'material', label: 'ABC 6', minWidth: 60, defaultWidth: 80 },
  { key: 'billing_date', label: 'Invoice Date', minWidth: 80, defaultWidth: 100 },
  { key: 'manufacturer', label: 'manu', minWidth: 80, defaultWidth: 120 },
  { key: 'generic', label: 'generic', minWidth: 100, defaultWidth: 150 },
  { key: 'strength', label: 'strength', minWidth: 60, defaultWidth: 80 },
  { key: 'size', label: 'size', minWidth: 50, defaultWidth: 60 },
  { key: 'dose', label: 'dose', minWidth: 50, defaultWidth: 60 },
];

export function CostDataLookupDialog({
  open,
  onOpenChange,
  templateId,
}: CostDataLookupDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [costItems, setCostItems] = useState<CostItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<CostItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('all');
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    COLUMNS.forEach(col => {
      initial[col.key] = col.defaultWidth;
    });
    return initial;
  });
  
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  // Load cost items when dialog opens
  const loadCostItems = useCallback(async () => {
    if (!templateId) return;
    
    setIsLoading(true);
    try {
      // First, get total count for this template
      const { count: totalItems } = await supabase
        .from('template_cost_items')
        .select('*', { count: 'exact', head: true })
        .eq('template_id', templateId);
      
      setTotalCount(totalItems || 0);

      // Get distinct sheet names using RPC-like approach - query 1 item per sheet
      // We do this by getting all unique sheet_name values
      const sheetSet = new Set<string>();
      
      // Strategy: Query items with offset stepping to find all unique sheets
      // For large datasets, we sample at different offsets to catch all sheets
      const offsets = [0, 50000, 100000, 150000, 200000, 250000];
      
      for (const offset of offsets) {
        if (offset >= (totalItems || 0)) break;
        
        const { data: sample } = await supabase
          .from('template_cost_items')
          .select('sheet_name')
          .eq('template_id', templateId)
          .not('sheet_name', 'is', null)
          .range(offset, offset + 100);
        
        sample?.forEach(s => {
          if (s.sheet_name) sheetSet.add(s.sheet_name);
        });
      }
      
      const uniqueSheets = Array.from(sheetSet).sort();
      console.log('Detected sheet names:', uniqueSheets, 'Total items:', totalItems);
      setSheetNames(uniqueSheets);

      // Load first batch of items
      const { data, error } = await supabase
        .from('template_cost_items')
        .select('id, ndc, material_description, unit_price, source, material, billing_date, manufacturer, generic, strength, size, dose, sheet_name')
        .eq('template_id', templateId)
        .order('sheet_name')
        .order('ndc')
        .limit(1000);

      if (error) throw error;
      setCostItems(data || []);
      setFilteredItems(data || []);
    } catch (err) {
      console.error('Error loading cost items:', err);
    } finally {
      setIsLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    if (open && templateId) {
      loadCostItems();
      setSearchQuery('');
      setSelectedSheet('all');
    }
  }, [open, templateId, loadCostItems]);

  // Filter items based on search query and selected sheet
  useEffect(() => {
    let items = costItems;

    // Filter by sheet
    if (selectedSheet !== 'all') {
      items = items.filter(item => item.sheet_name === selectedSheet);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      items = items.filter(item => 
        (item.ndc && item.ndc.toLowerCase().includes(query)) ||
        (item.generic && item.generic.toLowerCase().includes(query)) ||
        (item.material_description && item.material_description.toLowerCase().includes(query)) ||
        (item.manufacturer && item.manufacturer.toLowerCase().includes(query))
      );
    }

    setFilteredItems(items);
  }, [searchQuery, costItems, selectedSheet]);

  // Load data for specific sheet when tab is selected
  const loadSheetData = useCallback(async (sheetName: string) => {
    if (!templateId) return;
    
    setIsLoading(true);
    try {
      let query = supabase
        .from('template_cost_items')
        .select('id, ndc, material_description, unit_price, source, material, billing_date, manufacturer, generic, strength, size, dose, sheet_name')
        .eq('template_id', templateId)
        .order('ndc')
        .limit(1000);

      if (sheetName !== 'all') {
        query = query.eq('sheet_name', sheetName);
      }

      const { data, error } = await query;

      if (error) throw error;
      setCostItems(data || []);
      setFilteredItems(data || []);
    } catch (err) {
      console.error('Error loading sheet data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [templateId]);

  // Handle sheet tab click
  const handleSheetChange = (sheet: string) => {
    setSelectedSheet(sheet);
    setSearchQuery('');
    loadSheetData(sheet);
  };

  // Search in database for more results
  const handleDatabaseSearch = async () => {
    if (!templateId || !searchQuery.trim()) return;
    
    setIsLoading(true);
    try {
      const query = `%${searchQuery}%`;
      let dbQuery = supabase
        .from('template_cost_items')
        .select('id, ndc, material_description, unit_price, source, material, billing_date, manufacturer, generic, strength, size, dose, sheet_name')
        .eq('template_id', templateId)
        .or(`ndc.ilike.${query},generic.ilike.${query},material_description.ilike.${query}`)
        .limit(100);

      if (selectedSheet !== 'all') {
        dbQuery = dbQuery.eq('sheet_name', selectedSheet);
      }

      const { data, error } = await dbQuery;

      if (error) throw error;
      setFilteredItems(data || []);
    } catch (err) {
      console.error('Error searching cost items:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatPrice = (price: number | null) => {
    if (price === null || price === undefined) return '-';
    return `$${price.toFixed(4)}`;
  };

  const formatCellValue = (item: CostItem, key: keyof CostItem) => {
    const value = item[key];
    if (value === null || value === undefined) return '-';
    if (key === 'unit_price') return formatPrice(value as number);
    return String(value);
  };

  // Column resize handlers
  const handleResizeStart = (key: string, e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = {
      key,
      startX: e.clientX,
      startWidth: columnWidths[key],
    };
    
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  };

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!resizingRef.current) return;
    
    const { key, startX, startWidth } = resizingRef.current;
    const diff = e.clientX - startX;
    const colDef = COLUMNS.find(c => c.key === key);
    const minWidth = colDef?.minWidth || 50;
    const newWidth = Math.max(minWidth, startWidth + diff);
    
    setColumnWidths(prev => ({
      ...prev,
      [key]: newWidth,
    }));
  }, []);

  const handleResizeEnd = useCallback(() => {
    resizingRef.current = null;
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
  }, [handleResizeMove]);

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
    };
  }, [handleResizeMove, handleResizeEnd]);

  const currentSheetCount = selectedSheet === 'all' 
    ? costItems.length 
    : costItems.filter(item => item.sheet_name === selectedSheet).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[90vh] w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Cost Data Lookup
            <span className="text-sm font-normal text-muted-foreground">
              ({totalCount.toLocaleString()} items)
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Sheet Tabs - Excel-style */}
          {sheetNames.length > 0 && (
            <div className="flex items-center gap-1 border-b pb-2">
              <span className="text-xs text-muted-foreground mr-2">Sheets:</span>
              <div className="flex gap-1 flex-wrap">
                <Button
                  variant={selectedSheet === 'all' ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => handleSheetChange('all')}
                >
                  All Sheets
                </Button>
                {sheetNames.map(sheet => (
                  <Button
                    key={sheet}
                    variant={selectedSheet === sheet ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleSheetChange(sheet)}
                  >
                    {sheet}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by NDC, Generic, Description, Manufacturer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleDatabaseSearch()}
                className="pl-8"
                autoFocus
              />
            </div>
            <Button onClick={handleDatabaseSearch} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search DB'}
            </Button>
          </div>

          {/* Results count */}
          <div className="text-sm text-muted-foreground">
            Showing {filteredItems.length} of {currentSheetCount.toLocaleString()} items
            {selectedSheet !== 'all' && ` in ${selectedSheet}`}
            {searchQuery && ` matching "${searchQuery}"`}
          </div>

          {/* Results table with resizable columns */}
          <ScrollArea className="h-[55vh] rounded-md border">
            <div className="min-w-max">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-muted/80 backdrop-blur-sm">
                    {COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        className="relative text-left text-xs font-medium text-muted-foreground px-2 py-2 border-b select-none"
                        style={{ width: columnWidths[col.key], minWidth: col.minWidth }}
                      >
                        <span className="truncate block">{col.label}</span>
                        <div
                          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 active:bg-primary"
                          onMouseDown={(e) => handleResizeStart(col.key, e)}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={COLUMNS.length} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      </td>
                    </tr>
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={COLUMNS.length} className="text-center py-8 text-muted-foreground">
                        {searchQuery ? 'No matching cost items found' : 'No cost data available'}
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => (
                      <tr key={item.id} className="hover:bg-muted/30 border-b border-muted/20">
                        {COLUMNS.map((col) => (
                          <td
                            key={col.key}
                            className="px-2 py-1.5 text-xs truncate"
                            style={{ 
                              width: columnWidths[col.key], 
                              maxWidth: columnWidths[col.key],
                              minWidth: col.minWidth 
                            }}
                            title={formatCellValue(item, col.key)}
                          >
                            <span className={col.key === 'ndc' || col.key === 'unit_price' ? 'font-mono' : ''}>
                              {formatCellValue(item, col.key)}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
