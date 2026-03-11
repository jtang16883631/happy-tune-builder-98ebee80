/**
 * Styled Summary Sheet Builder
 * Creates a professional Meridian Inventory-style summary sheet
 * matching the exact template layout with logo, facility info,
 * alternating row colors, and accounting-format values.
 */

import * as XLSX from 'xlsx-js-style';
import type { WorkSheet } from 'xlsx-js-style';
import { COLUMN_INDICES, getColLetter } from './excelFormulas';

interface SummarySheetOptions {
  facilityName: string;
  templateName: string;
  dateStr: string;
  sectionSheetNames: string[];
  /** Optional address line */
  address?: string;
}

// Color constants
const HEADER_BG = '4472C4';      // Blue header background
const ALT_ROW_BG = 'D9E1F2';     // Light blue alternating row
const TOTAL_BG = '8EA9DB';        // Total row background
const WHITE = 'FFFFFF';
const BLACK = '000000';
const LINK_BLUE = '0000FF';

// Accounting number format: $ left-aligned, number right-aligned, dash for zero
const ACCOUNTING_FMT = '_("$"* #,##0.00_);_("$"* (#,##0.00);_("$"* "-"??_)';

const FONT_ARIAL_10 = { name: 'Arial', sz: 10 };
const FONT_ARIAL_10_BOLD = { name: 'Arial', sz: 10, bold: true };

/**
 * Create a professionally styled Summary worksheet matching the Meridian Inventory template.
 * Layout:
 *   Rows 1-6:  Logo area (image injected separately)
 *   Rows 7-12: Spacer
 *   Row 13:    Facility name (bold)
 *   Row 14:    Address (bold)
 *   Row 15:    Date (bold)
 *   Row 16:    Table header (Sections | Value) - blue #4472C4, white text
 *   Row 17+:   Section rows with alternating colors (white / #D9E1F2)
 *   +2 rows:   Total row with #8EA9DB background
 *   Then:      Certification block + signature
 */
