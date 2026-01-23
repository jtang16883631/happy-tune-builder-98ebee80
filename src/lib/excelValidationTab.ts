/**
 * Excel Validation Tab Utility
 * Creates a Validation sheet with balance checks and analytics
 */

import type { WorkSheet, WorkBook } from 'xlsx-js-style';
import * as XLSX from 'xlsx-js-style';
import { getColLetter, COLUMN_INDICES } from './excelFormulas';

export interface SectionAnalytics {
  section: string;
  employee: string;
  timeIn: string | null;
  timeOut: string | null;
  minHours: number;
  entryCount: number;
  sumOfEntries: number;
}

export interface EmployeeAnalytics {
  employee: string;
  filesCompiled: number;
  sectionsCounted: string;
  firstRecordTime: string | null;
  lastRecordTime: string | null;
  entryCount: number;
  sumOfEntries: number;
}

export interface BalanceCheckRow {
  dataSheet: string;
  fromSummary: number;
  fromMaster: number;
  difference: number;
}

/**
 * Parse time string to comparable value (minutes from midnight)
 */
function parseTimeToMinutes(timeStr: string | null): number | null {
  if (!timeStr) return null;
  
  // Try to parse various time formats
  const match = timeStr.match(/(\d{1,2}):(\d{2}):?(\d{2})?\s*(AM|PM)?/i);
  if (!match) return null;
  
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = match[4]?.toUpperCase();
  
  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  
  return hours * 60 + minutes;
}

/**
 * Format minutes difference to hours with 2 decimal places
 */
function formatHoursDiff(minIn: number | null, minOut: number | null): number {
  if (minIn === null || minOut === null) return 0;
  const diff = minOut - minIn;
  return Math.round((diff / 60) * 100) / 100;
}

/**
 * Get employee ID from REC field (e.g., "JiaweiT-001" -> "JiaweiT")
 */
function getEmployeeFromRec(rec: string | null): string {
  if (!rec) return 'Unknown';
  const match = rec.match(/^([A-Za-z]+[A-Za-z]?)/);
  return match ? match[1] : 'Unknown';
}

/**
 * Build validation data from scan records
 */
export function buildValidationData(
  sections: Array<{ full_section?: string; sect?: string }>,
  sectionRecords: Record<string, any[]>,
  sectionSheetNames: string[]
): {
  balanceChecks: BalanceCheckRow[];
  employeeAnalytics: EmployeeAnalytics[];
  sectionAnalytics: SectionAnalytics[];
  totalSheets: number;
  inBalance: boolean;
} {
  const balanceChecks: BalanceCheckRow[] = [];
  const sectionAnalyticsMap: Map<string, SectionAnalytics> = new Map();
  const employeeMap: Map<string, {
    sections: Set<string>;
    times: number[];
    timeStrings: string[];
    entryCount: number;
    sumOfEntries: number;
  }> = new Map();

  let totalFromSummary = 0;
  let totalFromMaster = 0;

  sections.forEach((section, index) => {
    const sectionName = sectionSheetNames[index] || section.full_section || section.sect || 'Unknown';
    const records = sectionRecords[Object.keys(sectionRecords)[index]] || [];
    
    // Calculate section total from records
    let sectionTotal = 0;
    records.forEach(record => {
      const extended = record.extended ?? 0;
      if (typeof extended === 'number') {
        sectionTotal += extended;
      }
    });

    totalFromSummary += sectionTotal;
    totalFromMaster += sectionTotal;

    // Group by employee within section
    const employeesInSection: Map<string, {
      times: number[];
      timeStrings: string[];
      entryCount: number;
      sumOfEntries: number;
    }> = new Map();

    records.forEach(record => {
      const employee = getEmployeeFromRec(record.rec);
      const time = record.time || null;
      const extended = record.extended ?? 0;
      const timeMinutes = parseTimeToMinutes(time);

      if (!employeesInSection.has(employee)) {
        employeesInSection.set(employee, { times: [], timeStrings: [], entryCount: 0, sumOfEntries: 0 });
      }
      const empData = employeesInSection.get(employee)!;
      if (timeMinutes !== null) {
        empData.times.push(timeMinutes);
        empData.timeStrings.push(time);
      }
      empData.entryCount += 1;
      if (typeof extended === 'number') {
        empData.sumOfEntries += extended;
      }

      // Also aggregate for employee analytics
      if (!employeeMap.has(employee)) {
        employeeMap.set(employee, { sections: new Set(), times: [], timeStrings: [], entryCount: 0, sumOfEntries: 0 });
      }
      const globalEmpData = employeeMap.get(employee)!;
      globalEmpData.sections.add(sectionName);
      if (timeMinutes !== null) {
        globalEmpData.times.push(timeMinutes);
        globalEmpData.timeStrings.push(time);
      }
      globalEmpData.entryCount += 1;
      if (typeof extended === 'number') {
        globalEmpData.sumOfEntries += extended;
      }
    });

    // Build section analytics for each employee in this section
    employeesInSection.forEach((empData, employee) => {
      const sortedTimes = [...empData.times].sort((a, b) => a - b);
      const sortedTimeStrings = empData.timeStrings.sort((a, b) => {
        const ma = parseTimeToMinutes(a) || 0;
        const mb = parseTimeToMinutes(b) || 0;
        return ma - mb;
      });
      
      const key = `${sectionName}_${employee}`;
      sectionAnalyticsMap.set(key, {
        section: sectionName,
        employee,
        timeIn: sortedTimeStrings[0] || null,
        timeOut: sortedTimeStrings[sortedTimeStrings.length - 1] || null,
        minHours: formatHoursDiff(sortedTimes[0] || null, sortedTimes[sortedTimes.length - 1] || null),
        entryCount: empData.entryCount,
        sumOfEntries: Math.round(empData.sumOfEntries * 100) / 100,
      });
    });

    // Balance check (Summary vs Master will be same since we're using same source)
    balanceChecks.push({
      dataSheet: sectionName,
      fromSummary: Math.round(sectionTotal * 100) / 100,
      fromMaster: Math.round(sectionTotal * 100) / 100,
      difference: 0,
    });
  });

  // Build employee analytics
  const employeeAnalytics: EmployeeAnalytics[] = [];
  employeeMap.forEach((data, employee) => {
    const sortedTimeStrings = data.timeStrings.sort((a, b) => {
      const ma = parseTimeToMinutes(a) || 0;
      const mb = parseTimeToMinutes(b) || 0;
      return ma - mb;
    });

    employeeAnalytics.push({
      employee,
      filesCompiled: data.sections.size,
      sectionsCounted: Array.from(data.sections).join(', '),
      firstRecordTime: sortedTimeStrings[0] || null,
      lastRecordTime: sortedTimeStrings[sortedTimeStrings.length - 1] || null,
      entryCount: data.entryCount,
      sumOfEntries: Math.round(data.sumOfEntries * 100) / 100,
    });
  });

  // Sort by employee name
  employeeAnalytics.sort((a, b) => a.employee.localeCompare(b.employee));

  const sectionAnalytics = Array.from(sectionAnalyticsMap.values());

  return {
    balanceChecks,
    employeeAnalytics,
    sectionAnalytics,
    totalSheets: sections.length,
    inBalance: totalFromSummary === totalFromMaster,
  };
}

