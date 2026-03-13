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
import { Search, Loader2, DollarSign, Copy, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CostItem {
  id: string;
  ndc: string | null;
  material_description: string | null;
  unit_price: number | null;
  source: string | null;
  material: string | null;
  billing_date: string | null;
  manufacturer: string | null;
  generic: string | null;
  strength: string | null;
  size: string | null;
  dose: string | null;
  sheet_name: string | null;
}

interface OfflineCostSearchFns {
  searchCostItems: (templateId: string, query: string, sheetName?: string) => Promise<Array<{
    id: string; ndc: string | null; material_description: string | null;
    unit_price: number | null; source: string | null; material: string | null;
    sheet_name: string | null;
  }>>;
  getCostSheetNames: (templateId: string) => string[];
  getCostItemCount: (templateId: string, sheetName?: string) => number;
}

interface CostDataLookupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string | null;
  isOnline?: boolean;
  offlineFns?: OfflineCostSearchFns;
}

interface ColumnDef {
  key: keyof CostItem;
  label: string;
  minWidth: number;
  defaultWidth: number;
}

// Online mode shows all columns; offline shows a subset (no billing_date, manufacturer, generic, etc.)
const ALL_COLUMNS: ColumnDef[] = [
  { key: 'ndc', label: 'NDC', minWidth: 80, defaultWidth: 120 },
  { key: 'material_description', label: 'Product Description', minWidth: 150, defaultWidth: 250 },
  { key: 'unit_price', label: 'Invoice Price', minWidth: 80, defaultWidth: 100 },
  { key: 'source', label: 'Source', minWidth: 60, defaultWidth: 100 },
  { key: 'manufacturer', label: 'Manufacturer', minWidth: 100, defaultWidth: 150 },
  { key: 'material', label: 'ABC 6', minWidth: 60, defaultWidth: 80 },
  { key: 'billing_date', label: 'Invoice Date', minWidth: 80, defaultWidth: 100 },
  { key: 'generic', label: 'Generic', minWidth: 100, defaultWidth: 150 },
  { key: 'strength', label: 'Strength', minWidth: 60, defaultWidth: 80 },
  { key: 'size', label: 'Size', minWidth: 50, defaultWidth: 60 },
  { key: 'dose', label: 'Dose', minWidth: 50, defaultWidth: 60 },
];

const OFFLINE_COLUMNS: ColumnDef[] = [
  { key: 'ndc', label: 'NDC', minWidth: 80, defaultWidth: 140 },
  { key: 'material_description', label: 'Product Description', minWidth: 150, defaultWidth: 350 },
  { key: 'unit_price', label: 'Invoice Price', minWidth: 80, defaultWidth: 110 },
  { key: 'source', label: 'Source', minWidth: 60, defaultWidth: 120 },
  { key: 'material', label: 'ABC 6', minWidth: 60, defaultWidth: 100 },
];

