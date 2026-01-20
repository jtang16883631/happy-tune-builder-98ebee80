import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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

  // Group by section for breakdown
  const sectionBreakdown = useMemo(() => {
    const breakdown: Record<string, { count: number; total: number }> = {};
    
    allScannedRows.forEach(row => {
      const section = row.sectionName || 'Unknown';
      if (!breakdown[section]) {
        breakdown[section] = { count: 0, total: 0 };
      }
      breakdown[section].count++;
      if (row.extended !== null) {
        breakdown[section].total += row.extended;
      } else if (row.unitCost !== null && row.qty !== null) {
        breakdown[section].total += row.unitCost * row.qty;
      }
    });
    
    return Object.entries(breakdown).sort((a, b) => a[0].localeCompare(b[0]));
  }, [allScannedRows]);

  // Calculate totals
  const totals = useMemo(() => {
    let totalScans = 0;
    let totalValue = 0;
    
    sectionBreakdown.forEach(([, data]) => {
      totalScans += data.count;
      totalValue += data.total;
    });
    
    return { totalScans, totalValue };
  }, [sectionBreakdown]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Summary</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Section</TableHead>
              <TableHead className="text-right">Scans</TableHead>
              <TableHead className="text-right">Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sectionBreakdown.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                  No items scanned yet
                </TableCell>
              </TableRow>
            ) : (
              <>
                {sectionBreakdown.map(([section, data]) => (
                  <TableRow key={section}>
                    <TableCell className="font-medium">{section}</TableCell>
                    <TableCell className="text-right">{data.count}</TableCell>
                    <TableCell className="text-right">{formatCurrency(data.total)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/30 font-bold border-t-2">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{totals.totalScans}</TableCell>
                  <TableCell className="text-right text-primary">{formatCurrency(totals.totalValue)}</TableCell>
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