/**
 * Create the Validation worksheet with formulas for dynamic "From Summary" column
 * @param summaryStartRow - The row number in Summary sheet where section data starts (1-based)
 */
export function createValidationWorksheet(
  balanceChecks: BalanceCheckRow[],
  employeeAnalytics: EmployeeAnalytics[],
  sectionAnalytics: SectionAnalytics[],
  totalSheets: number,
  inBalance: boolean,
  summaryStartRow: number = 6 // Default matches applySummaryFormulas
): WorkSheet {
  // Now rebuild with all columns
  const finalRows: any[][] = [];

  // Row 0: Header
  finalRows.push([
    'Total # Sheets:', totalSheets, '', '# In Balance', '', // inBalance will be formula
    '', 'Files Compiled', 'Employee', 'Sections Counted', '', 'First Record Time', 'Last Record Time', '# of Entries', 'Sum of Entries',
    '', 'Section', 'Employee ID', 'Time In', 'Time Out', 'Min Hours', '# of Entries', 'Sum of Entries'
  ]);

  // Row 1: Empty
  finalRows.push([]);

  // Row 2: Sub-headers
  finalRows.push([
    '', 'Inventory Value', '', '', '',
    '', 'Employee Analytics', '', '', '', '', '', '', '',
    '', 'Sections Analytics', '', '', '', '', '', ''
  ]);

  // Row 3: Column headers
  finalRows.push([
    'Data Sheet', 'From Summary', 'From Master', 'Difference', '',
    '', 'Files Compiled', 'Employee', 'Sections Counted', '', 'First Record Time', 'Last Record Time', '# of Entries', 'Sum of Entries',
    '', 'Section', 'Employee ID', 'Time In', 'Time Out', 'Min Hours', '# of Entries', 'Sum of Entries'
  ]);

  // Data rows - align all three sections
  const maxRows = Math.max(balanceChecks.length, employeeAnalytics.length, sectionAnalytics.length);
  
  for (let i = 0; i < maxRows; i++) {
    const balanceRow = balanceChecks[i];
    const empRow = employeeAnalytics[i];
    const secRow = sectionAnalytics[i];

    finalRows.push([
      // Balance check columns (A-E)
      balanceRow?.dataSheet || '',
      '', // From Summary - will be formula
      balanceRow ? balanceRow.fromMaster : '', // From Master - static value
      '', // Difference - will be formula
      '',
      // Employee analytics columns (F-N)
      '',
      empRow?.filesCompiled ?? '',
      empRow?.employee || '',
      empRow?.sectionsCounted || '',
      '',
      empRow?.firstRecordTime || '',
      empRow?.lastRecordTime || '',
      empRow?.entryCount ?? '',
      empRow?.sumOfEntries ?? '',
      // Section analytics columns (O-V)
      '',
      secRow?.section || '',
      secRow?.employee || '',
      secRow?.timeIn || '',
      secRow?.timeOut || '',
      secRow?.minHours ?? '',
      secRow?.entryCount ?? '',
      secRow?.sumOfEntries ?? '',
    ]);
  }

  const worksheet = XLSX.utils.aoa_to_sheet(finalRows);

  // Add formulas for "From Summary" (column B) and "Difference" (column D)
  // These reference the Summary sheet's Value column (C) which has formulas
  const dataStartRow = 5; // Row 5 is first data row (1-indexed)
  
  for (let i = 0; i < balanceChecks.length; i++) {
    const excelRow = dataStartRow + i;
    const summaryRow = summaryStartRow + i;
    
    // From Summary formula: =Summary!C{row} - references the Value column in Summary sheet
    const fromSummaryCell = `B${excelRow}`;
    worksheet[fromSummaryCell] = {
      t: 'n',
      f: `Summary!C${summaryRow}`,
      z: '"$"#,##0.00'
    };
    
    // Difference formula: =B{row}-C{row}
    const differenceCell = `D${excelRow}`;
    worksheet[differenceCell] = {
      t: 'n',
      f: `B${excelRow}-C${excelRow}`,
      z: '"$"#,##0.00'
    };
  }

  // Add formula for "In Balance" check (E1) - checks if all differences are 0
  if (balanceChecks.length > 0) {
    const firstDataRow = dataStartRow;
    const lastDataRow = dataStartRow + balanceChecks.length - 1;
    worksheet['E1'] = {
      t: 's',
      f: `IF(SUMPRODUCT(ABS(D${firstDataRow}:D${lastDataRow}))=0,"TRUE","FALSE")`,
      s: {
        font: { bold: true }
      }
    };
  }

  // Set column widths
  worksheet['!cols'] = [
    { wch: 25 }, // A - Data Sheet
    { wch: 15 }, // B - From Summary
    { wch: 15 }, // C - From Master
    { wch: 12 }, // D - Difference
    { wch: 3 },  // E - spacer
    { wch: 3 },  // F - spacer
    { wch: 12 }, // G - Files Compiled
    { wch: 15 }, // H - Employee
    { wch: 30 }, // I - Sections Counted
    { wch: 3 },  // J - spacer
    { wch: 15 }, // K - First Record Time
    { wch: 15 }, // L - Last Record Time
    { wch: 10 }, // M - # of Entries
    { wch: 12 }, // N - Sum of Entries
    { wch: 3 },  // O - spacer
    { wch: 25 }, // P - Section
    { wch: 15 }, // Q - Employee ID
    { wch: 12 }, // R - Time In
    { wch: 12 }, // S - Time Out
    { wch: 10 }, // T - Min Hours
    { wch: 10 }, // U - # of Entries
    { wch: 12 }, // V - Sum of Entries
  ];

  // Apply currency formatting to static value columns
  const currencyCols = [2, 13, 21]; // C, N, V (0-indexed) - B and D are formulas with format already
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  
  for (let R = 4; R <= range.e.r; R++) { // Start from data rows
    currencyCols.forEach(C => {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
      if (worksheet[cellRef] && typeof worksheet[cellRef].v === 'number') {
        worksheet[cellRef].z = '"$"#,##0.00';
      }
    });
  }

  return worksheet;
}

/**
 * Add hyperlinks to Summary sheet section names
 */
export function addSummaryHyperlinks(
  summaryWorksheet: WorkSheet,
  sectionSheetNames: string[],
  startRow: number = 6
): void {
  const sectionCol = 'A'; // Column A contains section names
  
  sectionSheetNames.forEach((sheetName, index) => {
    const rowNum = startRow + index;
    const cellRef = `${sectionCol}${rowNum}`;
    
    if (summaryWorksheet[cellRef]) {
      // Add hyperlink to the section sheet
      const escapedName = sheetName.replace(/'/g, "''");
      
      // Set the hyperlink
      if (!summaryWorksheet['!hyperlinks']) {
        summaryWorksheet['!hyperlinks'] = [];
      }
      
      // Use internal link format for Excel
      summaryWorksheet[cellRef].l = {
        Target: `#'${escapedName}'!A1`,
        Tooltip: `Go to ${sheetName}`
      };
      
      // Style as hyperlink (blue, underlined)
      summaryWorksheet[cellRef].s = {
        font: { 
          color: { rgb: '0000FF' },
          underline: true
        }
      };
    }
  });
}