export function createStyledSummarySheet(options: SummarySheetOptions): WorkSheet {
  const { facilityName, templateName, dateStr, sectionSheetNames, address } = options;

  const rows: any[][] = [];

  // Rows 1-12: Logo area + spacer (12 empty rows)
  for (let i = 0; i < 12; i++) rows.push([]);

  // Row 13: Facility name (col B)
  rows.push(['', facilityName || templateName]);
  // Row 14: Address (col B)
  rows.push(['', address || templateName]);
  // Row 15: Date (col B)
  rows.push(['', dateStr]);

  // Row 16: Table header (col B=Sections, C=Value)
  rows.push(['', 'Sections', '', 'Value']);

  // Row 17+: Section rows (placeholders)
  const sectionStartRow = 17;
  sectionSheetNames.forEach(() => {
    rows.push(['', '', '']);
  });

  // 2 spacer rows after sections
  const afterSectionsRow = sectionStartRow + sectionSheetNames.length;
  rows.push([]);
  rows.push([]);

  // Total row
  const totalRow = afterSectionsRow + 2;
  rows.push(['', '', '']);

  // Spacer rows before certification
  for (let i = 0; i < 5; i++) rows.push([]);

  // Certification block
  const certStartRow = totalRow + 6;
  rows.push(['', `This is to certify that the inventory of`]);
  rows.push(['', ` ${facilityName || templateName} ,`]);
  rows.push(['', address ? ` ${address}` : '']);
  rows.push(['', ` taken on the date of ${dateStr}`]);
  rows.push(['', ` calculated actual cost, totaled to`]);
  rows.push([]);
  rows.push([]);

  // Signature
  rows.push(['', 'Christopher Green']);
  rows.push(['', 'Chris Green, CEO/CFO']);
  rows.push(['', 'cgreen@meridianinventory.com']);

  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet(rows);

  // -- Column widths (match template: A=5.57, B=39.86, C=17) --
  ws['!cols'] = [
    { wch: 5.57 },  // A: empty spacer
    { wch: 39.86 }, // B: Sections
    { wch: 17 },    // C: Value ($)
    { wch: 17 },    // D: Value (number)
  ];

  // -- Merge cells --
  ws['!merges'] = [
    // Row 13-15: facility/address/date span B-D
    { s: { r: 12, c: 1 }, e: { r: 12, c: 3 } },
    { s: { r: 13, c: 1 }, e: { r: 13, c: 3 } },
    { s: { r: 14, c: 1 }, e: { r: 14, c: 3 } },
    // Row 16 header: "Sections" spans B-C
    { s: { r: 15, c: 1 }, e: { r: 15, c: 2 } },
  ];

  // -- Style: Row 13 Facility name (bold Arial 10) --
  setCellStyle(ws, 'B13', { font: FONT_ARIAL_10_BOLD });

  // -- Style: Row 14 Address (bold Arial 10) --
  setCellStyle(ws, 'B14', { font: FONT_ARIAL_10_BOLD });

  // -- Style: Row 15 Date (bold Arial 10) --
  setCellStyle(ws, 'B15', { font: FONT_ARIAL_10_BOLD });

  // -- Style: Row 16 Table header --
  const headerStyle = {
    font: { ...FONT_ARIAL_10_BOLD, color: { rgb: WHITE } },
    fill: { fgColor: { rgb: HEADER_BG } },
    alignment: { horizontal: 'center' as const },
    border: thinBorder(BLACK),
  };
  ws['B16'] = { t: 's', v: 'Sections', s: headerStyle };
  ws['C16'] = { t: 's', v: '', s: headerStyle }; // merged with B
  ws['D16'] = { t: 's', v: 'Value', s: { ...headerStyle, alignment: { horizontal: 'center' as const } } };

  // -- Section rows --
  sectionSheetNames.forEach((sheetName, index) => {
    const rowNum = sectionStartRow + index;
    const escapedName = sheetName.replace(/'/g, "''");
    const isEvenRow = index % 2 === 1; // 0-based: row 0=white, row 1=alt, row 2=white...
    const rowBg = isEvenRow ? ALT_ROW_BG : undefined;

    const baseCellStyle: any = {
      font: { ...FONT_ARIAL_10 },
      border: thinBorder('D9D9D9'),
    };
    if (rowBg) {
      baseCellStyle.fill = { fgColor: { rgb: rowBg } };
    }

    // Section name with hyperlink (column B)
    ws[`B${rowNum}`] = {
      t: 's',
      v: sheetName,
      l: { Target: `#'${escapedName}'!A1`, Tooltip: `Go to ${sheetName}` },
      s: {
        ...baseCellStyle,
        font: { ...FONT_ARIAL_10, color: { rgb: LINK_BLUE }, underline: true },
      },
    };

    // Column C: $ sign area (keep background)
    ws[`C${rowNum}`] = { t: 's', v: '$', s: baseCellStyle };

    // Value formula with accounting format (column D)
    const valueFormula = `'${escapedName}'!${getColLetter(COLUMN_INDICES.SUM_COLUMN)}1`;
    ws[`D${rowNum}`] = {
      t: 'n',
      f: valueFormula,
      z: ACCOUNTING_FMT,
      s: {
        ...baseCellStyle,
        numFmt: ACCOUNTING_FMT,
        alignment: { horizontal: 'right' as const },
      },
    };
  });

  // -- Total row --
  const firstSectionRow = sectionStartRow;
  const lastSectionRow = sectionStartRow + sectionSheetNames.length - 1;

  const totalStyle: any = {
    font: { ...FONT_ARIAL_10 },
    fill: { fgColor: { rgb: TOTAL_BG } },
    numFmt: ACCOUNTING_FMT,
    alignment: { horizontal: 'right' as const },
    border: {
      top: { style: 'medium', color: { rgb: BLACK } },
      bottom: { style: 'medium', color: { rgb: BLACK } },
      left: { style: 'medium', color: { rgb: BLACK } },
      right: { style: 'medium', color: { rgb: BLACK } },
    },
  };

  // Only C and D cells of total row get the background
  ws[`C${totalRow}`] = { t: 's', v: '$', s: { font: { ...FONT_ARIAL_10 }, fill: { fgColor: { rgb: TOTAL_BG } }, border: { top: { style: 'medium', color: { rgb: BLACK } }, bottom: { style: 'medium', color: { rgb: BLACK } }, left: { style: 'medium', color: { rgb: BLACK } } } } };
  ws[`D${totalRow}`] = {
    t: 'n',
    f: `SUM(D${firstSectionRow}:D${lastSectionRow})`,
    z: ACCOUNTING_FMT,
    s: totalStyle,
  };

  // -- Certification text styling (italic, Lucida Handwriting) --
  const certRows = [certStartRow, certStartRow + 1, certStartRow + 2, certStartRow + 3, certStartRow + 4];
  certRows.forEach(r => {
    setCellStyle(ws, `B${r}`, {
      font: { italic: true, sz: 10, name: 'Lucida Handwriting' },
    });
  });

  // Signature name styling
  const sigRow = certStartRow + 7;
  setCellStyle(ws, `B${sigRow}`, {
    font: { bold: true, sz: 14, name: 'Lucida Handwriting', underline: true },
  });

  // Title/role
  setCellStyle(ws, `B${sigRow + 1}`, { font: { sz: 10 } });

  // Email with hyperlink
  const emailCell = `B${sigRow + 2}`;
  if (ws[emailCell]) {
    ws[emailCell].s = { font: { color: { rgb: LINK_BLUE }, underline: true, sz: 10 } };
    ws[emailCell].l = { Target: 'mailto:cgreen@meridianinventory.com' };
  }

  // Update worksheet range
  const lastRow = sigRow + 2;
  ws['!ref'] = `A1:E${lastRow}`;

  return ws;
}

/** Helper: set style on existing cell */
function setCellStyle(ws: WorkSheet, ref: string, style: any) {
  if (ws[ref]) {
    ws[ref].s = style;
  }
}

/** Helper: thin border on all sides */
function thinBorder(color: string) {
  const side = { style: 'thin', color: { rgb: color } };
  return { top: side, bottom: side, left: side, right: side };
}
