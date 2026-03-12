/**
 * Excel Formula Utility
 * Adds Excel formulas for Unit Cost, Extended, and SUM columns
 */

import type { WorkSheet } from 'xlsx-js-style';

// Column indices (0-based) for the standard scan export headers
export const COLUMN_INDICES = {
  QTY: 6,           // Column G
  MIS_DIVISOR: 7,   // Column H
  PACK_COST: 24,    // Column Y
  UNIT_COST: 25,    // Column Z
  EXTENDED: 26,     // Column AA
  SUM_COLUMN: 27,   // Column AB (after Extended)
};

/**
 * Convert column index to Excel column letter (0 = A, 25 = Z, 26 = AA, etc.)
 */
export function getColLetter(colIndex: number): string {
  let result = '';
  let n = colIndex;
  while (n >= 0) {
    result = String.fromCharCode((n % 26) + 65) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

/**
 * Apply formulas to Unit Cost and Extended columns in worksheet
 * @param worksheet - The xlsx worksheet to modify
 * @param dataRowCount - Number of data rows (excluding header)
 * @param headerRow - The row number of the header (1-based, typically 1)
 */
export function applyExcelFormulas(
  worksheet: WorkSheet, 
  dataRowCount: number, 
  headerRow: number = 1
): void {
  if (dataRowCount <= 0) return;

  const packCostCol = getColLetter(COLUMN_INDICES.PACK_COST);   // Y
  const misDivisorCol = getColLetter(COLUMN_INDICES.MIS_DIVISOR); // H
  const unitCostCol = getColLetter(COLUMN_INDICES.UNIT_COST);   // Z
  const qtyCol = getColLetter(COLUMN_INDICES.QTY);               // G
  const extendedCol = getColLetter(COLUMN_INDICES.EXTENDED);     // AA

  const ACCOUNTING_FMT = '_("$"* #,##0.00_);_("$"* (#,##0.00);_("$"* "-"??_)';

  // Apply formulas to each data row
  for (let i = 0; i < dataRowCount; i++) {
    const rowNum = headerRow + 1 + i; // Excel row number (1-based)
    
    // Unit Cost formula: =IF(OR(Y{row}="",H{row}="",H{row}=0),"",Y{row}/H{row})
    const unitCostCell = `${unitCostCol}${rowNum}`;
    const unitCostFormula = `IF(OR(${packCostCol}${rowNum}="",${misDivisorCol}${rowNum}="",${misDivisorCol}${rowNum}=0),"",${packCostCol}${rowNum}/${misDivisorCol}${rowNum})`;
    
    const ucStyle = worksheet[unitCostCell]?.s || {};
    worksheet[unitCostCell] = {
      t: 'n',
      f: unitCostFormula,
      z: ACCOUNTING_FMT,
      s: { ...ucStyle, numFmt: ACCOUNTING_FMT }
    };
    
    // Extended formula: =IF(OR(Z{row}="",G{row}=""),"",Z{row}*G{row})
    const extendedCell = `${extendedCol}${rowNum}`;
    const extendedFormula = `IF(OR(${unitCostCol}${rowNum}="",${qtyCol}${rowNum}=""),"",${unitCostCol}${rowNum}*${qtyCol}${rowNum})`;
    
    const exStyle = worksheet[extendedCell]?.s || {};
    worksheet[extendedCell] = {
      t: 'n',
      f: extendedFormula,
      z: ACCOUNTING_FMT,
      s: { ...exStyle, numFmt: ACCOUNTING_FMT }
    };
  }

  // Add SUM formula in the header row next to Extended column
  const sumCell = `${getColLetter(COLUMN_INDICES.SUM_COLUMN)}${headerRow}`;
  const firstDataRow = headerRow + 1;
  const lastDataRow = headerRow + dataRowCount;
  const sumFormula = `SUM(${extendedCol}${firstDataRow}:${extendedCol}${lastDataRow})`;
  
  // Preserve existing style (e.g. yellow header from applyExcelHeaderAndDataStyles)
  const existingStyle = worksheet[sumCell]?.s || {};
  worksheet[sumCell] = {
    t: 'n',
    f: sumFormula,
    z: ACCOUNTING_FMT,
    s: {
      ...existingStyle,
      numFmt: ACCOUNTING_FMT
    }
  };

  // Expand worksheet range to include SUM column, but don't shrink if already wider
  if (worksheet['!ref']) {
    const range = worksheet['!ref'];
    const match = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (match) {
      const currentEndCol = match[3];
      const sumCol = getColLetter(COLUMN_INDICES.SUM_COLUMN);
      // Only expand, never shrink
      const newEndCol = currentEndCol.length > sumCol.length || 
        (currentEndCol.length === sumCol.length && currentEndCol >= sumCol) 
        ? currentEndCol : sumCol;
      worksheet['!ref'] = `${match[1]}${match[2]}:${newEndCol}${match[4]}`;
    }
  }
}

/**
 * Apply formulas to Summary sheet that reference section sheet totals
 * @param worksheet - The summary worksheet to modify
 * @param sectionSheetNames - Array of section sheet names in order
 * @param startRow - First row of section data in summary (1-based)
 */
export function applySummaryFormulas(
  worksheet: WorkSheet,
  sectionSheetNames: string[],
  startRow: number = 6 // Row 6 is typically first section row after headers
): void {
  const valueCol = 'C'; // Column C contains the Value
  const scansCol = 'B'; // Column B contains the Scans count
  
  // For each section, add formula that references the section sheet's SUM cell
  sectionSheetNames.forEach((sheetName, index) => {
    const rowNum = startRow + index;
    const escapedName = sheetName.replace(/'/g, "''"); // Escape single quotes
    
    // Value formula: ='SheetName'!AB1 (the SUM formula in header row)
    const valueCell = `${valueCol}${rowNum}`;
    const valueFormula = `'${escapedName}'!${getColLetter(COLUMN_INDICES.SUM_COLUMN)}1`;
    
    worksheet[valueCell] = {
      t: 'n',
      f: valueFormula,
      z: '"$"#,##0.00',
      s: {
        numFmt: '"$"#,##0.00'
      }
    };
    
    // Scans count formula: =COUNTA('SheetName'!A:A)-1 (count non-empty cells minus header)
    const scansCell = `${scansCol}${rowNum}`;
    const scansFormula = `COUNTA('${escapedName}'!A:A)-1`;
    
    worksheet[scansCell] = {
      t: 'n',
      f: scansFormula
    };
  });
  
  // Add total formulas at the bottom
  if (sectionSheetNames.length > 0) {
    const totalRow = startRow + sectionSheetNames.length + 1; // +1 for empty row
    const firstSectionRow = startRow;
    const lastSectionRow = startRow + sectionSheetNames.length - 1;
    
    // Total Scans formula
    const totalScansCell = `${scansCol}${totalRow}`;
    worksheet[totalScansCell] = {
      t: 'n',
      f: `SUM(${scansCol}${firstSectionRow}:${scansCol}${lastSectionRow})`,
      s: { font: { bold: true } }
    };
    
    // Total Value formula
    const totalValueCell = `${valueCol}${totalRow}`;
    worksheet[totalValueCell] = {
      t: 'n',
      f: `SUM(${valueCol}${firstSectionRow}:${valueCol}${lastSectionRow})`,
      z: '"$"#,##0.00',
      s: { 
        font: { bold: true },
        numFmt: '"$"#,##0.00'
      }
    };
  }
}
