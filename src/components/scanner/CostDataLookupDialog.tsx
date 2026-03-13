import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Loader2, DollarSign, Copy, Check, X, Minus, Maximize2, Minimize2, GripHorizontal } from 'lucide-react';
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

const MIN_WIDTH = 400;
const MIN_HEIGHT = 300;

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
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  // Window position & size
  const [windowPos, setWindowPos] = useState({ x: 0, y: 0 });
  const [windowSize, setWindowSize] = useState({ w: 0, h: 0 });
  const [preMaxState, setPreMaxState] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const useOfflineMode = !isOnline && !!offlineFns;
  const COLUMNS = useOfflineMode ? OFFLINE_COLUMNS : ALL_COLUMNS;

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    ALL_COLUMNS.forEach(col => { initial[col.key] = col.defaultWidth; });
    OFFLINE_COLUMNS.forEach(col => { initial[col.key] = col.defaultWidth; });
    return initial;
  });

  const colResizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);
  const windowRef = useRef<HTMLDivElement>(null);

  // Initialize position/size when opening
  useEffect(() => {
    if (open) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = Math.min(Math.max(vw * 0.55, MIN_WIDTH), vw - 40);
      const h = Math.min(Math.max(vh * 0.7, MIN_HEIGHT), vh - 40);
      setWindowSize({ w, h });
      setWindowPos({ x: vw - w - 20, y: 20 });
      setIsMinimized(false);
      setIsMaximized(false);
      setPreMaxState(null);
    }
  }, [open]);

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (isMaximized) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: windowPos.x, origY: windowPos.y };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      setWindowPos({
        x: Math.max(0, Math.min(window.innerWidth - 100, dragRef.current.origX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 40, dragRef.current.origY + dy)),
      });
    };
    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [isMaximized, windowPos]);

  // Resize handlers (bottom-right corner)
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    if (isMaximized) return;
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, origW: windowSize.w, origH: windowSize.h };

    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const dw = ev.clientX - resizeRef.current.startX;
      const dh = ev.clientY - resizeRef.current.startY;
      setWindowSize({
        w: Math.max(MIN_WIDTH, resizeRef.current.origW + dw),
        h: Math.max(MIN_HEIGHT, resizeRef.current.origH + dh),
      });
    };
    const onUp = () => {
      resizeRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [isMaximized, windowSize]);

  // Maximize/restore
  const toggleMaximize = () => {
    if (isMaximized) {
      if (preMaxState) {
        setWindowPos({ x: preMaxState.x, y: preMaxState.y });
        setWindowSize({ w: preMaxState.w, h: preMaxState.h });
      }
      setIsMaximized(false);
    } else {
      setPreMaxState({ ...windowPos, ...windowSize });
      setWindowPos({ x: 0, y: 0 });
      setWindowSize({ w: window.innerWidth, h: window.innerHeight });
      setIsMaximized(true);
    }
  };

  // Load sheet tabs
  const loadSheetTabs = useCallback(async () => {
    if (!templateId) return;
    setIsLoading(true);
    try {
      if (useOfflineMode && offlineFns) {
        const sheets = offlineFns.getCostSheetNames(templateId);
        const count = offlineFns.getCostItemCount(templateId);
        setTotalCount(count);
        setSheetNames(sheets);
        setSelectedSheet(sheets[0] || '');
      } else {
        const { count: totalItems } = await supabase
          .from('template_cost_items')
          .select('*', { count: 'exact', head: true })
          .eq('template_id', templateId);
        setTotalCount(totalItems || 0);

        const sheetSet = new Set<string>();
        let lastSheet: string | null = null;
        for (let i = 0; i < 50; i++) {
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

  const handleSheetChange = (sheet: string) => {
    setSelectedSheet(sheet);
    setSearchQuery('');
    setFilteredItems([]);
    setHasSearched(false);
  };

  const handleDatabaseSearch = async () => {
    if (!templateId || !searchQuery.trim()) return;
    setIsLoading(true);
    setHasSearched(true);
    try {
      if (useOfflineMode && offlineFns) {
        const results = await offlineFns.searchCostItems(templateId, searchQuery, selectedSheet || undefined);
        const mapped: CostItem[] = results.map(r => ({
          id: r.id, ndc: r.ndc, material_description: r.material_description,
          unit_price: r.unit_price, source: r.source, material: r.material,
          billing_date: null, manufacturer: null, generic: null,
          strength: null, size: null, dose: null, sheet_name: r.sheet_name,
        }));
        setFilteredItems(mapped);
      } else {
        const query = `%${searchQuery}%`;
        let dbQuery = supabase
          .from('template_cost_items')
          .select('id, ndc, material_description, unit_price, source, material, billing_date, manufacturer, generic, strength, size, dose, sheet_name')
          .eq('template_id', templateId)
          .or(`ndc.ilike.${query},generic.ilike.${query},material_description.ilike.${query},manufacturer.ilike.${query}`)
          .order('source', { ascending: true, nullsFirst: false })
          .limit(500);
        if (selectedSheet) dbQuery = dbQuery.eq('sheet_name', selectedSheet);
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
      toast.success(`Copied ${filteredItems.length + 1} rows to clipboard`);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  };

  // Column resize handlers
  const handleColResizeStart = (key: string, e: React.MouseEvent) => {
    e.preventDefault();
    colResizingRef.current = { key, startX: e.clientX, startWidth: columnWidths[key] };
    const onMove = (ev: MouseEvent) => {
      if (!colResizingRef.current) return;
      const { key: k, startX, startWidth } = colResizingRef.current;
      const diff = ev.clientX - startX;
      const colDef = ALL_COLUMNS.find(c => c.key === k) || OFFLINE_COLUMNS.find(c => c.key === k);
      setColumnWidths(prev => ({ ...prev, [k]: Math.max(colDef?.minWidth || 50, startWidth + diff) }));
    };
    const onUp = () => {
      colResizingRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  if (!open) return null;

  const posStyle = isMaximized
    ? { left: 0, top: 0, width: '100vw', height: '100vh' }
    : isMinimized
      ? { left: windowPos.x, top: windowPos.y, width: windowSize.w, height: 'auto' }
      : { left: windowPos.x, top: windowPos.y, width: windowSize.w, height: windowSize.h };

  return createPortal(
    <div
      ref={windowRef}
      className="fixed z-50 flex flex-col rounded-lg border border-border bg-background shadow-2xl overflow-hidden"
      style={posStyle}
    >
      {/* Title bar - draggable */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-muted/80 border-b cursor-move select-none shrink-0"
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-2 text-sm font-semibold truncate">
          <GripHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />
          <DollarSign className="h-4 w-4 shrink-0" />
          <span className="truncate">Cost Data Lookup</span>
          {useOfflineMode && (
            <span className="text-[10px] font-normal text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30 px-1.5 py-0.5 rounded">
              Offline
            </span>
          )}
          <span className="text-xs font-normal text-muted-foreground">
            ({totalCount.toLocaleString()} items)
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0" onMouseDown={e => e.stopPropagation()}>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? <Maximize2 className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={toggleMaximize}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            {isMaximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Content - hidden when minimized */}
      {!isMinimized && (
        <div className="flex-1 flex flex-col overflow-hidden p-3 gap-2">
          {/* Sheet Tabs */}
          {sheetNames.length > 0 && (
            <div className="flex items-center gap-1 border-b shrink-0">
              <div className="flex gap-0 overflow-x-auto">
                {sheetNames.map(sheet => (
                  <button
                    key={sheet}
                    onClick={() => handleSheetChange(sheet)}
                    className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
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

          {/* Search row */}
          <div className="flex gap-2 shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={useOfflineMode
                  ? "Search NDC, Description, ABC 6..."
                  : "Search NDC, Generic, Description, Manufacturer..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleDatabaseSearch()}
                className="pl-8 h-8 text-sm"
                autoFocus
              />
            </div>
            <Button onClick={handleDatabaseSearch} disabled={isLoading || !searchQuery.trim()} variant="outline" size="sm">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
            </Button>
            <Button
              onClick={handleCopyAll}
              disabled={isLoading || filteredItems.length === 0}
              variant="outline"
              size="sm"
              title="Copy all data to clipboard"
            >
              {isCopied ? <><Check className="h-3.5 w-3.5 mr-1 text-primary" />Copied</> : <><Copy className="h-3.5 w-3.5 mr-1" />Copy</>}
            </Button>
          </div>

          {/* Results count */}
          {hasSearched && (
            <div className="text-xs text-muted-foreground shrink-0">
              {filteredItems.length.toLocaleString()} results
              {selectedSheet && ` in "${selectedSheet}"`}
              {filteredItems.length > 0 && ' · sorted by Source A–Z'}
            </div>
          )}

          {/* Results table */}
          <ScrollArea className="flex-1 rounded-md border">
            <div className="min-w-max">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-muted/80 backdrop-blur-sm">
                    {COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        className="relative text-left text-xs font-medium text-muted-foreground px-2 py-1.5 border-b select-none"
                        style={{ width: columnWidths[col.key], minWidth: col.minWidth }}
                      >
                        <span className="truncate block">{col.label}</span>
                        <div
                          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 active:bg-primary"
                          onMouseDown={(e) => handleColResizeStart(col.key, e)}
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
                        {!hasSearched ? (
                          <div className="flex flex-col items-center gap-1">
                            <Search className="h-6 w-6 opacity-30" />
                            <span className="text-xs">Search to find cost items</span>
                          </div>
                        ) : 'No matching items found'}
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => (
                      <tr key={item.id} className="hover:bg-muted/30 border-b border-muted/20">
                        {COLUMNS.map((col) => (
                          <td
                            key={col.key}
                            className="px-2 py-1 text-xs truncate"
                            style={{ width: columnWidths[col.key], maxWidth: columnWidths[col.key], minWidth: col.minWidth }}
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
      )}

      {/* Resize handle (bottom-right corner) */}
      {!isMinimized && !isMaximized && (
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
          onMouseDown={handleResizeStart}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" className="text-muted-foreground/50">
            <path d="M14 14L8 14L14 8Z" fill="currentColor" />
            <path d="M14 14L11 14L14 11Z" fill="currentColor" opacity="0.5" />
          </svg>
        </div>
      )}
    </div>,
    document.body
  );
}
