// Cell validation utilities for Scan page styling and Excel exports

export interface ScanRowValidation {
  ndc?: string | null;
  scannedNdc?: string | null;
  qty?: number | null;
  misDivisor?: number | null;
  misCountMethod?: string | null;
  medDesc?: string | null;
  meridianDesc?: string | null;
  source?: string | null;
  auditCriteria?: string | null;
}

export type ValidationColor = 'yellow' | 'red' | 'gray' | 'orange' | null;

// Column indices for Excel exports
export const EXCEL_COLUMN_INDICES = {
  qty: 6,
  misDivisor: 7,
  misCountMethod: 8,
  medDesc: 10,
  meridianDesc: 11,
  source: 23,
  packCost: 24,
  unitCost: 25,
  extended: 26,
  auditCriteria: 29,
};

/**
 * Determine cell validation color based on field and row data
 */
export function getCellValidationColor(
  fieldKey: string,
  row: ScanRowValidation
): ValidationColor {
  const hasNdc = !!(row.ndc || row.scannedNdc);
  if (!hasNdc) return null;

  // QTY, MIS Divisor, MIS Count Method - yellow if empty when row has NDC
  const isRequiredField = ['qty', 'misDivisor', 'misCountMethod'].includes(fieldKey);
  if (isRequiredField) {
    const value = row[fieldKey as keyof ScanRowValidation];
    const isEmpty = value === null || value === undefined || value === '';
    if (isEmpty) return 'yellow';
  }

  // Med Desc / Meridian Desc logic - yellow if empty (no red at all)
  const isMedDescEmpty = !row.medDesc || (typeof row.medDesc === 'string' && row.medDesc.trim() === '');
  const isMeridianDescEmpty = !row.meridianDesc || (typeof row.meridianDesc === 'string' && row.meridianDesc.trim() === '');

  if (fieldKey === 'medDesc' && isMedDescEmpty) {
    return 'yellow';
  }
  if (fieldKey === 'meridianDesc' && isMeridianDescEmpty) {
    return 'yellow';
  }

  // Cost fields styling based on SOURCE
  const isCostField = ['packCost', 'unitCost', 'extended'].includes(fieldKey);
  if (isCostField) {
    const sourceVal = row.source || '';
    if (sourceVal === '') return 'yellow';
    if (typeof sourceVal === 'string' && sourceVal.toUpperCase().startsWith('MIS')) return 'gray';
  }

  // Audit criteria highlighting
  if (fieldKey === 'auditCriteria') {
    if (typeof row.auditCriteria === 'string' && row.auditCriteria.includes('need attention')) {
      return 'orange';
    }
  }

  return null;
}

/**
 * Get Tailwind CSS classes for cell validation styling
 * Uses black border and fill colors (no pink)
 */
export function getCellValidationClasses(color: ValidationColor): string {
  switch (color) {
    case 'yellow':
      return 'bg-yellow-200 dark:bg-yellow-900/50 border border-black dark:border-yellow-700';
    case 'red':
      return 'bg-red-500 dark:bg-red-600 border border-black dark:border-red-800';
    case 'gray':
      return 'bg-gray-200 dark:bg-gray-700/50 border border-black dark:border-gray-600';
    case 'orange':
      return 'bg-orange-200 dark:bg-orange-900/50 border border-black dark:border-orange-700 font-medium';
    default:
      return '';
  }
}

/**
 * Get Excel cell style for validation color
 * Returns xlsx-js-style compatible style object
 */
export function getExcelCellStyle(color: ValidationColor): object | null {
  const blackBorder = {
    top: { style: 'thin', color: { rgb: '000000' } },
    bottom: { style: 'thin', color: { rgb: '000000' } },
    left: { style: 'thin', color: { rgb: '000000' } },
    right: { style: 'thin', color: { rgb: '000000' } },
  };

  switch (color) {
    case 'yellow':
      return {
        fill: { fgColor: { rgb: 'FFFF99' }, patternType: 'solid' },
        border: blackBorder,
      };
    case 'red':
      return {
        fill: { fgColor: { rgb: 'FF6666' }, patternType: 'solid' },
        border: blackBorder,
      };
    case 'gray':
      return {
        fill: { fgColor: { rgb: 'D3D3D3' }, patternType: 'solid' },
        border: blackBorder,
      };
    case 'orange':
      return {
        fill: { fgColor: { rgb: 'FFD699' }, patternType: 'solid' },
        border: blackBorder,
        font: { bold: true },
      };
    default:
      return null;
  }
}

/**
 * Apply validation styling to an Excel worksheet
 */
export function applyValidationStylesToWorksheet(
  ws: any,
  rows: any[][],
  recordsStartRow: number = 1 // Usually 1 (after header row)
): void {
  const range = ws['!ref'] ? ws['!ref'].split(':') : ['A1', 'A1'];
  
  // Iterate through data rows (skip header)
  for (let rowIdx = recordsStartRow; rowIdx < rows.length; rowIdx++) {
    const rowData = rows[rowIdx];
    if (!rowData) continue;

    // Build validation row object from array indices
    const validationRow: ScanRowValidation = {
      ndc: rowData[4] as string,
      scannedNdc: rowData[5] as string,
      qty: rowData[6] as number,
      misDivisor: rowData[7] as number,
      misCountMethod: rowData[8] as string,
      medDesc: rowData[10] as string,
      meridianDesc: rowData[11] as string,
      source: rowData[23] as string,
      auditCriteria: rowData[29] as string,
    };

    // Check each validation column
    const columnsToCheck = [
      { idx: 6, key: 'qty' },
      { idx: 7, key: 'misDivisor' },
      { idx: 8, key: 'misCountMethod' },
      { idx: 10, key: 'medDesc' },
      { idx: 11, key: 'meridianDesc' },
      { idx: 24, key: 'packCost' },
      { idx: 25, key: 'unitCost' },
      { idx: 26, key: 'extended' },
      { idx: 29, key: 'auditCriteria' },
    ];

    for (const { idx, key } of columnsToCheck) {
      const color = getCellValidationColor(key, validationRow);
      if (color) {
        const style = getExcelCellStyle(color);
        if (style) {
          // Convert column index to Excel column letter
          const colLetter = getExcelColumnLetter(idx);
          const cellRef = `${colLetter}${rowIdx + 1}`; // +1 because Excel is 1-indexed
          
          if (ws[cellRef]) {
            ws[cellRef].s = style;
          } else {
            // Create cell if it doesn't exist
            ws[cellRef] = { v: rowData[idx] ?? '', s: style };
          }
        }
      }
    }
  }
}

/**
 * Convert column index to Excel column letter (0 -> A, 25 -> Z, 26 -> AA, etc.)
 */
export function getExcelColumnLetter(colIndex: number): string {
  let letter = '';
  let temp = colIndex;
  
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  
  return letter;
}