export function CostDataLookupDialog({
  open,
  onOpenChange,
  templateId,
  isOnline = true,
  offlineFns,
}: CostDataLookupDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredItems, setFilteredItems] = useState<CostItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [hasSearched, setHasSearched] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const useOfflineMode = !isOnline && !!offlineFns;
  const COLUMNS = useOfflineMode ? OFFLINE_COLUMNS : ALL_COLUMNS;

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    ALL_COLUMNS.forEach(col => {
      initial[col.key] = col.defaultWidth;
    });
    OFFLINE_COLUMNS.forEach(col => {
      initial[col.key] = col.defaultWidth;
    });
    return initial;
  });
  
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  // Load sheet tabs only (no data) when dialog opens
  const loadSheetTabs = useCallback(async () => {
    if (!templateId) return;
    
    setIsLoading(true);
    try {
      if (useOfflineMode && offlineFns) {
        // Offline: use local SQLite
        const sheets = offlineFns.getCostSheetNames(templateId);
        const count = offlineFns.getCostItemCount(templateId);
        setTotalCount(count);
        setSheetNames(sheets);
        setSelectedSheet(sheets[0] || '');
      } else {
        // Online: use Supabase
        const { count: totalItems } = await supabase
          .from('template_cost_items')
          .select('*', { count: 'exact', head: true })
          .eq('template_id', templateId);
        
        setTotalCount(totalItems || 0);

        const sheetSet = new Set<string>();
        let lastSheet: string | null = null;
        const maxSheetsToDetect = 50;

        for (let i = 0; i < maxSheetsToDetect; i++) {
          let q = supabase
            .from('template_cost_items')
            .select('sheet_name')
            .eq('template_id', templateId)
            .not('sheet_name', 'is', null)
            .neq('sheet_name', '')
            .order('sheet_name')
            .limit(1);

          if (lastSheet) q = q.gt('sheet_name', lastSheet);

          const { data } = await q;
          const next = (data?.[0]?.sheet_name ?? '').trim();
          if (!next) break;

          sheetSet.add(next);
          lastSheet = next;
        }

        const uniqueSheets = Array.from(sheetSet).sort((a, b) => a.localeCompare(b));
        setSheetNames(uniqueSheets);
        setSelectedSheet(uniqueSheets[0] || '');
      }
    } catch (err) {
      console.error('Error loading sheet tabs:', err);
    } finally {
      setIsLoading(false);
    }
  }, [templateId, useOfflineMode, offlineFns]);

  useEffect(() => {
    if (open && templateId) {
      loadSheetTabs();
      setSearchQuery('');
      setFilteredItems([]);
      setHasSearched(false);
    }
  }, [open, templateId, loadSheetTabs]);

  // Handle sheet tab click - clear results, require new search
  const handleSheetChange = (sheet: string) => {
    setSelectedSheet(sheet);
    setSearchQuery('');
    setFilteredItems([]);
    setHasSearched(false);
  };

  // Search in database and auto-sort by source A-Z
  const handleDatabaseSearch = async () => {
    if (!templateId || !searchQuery.trim()) return;
    
    setIsLoading(true);
    setHasSearched(true);
    try {
      if (useOfflineMode && offlineFns) {
        // Offline: search local SQLite
        const results = await offlineFns.searchCostItems(templateId, searchQuery, selectedSheet || undefined);
        // Map to CostItem format (offline items don't have all fields)
        const mapped: CostItem[] = results.map(r => ({
          id: r.id,
          ndc: r.ndc,
          material_description: r.material_description,
          unit_price: r.unit_price,
          source: r.source,
          material: r.material,
          billing_date: null,
          manufacturer: null,
          generic: null,
          strength: null,
          size: null,
          dose: null,
          sheet_name: r.sheet_name,
        }));
        setFilteredItems(mapped);
      } else {
        // Online: search Supabase
        const query = `%${searchQuery}%`;
        let dbQuery = supabase
          .from('template_cost_items')
          .select('id, ndc, material_description, unit_price, source, material, billing_date, manufacturer, generic, strength, size, dose, sheet_name')
          .eq('template_id', templateId)
          .or(`ndc.ilike.${query},generic.ilike.${query},material_description.ilike.${query},manufacturer.ilike.${query}`)
          .order('source', { ascending: true, nullsFirst: false })
          .limit(500);

        if (selectedSheet) {
          dbQuery = dbQuery.eq('sheet_name', selectedSheet);
        }

        const { data, error } = await dbQuery;
        if (error) throw error;
        setFilteredItems(data || []);
      }
    } catch (err) {
      console.error('Error searching cost items:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Format price as $99.99
  const formatPrice = (price: number | null) => {
    if (price === null || price === undefined) return '-';
    return `$${price.toFixed(2)}`;
  };

  const formatCellValue = (item: CostItem, key: keyof CostItem) => {
    const value = item[key];
    if (value === null || value === undefined) return '-';
    if (key === 'unit_price') return formatPrice(value as number);
    return String(value);
  };

  // Copy all visible data including header to clipboard
  const handleCopyAll = async () => {
    const header = COLUMNS.map(col => col.label).join('\t');
    const rows = filteredItems.map(item =>
      COLUMNS.map(col => {
        const value = item[col.key];
        if (value === null || value === undefined) return '';
        if (col.key === 'unit_price') return formatPrice(value as number);
        return String(value);
      }).join('\t')
    );
    const text = [header, ...rows].join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      toast.success(`Copied ${filteredItems.length + 1} rows (including header) to clipboard`);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
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
    const colDef = ALL_COLUMNS.find(c => c.key === key) || OFFLINE_COLUMNS.find(c => c.key === key);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[90vh] w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Cost Data Lookup
            {useOfflineMode && (
              <span className="text-xs font-normal text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30 px-2 py-0.5 rounded">
                Offline
              </span>
            )}
            <span className="text-sm font-normal text-muted-foreground">
              ({totalCount.toLocaleString()} items total)
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Sheet Tabs - Excel-style, no "All Sheets" */}
          {sheetNames.length > 0 && (
            <div className="flex items-center gap-1 border-b">
              <div className="flex gap-0 overflow-x-auto">
                {sheetNames.map(sheet => (
                  <button
                    key={sheet}
                    onClick={() => handleSheetChange(sheet)}
              className={`px-4 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                      selectedSheet === sheet
                        ? 'border-primary text-primary bg-primary/10'
                        : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    {sheet}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Search + controls row */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={useOfflineMode 
                  ? "Search by NDC, Description, ABC 6..." 
                  : "Search by NDC, Generic, Description, Manufacturer..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleDatabaseSearch()}
                className="pl-8"
                autoFocus
              />
            </div>
            <Button onClick={handleDatabaseSearch} disabled={isLoading || !searchQuery.trim()} variant="outline">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
            </Button>
            <Button
              onClick={handleCopyAll}
              disabled={isLoading || filteredItems.length === 0}
              variant="outline"
              className="whitespace-nowrap"
              title="Copy all data including header to clipboard"
            >
              {isCopied ? (
                <><Check className="h-4 w-4 mr-1 text-primary" />Copied!</>
              ) : (
                <><Copy className="h-4 w-4 mr-1" />Copy All</>
              )}
            </Button>
          </div>

          {/* Results count */}
          {hasSearched && (
            <div className="text-sm text-muted-foreground">
              Showing {filteredItems.length.toLocaleString()} results
              {selectedSheet && ` in "${selectedSheet}"`}
              {searchQuery && ` for "${searchQuery}"`}
              {filteredItems.length > 0 && ' · sorted by Source A–Z'}
            </div>
          )}

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
                      <td colSpan={COLUMNS.length} className="text-center py-12 text-muted-foreground">
                        {!hasSearched ? (
                          <div className="flex flex-col items-center gap-2">
                            <Search className="h-8 w-8 opacity-30" />
                            <span>Type a search term and press Enter or click Search</span>
                            <span className="text-xs opacity-60">Results are automatically sorted by Source A–Z</span>
                          </div>
                        ) : 'No matching cost items found'}
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
