import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Package, Layers } from 'lucide-react';

interface ScanRow {
  id: string;
  loc: string;
  ndc: string;
  scannedNdc: string;
  qty: number | null;
  medDesc: string;
  meridianDesc: string;
  generic: string;
  manufacturer: string;
  packSz: string;
  unitCost: number | null;
  packCost: number | null;
  extended: number | null;
  source: string;
}

interface ScanSummaryTabProps {
  scanRows: ScanRow[];
  sections: { id: string; full_section: string | null }[];
  allSectionRecords: Record<string, ScanRow[]>;
}

export const ScanSummaryTab = ({ scanRows, sections, allSectionRecords }: ScanSummaryTabProps) => {
  // Combine all scanned rows from all sections
  const allScannedRows = useMemo(() => {
    const rows: (ScanRow & { sectionName: string })[] = [];
    
    // Current section rows
    scanRows
      .filter(r => r.ndc || r.scannedNdc)
      .forEach(r => rows.push({ ...r, sectionName: r.loc }));
    
    // Other section records from localStorage (if not already included)
    Object.entries(allSectionRecords).forEach(([sectionId, sectionRows]) => {
      const section = sections.find(s => s.id === sectionId);
      sectionRows
        .filter(r => r.ndc || r.scannedNdc)
        .forEach(r => {
          // Avoid duplicates (check by id)
          if (!rows.some(existing => existing.id === r.id)) {
            rows.push({ ...r, sectionName: section?.full_section || r.loc });
          }
        });
    });
    
    return rows;
  }, [scanRows, sections, allSectionRecords]);

  // Calculate summary statistics
  const summary = useMemo(() => {
    let totalItems = allScannedRows.length;
    let totalQty = 0;
    let totalExtended = 0;
    let itemsWithPrice = 0;
    let itemsWithoutPrice = 0;

    allScannedRows.forEach(row => {
      totalQty += row.qty || 0;
      if (row.extended !== null && row.extended !== undefined) {
        totalExtended += row.extended;
        itemsWithPrice++;
      } else if (row.unitCost !== null && row.qty !== null) {
        totalExtended += row.unitCost * row.qty;
        itemsWithPrice++;
      } else {
        itemsWithoutPrice++;
      }
    });

    return {
      totalItems,
      totalQty,
      totalExtended,
      itemsWithPrice,
      itemsWithoutPrice,
    };
  }, [allScannedRows]);

  // Group by section for breakdown
  const sectionBreakdown = useMemo(() => {
    const breakdown: Record<string, { count: number; qty: number; total: number }> = {};
    
    allScannedRows.forEach(row => {
      const section = row.sectionName || 'Unknown';
      if (!breakdown[section]) {
        breakdown[section] = { count: 0, qty: 0, total: 0 };
      }
      breakdown[section].count++;
      breakdown[section].qty += row.qty || 0;
      if (row.extended !== null) {
        breakdown[section].total += row.extended;
      } else if (row.unitCost !== null && row.qty !== null) {
        breakdown[section].total += row.unitCost * row.qty;
      }
    });
    
    return Object.entries(breakdown).sort((a, b) => b[1].total - a[1].total);
  }, [allScannedRows]);

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Items</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalItems}</div>
            <p className="text-xs text-muted-foreground">
              {summary.totalQty} total quantity
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {formatCurrency(summary.totalExtended)}
            </div>
            <p className="text-xs text-muted-foreground">
              Extended price sum
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">With Price</CardTitle>
            <Badge variant="default" className="text-xs">{summary.itemsWithPrice}</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{summary.itemsWithPrice}</div>
            <p className="text-xs text-muted-foreground">
              Items with pricing data
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Missing Price</CardTitle>
            <Badge variant="destructive" className="text-xs">{summary.itemsWithoutPrice}</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{summary.itemsWithoutPrice}</div>
            <p className="text-xs text-muted-foreground">
              Items without pricing
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Section Breakdown */}
      {sectionBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Section Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {sectionBreakdown.map(([section, data]) => (
                <div key={section} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex-1">
                    <span className="font-medium text-sm">{section}</span>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <span className="text-muted-foreground">{data.count} items</span>
                    <span className="text-muted-foreground">{data.qty} qty</span>
                    <span className="font-semibold text-primary">{formatCurrency(data.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed Items Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scanned Items Detail</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="w-full whitespace-nowrap">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="min-w-[80px]">Section</TableHead>
                  <TableHead className="min-w-[120px]">NDC</TableHead>
                  <TableHead className="min-w-[200px]">Description</TableHead>
                  <TableHead className="min-w-[120px]">Manufacturer</TableHead>
                  <TableHead className="min-w-[80px] text-right">Qty</TableHead>
                  <TableHead className="min-w-[100px] text-right">Unit Cost</TableHead>
                  <TableHead className="min-w-[100px] text-right">Pack Cost</TableHead>
                  <TableHead className="min-w-[100px] text-right">Extended</TableHead>
                  <TableHead className="min-w-[80px]">Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allScannedRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                      No items scanned yet
                    </TableCell>
                  </TableRow>
                ) : (
                  allScannedRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium text-xs">{row.sectionName || row.loc || '-'}</TableCell>
                      <TableCell className="font-mono text-xs">{row.ndc || row.scannedNdc || '-'}</TableCell>
                      <TableCell className="text-sm max-w-[250px] truncate">
                        {row.medDesc || row.meridianDesc || row.generic || '-'}
                      </TableCell>
                      <TableCell className="text-xs">{row.manufacturer || '-'}</TableCell>
                      <TableCell className="text-right">{row.qty ?? '-'}</TableCell>
                      <TableCell className="text-right text-sm">
                        {row.unitCost !== null ? formatCurrency(row.unitCost) : '-'}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {row.packCost !== null ? formatCurrency(row.packCost) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-sm">
                        {row.extended !== null 
                          ? formatCurrency(row.extended) 
                          : row.unitCost !== null && row.qty !== null 
                            ? formatCurrency(row.unitCost * row.qty)
                            : '-'}
                      </TableCell>
                      <TableCell>
                        {row.source ? (
                          <Badge variant="outline" className="text-xs">{row.source}</Badge>
                        ) : '-'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};
